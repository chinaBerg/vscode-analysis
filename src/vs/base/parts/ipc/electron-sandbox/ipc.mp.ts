/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { ipcMessagePort, ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';

interface IMessageChannelResult {
	nonce: string;
	port: MessagePort;
	source: unknown;
}

/**
 * 向主进程发送{{requestChannel}}消息，并监听主进程响应的{{responseChannel}}消息，
 * 返回MessageChannel创建的信道端口
 */
export async function acquirePort(requestChannel: string | undefined, responseChannel: string, nonce = generateUuid()): Promise<MessagePort> {

	// Get ready to acquire the message port from the
	// provided `responseChannel` via preload helper.
	// 监听主进程的响应，
	// ipcMessagePort.acquire本质利用ipcRenderer.on收听消息并根据nonce进行消息过滤，同时
	// 将收到的消息转为触发一次window.postMessage事件，因此业务中真正收听主进程的消息还需要通过window.addEventListener('message')
	ipcMessagePort.acquire(responseChannel, nonce);

	// If a `requestChannel` is provided, we are in charge
	// to trigger acquisition of the message port from main
	// 发送请求
	if (typeof requestChannel === 'string') {
		ipcRenderer.send(requestChannel, nonce);
	}

	// Wait until the main side has returned the `MessagePort`
	// We need to filter by the `nonce` to ensure we listen
	// to the right response.
	// 监听window的message事件，实际是接收主进程响应的{{responseChannel}}消息。
	// 返回收到的MessageChannel的port2端口，该端口实际是由通信的目标进程（例如sharedProcess）返回的，主进程只中间转发了回来
	const onMessageChannelResult = Event.fromDOMEventEmitter<IMessageChannelResult>(window, 'message', (e: MessageEvent) => ({ nonce: e.data, port: e.ports[0], source: e.source }));
	const { port } = await Event.toPromise(Event.once(Event.filter(onMessageChannelResult, e => e.nonce === nonce && e.source === window)));

	return port;
}
