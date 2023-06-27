/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IPCClient } from 'vs/base/parts/ipc/common/ipc';
import { Protocol as ElectronProtocol } from 'vs/base/parts/ipc/common/ipc.electron';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';

/**
 * An implementation of `IPCClient` on top of Electron `ipcRenderer` IPC communication
 * provided from sandbox globals (via preload script).
 * 基于Electron ipcRenderer的IPCClient客户端实现，
 * 用于和“基于Electron ipcMain”的IPCServer服务端进行ipc通信
 */
export class Client extends IPCClient implements IDisposable {

	private protocol: ElectronProtocol;

	// 创建基于ipcRenderer实现的Protcol
	private static createProtocol(): ElectronProtocol {
		// 创建基于ipcRenderer实现的监听'vscode:message'事件的VSCode事件侦听器
		const onMessage = Event.fromNodeEventEmitter<VSBuffer>(ipcRenderer, 'vscode:message', (_, message) => VSBuffer.wrap(message));
		// 向IPCServer发送'vscode:hello'握手事件
		ipcRenderer.send('vscode:hello');

		return new ElectronProtocol(ipcRenderer, onMessage);
	}

	constructor(id: string) {
		const protocol = Client.createProtocol();
		super(protocol, id);

		this.protocol = protocol;
	}

	override dispose(): void {
		this.protocol.disconnect();
	}
}
