/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol, IPCClient } from 'vs/base/parts/ipc/common/ipc';

/**
 * Declare minimal `MessageEvent` and `MessagePort` interfaces here
 * so that this utility can be used both from `browser` and
 * `electron-main` namespace where message ports are available.
 */

export interface MessageEvent {

	/**
	 * For our use we only consider `Uint8Array` a valid data transfer
	 * via message ports because our protocol implementation is buffer based.
	 */
	data: Uint8Array;
}

/**
 * 定义MessagePort接口，
 * 和web端的MessagePort的mdn定义一样
 */
export interface MessagePort {

	addEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;
	removeEventListener(type: 'message', listener: (this: MessagePort, e: MessageEvent) => unknown): void;

	postMessage(message: Uint8Array): void;

	start(): void;
	close(): void;
}

/**
 * The MessagePort `Protocol` leverages MessagePort style IPC communication
 * for the implementation of the `IMessagePassingProtocol`. That style of API
 * is a simple `onmessage` / `postMessage` pattern.
 * 基于MessagePort实现的进程间通信协议，本质是一种onmessage/postMessage的通信
 */
export class Protocol implements IMessagePassingProtocol {

	// 创建基于DOM事件实现的监听addEventListener('message')事件的VSCode事件侦听器,
	// 且将message收到的数据转换成VSBuffer
	readonly onMessage = Event.fromDOMEventEmitter<VSBuffer>(this.port, 'message', (e: MessageEvent) => VSBuffer.wrap(e.data));

	constructor(private port: MessagePort) {

		// we must call start() to ensure messages are flowing
		port.start();
	}

	// 发送消息的实现，借助port.postMessage实现
	send(message: VSBuffer): void {
		this.port.postMessage(message.buffer);
	}

	// 断开连接
	disconnect(): void {
		this.port.close();
	}
}

/**
 * An implementation of a `IPCClient` on top of MessagePort style IPC communication.
 * 基于MessagePort风格实现的信道客户端，
 * 用于ELectron主进程、渲染进程等的MessagePort风格信道客户端都会基于此类进行扩展或重写，
 * 比如主进程的MessageChannel的api不一样，因此其需要做一层API转换
 */
export class Client extends IPCClient implements IDisposable {

	private protocol: Protocol;

	constructor(port: MessagePort, clientId: string) {
		const protocol = new Protocol(port);
		super(protocol, clientId);

		this.protocol = protocol;
	}

	override dispose(): void {
		this.protocol.disconnect();
	}
}
