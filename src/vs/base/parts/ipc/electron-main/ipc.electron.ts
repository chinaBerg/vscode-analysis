/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebContents } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ClientConnectionEvent, IPCServer } from 'vs/base/parts/ipc/common/ipc';
import { Protocol as ElectronProtocol } from 'vs/base/parts/ipc/common/ipc.electron';

interface IIPCEvent {
	event: { sender: WebContents };
	message: Buffer | null;
}

// 基于ipcMain转换成VSCode事件侦听器，并依据sender.id过滤匹配事件，并将触发的数据转换成VSBuffer
function createScopedOnMessageEvent(senderId: number, eventName: string): Event<VSBuffer | null> {
	// 创建一个onMessage的VSCode事件侦听器
	const onMessage = Event.fromNodeEventEmitter<IIPCEvent>(validatedIpcMain, eventName, (event, message) => ({ event, message }));
	// 基于onMessage事件进行过滤，筛选匹配的id
	const onMessageFromSender = Event.filter(onMessage, ({ event }) => event.sender.id === senderId);

	// 对返回的数据进行转换，使用VSBuffer进行包裹
	return Event.map(onMessageFromSender, ({ message }) => message ? VSBuffer.wrap(message) : message);
}

/**
 * An implementation of `IPCServer` on top of Electron `ipcMain` API.
 * 主进程 Electron IPC 服务
 */
export class Server extends IPCServer {

	private static readonly Clients = new Map<number, IDisposable>();

	// 创建客户端连接的VSCode Emitter事件
	private static getOnDidClientConnect(): Event<ClientConnectionEvent> {
		// 创建一个onHello事件（基于IpcMain包装成VSCode的Event事件侦听器）
		// onHello在未来执行后会利用ipcMain.on侦听'vscode:hello'事件
		// sender是ipcMain.on接收到的WebContent，具体参考electron ipcMain.on api的event参数 @see https://www.electronjs.org/zh/docs/latest/api/structures/ipc-main-event
		const onHello = Event.fromNodeEventEmitter<WebContents>(validatedIpcMain, 'vscode:hello', ({ sender }) => sender);

		// Event.map会基于onHello创建一个新的事件侦听器快照OnDidClientConnect，
		// 新的事件侦听器会在'vscode:hello'事件触发后，对触发事件的数据调用map的第二个参数进行转换，
		// 转换处理后的数据包含一个通信协议protocol，一个断开连接的函数onDidClientDisconnect，
		// 并且最终触发OnDidClientConnect添加的事件回调并传入转换后的数据（在IPCServer的构造函数中添加的回调）
		return Event.map(onHello, webContents => {
			// 根据渲染进程窗口id判断客户端是否已存在连接
			const id = webContents.id;
			const client = Server.Clients.get(id);

			// 客户端已存在，触发一次onDidClientReconnect事件
			client?.dispose();

			const onDidClientReconnect = new Emitter<void>();
			Server.Clients.set(id, toDisposable(() => onDidClientReconnect.fire()));

			// 创建'vscode:message'的VSCode事件侦听器
			const onMessage = createScopedOnMessageEvent(id, 'vscode:message') as Event<VSBuffer>;
			// Event.any返回一个新的事件onDidClientDisconnect，
			// 并且Event.any判断如下事件只要某个事件触发了，就会触发onDidClientDisconnect侦听的事件：
			// - 'vscode:disconnect'的VSCode事件
			// - onDidClientReconnect.event 客户端重新连接时
			const onDidClientDisconnect = Event.any(Event.signal(createScopedOnMessageEvent(id, 'vscode:disconnect')), onDidClientReconnect.event);
			// 创建主进程的Electron通信协议
			// sender 是 webContents，onMessage本质上是ipcMain的'vscode:message'事件侦听器
			const protocol = new ElectronProtocol(webContents, onMessage);

			return { protocol, onDidClientDisconnect };
		});
	}

	constructor() {
		// 继承父类，并且出入客户端连接事件的侦听器
		super(Server.getOnDidClientConnect());
	}
}
