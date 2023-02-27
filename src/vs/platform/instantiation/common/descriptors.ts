/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SyncDescriptor用于对传入的ctor类进行简单包装，
 * 仅仅是对ctor类打个标记，
 * 依赖注入逻辑中会对通过SyncDescriptor标记的类进行特殊处理，用于不立刻实例化ctor类，而是注入的时候再进行实例化
 */
export class SyncDescriptor<T> {

	readonly ctor: any;
	readonly staticArguments: any[];
	readonly supportsDelayedInstantiation: boolean;

	// 仅存一下相关参数
	constructor(ctor: new (...args: any[]) => T, staticArguments: any[] = [], supportsDelayedInstantiation: boolean = false) {
		this.ctor = ctor;
		this.staticArguments = staticArguments;
		this.supportsDelayedInstantiation = supportsDelayedInstantiation;
	}
}

export interface SyncDescriptor0<T> {
	readonly ctor: new () => T;
}
