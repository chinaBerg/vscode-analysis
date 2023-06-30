/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

// CancellationToken
// 取消令牌，
// 是一种用于取消操作的机制，通常作为参数传递给需要取消的操作或任务，操作或任务可以通过检查CancellationToken的状态来确定是否需要取消操作。
// 通过使用CancellationToken，VSCode可以提供一种灵活的机制来取消长时间运行的操作
export interface CancellationToken {

	/**
	 * A flag signalling is cancellation has been requested.
	 * 指示是否已经被取消
	 */
	readonly isCancellationRequested: boolean;

	/**
	 * An event which fires when cancellation is requested. This event
	 * only ever fires `once` as cancellation can only happen once. Listeners
	 * that are registered after cancellation will be called (next event loop run),
	 * but also only once.
	 *
	 * @event
	 */
	readonly onCancellationRequested: (listener: (e: any) => any, thisArgs?: any, disposables?: IDisposable[]) => IDisposable;
}

// 快捷事件，添加后会立即触发回调
const shortcutEvent: Event<any> = Object.freeze(function (callback, context?): IDisposable {
	const handle = setTimeout(callback.bind(context), 0);
	return { dispose() { clearTimeout(handle); } };
});

export namespace CancellationToken {

	// 判断是否为CancellationToken
	export function isCancellationToken(thing: unknown): thing is CancellationToken {
		if (thing === CancellationToken.None || thing === CancellationToken.Cancelled) {
			return true;
		}
		if (thing instanceof MutableToken) {
			return true;
		}
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		return typeof (thing as CancellationToken).isCancellationRequested === 'boolean'
			&& typeof (thing as CancellationToken).onCancellationRequested === 'function';
	}

	export const None = Object.freeze<CancellationToken>({
		isCancellationRequested: false,
		onCancellationRequested: Event.None
	});

	export const Cancelled = Object.freeze<CancellationToken>({
		isCancellationRequested: true,
		onCancellationRequested: shortcutEvent
	});
}

// 可变令牌
class MutableToken implements CancellationToken {

	private _isCancelled: boolean = false;
	private _emitter: Emitter<any> | null = null;

	// 取消操作，并处触发侦听的事件
	public cancel() {
		if (!this._isCancelled) {
			this._isCancelled = true;
			if (this._emitter) {
				this._emitter.fire(undefined);
				this.dispose();
			}
		}
	}

	// 是否已经取消
	get isCancellationRequested(): boolean {
		return this._isCancelled;
	}

	// 取消令牌的请求事件侦听器
	get onCancellationRequested(): Event<any> {
		// 已被取消，则返回一个快照事件，
		// 通过该快照事件侦听的事件回调会立即执行，
		// 因为令牌已经处于取消状态了，在此之后侦听的事件回调应该立即执行
		if (this._isCancelled) {
			return shortcutEvent;
		}
		// 先创建事件触发器，
		// 在此处初始化也是延迟初始化，尽量减少默认消耗
		if (!this._emitter) {
			this._emitter = new Emitter<any>();
		}
		// 返回侦听器
		return this._emitter.event;
	}

	public dispose(): void {
		if (this._emitter) {
			this._emitter.dispose();
			this._emitter = null;
		}
	}
}

// 用于生成CancellationToken的类
export class CancellationTokenSource {

	private _token?: CancellationToken = undefined;
	private _parentListener?: IDisposable = undefined;

	constructor(parent?: CancellationToken) {
		this._parentListener = parent && parent.onCancellationRequested(this.cancel, this);
	}

	// 获取令牌
	get token(): CancellationToken {
		// 令牌不存在时先创建
		if (!this._token) {
			// be lazy and create the token only when
			// actually needed
			this._token = new MutableToken();
		}
		return this._token;
	}

	// 取消操作
	cancel(): void {
		if (!this._token) {
			// save an object by returning the default
			// cancelled token when cancellation happens
			// before someone asks for the token
			// 取消操作发生在申请令牌之前，即.cancel()发生在.token之前，
			// 默认创建一个已被取消的令牌
			this._token = CancellationToken.Cancelled;

		} else if (this._token instanceof MutableToken) {
			// actually cancel
			// 调用取消逻辑
			this._token.cancel();
		}
	}

	dispose(cancel: boolean = false): void {
		if (cancel) {
			this.cancel();
		}
		this._parentListener?.dispose();
		if (!this._token) {
			// ensure to initialize with an empty token if we had none
			this._token = CancellationToken.None;

		} else if (this._token instanceof MutableToken) {
			// actually dispose
			this._token.dispose();
		}
	}
}
