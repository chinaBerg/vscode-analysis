/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

export interface Sender {
	send(channel: string, msg: unknown): void;
}

/**
 * The Electron `Protocol` leverages Electron style IPC communication (`ipcRenderer`, `ipcMain`)
 * for the implementation of the `IMessagePassingProtocol`. That style of API requires a channel
 * name for sending data.
 * Electron环境下的Protocol，
 * 需要从外部传入sender和onMessage，
 * 利用onMessage接收消息，send借助sender.send发送消息
 */
export class Protocol implements IMessagePassingProtocol {

	constructor(private sender: Sender, readonly onMessage: Event<VSBuffer>) { }

	send(message: VSBuffer): void {
		try {
			this.sender.send('vscode:message', message.buffer);
		} catch (e) {
			// systems are going down
		}
	}

	disconnect(): void {
		this.sender.send('vscode:disconnect', null);
	}
}
