/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor } from './descriptors';

export class ServiceCollection {

	// 服务集合的映射表
	private _entries = new Map<ServiceIdentifier<any>, any>();

	// 初始化将传入的参数添加进服务集合的映射表中
	constructor(...entries: [ServiceIdentifier<any>, any][]) {
		for (const [id, service] of entries) {
			this.set(id, service);
		}
	}

	// 将服务添加到映射表方法
	// 如果因存在服务，则覆盖并返回旧的服务
	set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> {
		const result = this._entries.get(id);
		this._entries.set(id, instanceOrDescriptor);
		return result;
	}

	// 检查是否依旧缓存了某个服务
	has(id: ServiceIdentifier<any>): boolean {
		return this._entries.has(id);
	}

	// 获取指定的服务
	get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		return this._entries.get(id);
	}
}
