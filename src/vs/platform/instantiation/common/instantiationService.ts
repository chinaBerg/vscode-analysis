/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleValue } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { illegalState } from 'vs/base/common/errors';
import { toDisposable } from 'vs/base/common/lifecycle';
import { SyncDescriptor, SyncDescriptor0 } from 'vs/platform/instantiation/common/descriptors';
import { Graph } from 'vs/platform/instantiation/common/graph';
import { GetLeadingNonServiceArgs, IInstantiationService, ServiceIdentifier, ServicesAccessor, _util } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { LinkedList } from 'vs/base/common/linkedList';

// TRACING
const _enableAllTracing = false
	// || "TRUE" // DO NOT CHECK IN!
	;

class CyclicDependencyError extends Error {
	constructor(graph: Graph<any>) {
		super('cyclic dependency between services');
		this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: \n${graph.toString()}`;
	}
}

// 引用服务
// 控制注册服务的代理访问以及服务实例创建等作用
export class InstantiationService implements IInstantiationService {

	declare readonly _serviceBrand: undefined;

	readonly _globalGraph?: Graph<string>;
	private _globalGraphImplicitDependency?: string;

	constructor(
		private readonly _services: ServiceCollection = new ServiceCollection(),
		private readonly _strict: boolean = false,
		private readonly _parent?: InstantiationService,
		private readonly _enableTracing: boolean = _enableAllTracing
	) {

		// 首先将自身添加为一个IInstantiationService服务
		this._services.set(IInstantiationService, this);
		this._globalGraph = _enableTracing ? _parent?._globalGraph ?? new Graph(e => e) : undefined;
	}

	createChild(services: ServiceCollection): IInstantiationService {
		return new InstantiationService(services, this._strict, this, this._enableTracing);
	}

	// invokeFunction会调用函数fn，并且fn函数内部可以通过accessor访问器来获取_services所有服务
	// accessor访问器在invokeFunction调用完成后即失效，失效后无法进行服务获取
	invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
		const _trace = Trace.traceInvocation(this._enableTracing, fn);
		// 控制服务是否失效的标志
		let _done = false;
		try {
			const accessor: ServicesAccessor = {
				get: <T>(id: ServiceIdentifier<T>) => {

					// 控制accessor访问器在invokeFunction执行完毕后不可再访问服务
					if (_done) {
						throw illegalState('service accessor is only valid during the invocation of its target method');
					}

					// 根据id从_services上获取服务
					const result = this._getOrCreateServiceInstance(id, _trace);
					// 服务不存在则抛出错误
					if (!result) {
						throw new Error(`[invokeFunction] unknown service '${id}'`);
					}
					// 返回获取的服务
					return result;
				}
			};
			return fn(accessor, ...args);
		} finally {
			// 函数执行完毕后，设置accessor访问器状态为失效状态，不可再进行访问
			_done = true;
			_trace.stop();
		}
	}

	createInstance<T>(descriptor: SyncDescriptor0<T>): T;
	createInstance<Ctor extends new (...args: any[]) => any, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;
	createInstance(ctorOrDescriptor: any | SyncDescriptor<any>, ...rest: any[]): any {
		let _trace: Trace;
		let result: any;
		if (ctorOrDescriptor instanceof SyncDescriptor) {
			_trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor.ctor);
			result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
		} else {
			_trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor);
			// 创建服务实例
			result = this._createInstance(ctorOrDescriptor, rest, _trace);
		}
		_trace.stop();
		return result;
	}

	private _createInstance<T>(ctor: any, args: any[] = [], _trace: Trace): T {

		// arguments defined by service decorators
		// 获取服务由装饰器定义的参数，及该服务注入的所有依赖
		const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
		const serviceArgs: any[] = [];
		// 获取所有依赖对应的服务
		for (const dependency of serviceDependencies) {
			const service = this._getOrCreateServiceInstance(dependency.id, _trace);
			// 服务不存在时且在strict状态下进行抛出错误
			if (!service) {
				this._throwIfStrict(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`, false);
			}
			serviceArgs.push(service);
		}

		// 获取第一个DI修饰的参数下标，用于后续判断实际传入的非DI参数与期望的非DI参数是否匹配
		// 如果没有依赖服务则为传入的实参的个数，后续判断逻辑则是匹配的，不用做额外处理了
		const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;

		// check for argument mismatches, adjust static args if needed
		// createInstance是传入的参数与类本身定义的DI参数之前的形参个数不匹配时
		// 进行参数的兜底处理，确保参数能正确匹配
		// 例如:
		//    createInstance(Ctor, arg1, arg2), Ctor定义时construcor(arg1, @IArg arg2: IArg)
		//    传入的非DI参数是2个，期望的是非DI参数1个，DI参数1个，因此期望的非DI参数部分匹配不上，
		//    则需要实例化时忽略实际传入的第二个非DI参数
		if (args.length !== firstServiceArgPos) {
			console.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);

			const delta = firstServiceArgPos - args.length;
			if (delta > 0) {
				// 传入的非DI参数个数小于期望的非DI形参个数时，
				// 在实例化时使用empty值补足缺失的部分
				args = args.concat(new Array(delta));
			} else {
				// 传入的非DI参数个数大于期望的非DI形参个数时，
				// 在实例化时忽略多传入的部分
				args = args.slice(0, firstServiceArgPos);
			}
		}

		// now create the instance
		// 实例化ctor，并且把传入的服务和依赖注入的所有服务作为实例化ctor的参数（修正传入和期望的之后）
		return Reflect.construct<any, T>(ctor, args.concat(serviceArgs));
	}

	private _setServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
		if (this._services.get(id) instanceof SyncDescriptor) {
			this._services.set(id, instance);
		} else if (this._parent) {
			this._parent._setServiceInstance(id, instance);
		} else {
			throw new Error('illegalState - setting UNKNOWN service instance');
		}
	}

	// 获取服务实例或descriptor
	private _getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> {
		// 在传入的_services上根据id获取对应服务的实例或者descriptor
		const instanceOrDesc = this._services.get(id);
		// 如果传入了父服务，未找到时则尝试从父服务上查找
		if (!instanceOrDesc && this._parent) {
			return this._parent._getServiceInstanceOrDescriptor(id);
		} else {
			// 找到即返回值
			return instanceOrDesc;
		}
	}

	// 获取或创建服务实例
	protected _getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>, _trace: Trace): T {
		if (this._globalGraph && this._globalGraphImplicitDependency) {
			this._globalGraph.insertEdge(this._globalGraphImplicitDependency, String(id));
		}
		// 根据id获取服务或者descriptor
		const thing = this._getServiceInstanceOrDescriptor(id);
		// 如果服务是SyncDescriptor的实例，则通过安全的方式创建并缓存服务实例
		// 否则的话直接返回获取的服务
		if (thing instanceof SyncDescriptor) {
			return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
		} else {
			_trace.branch(id, false);
			return thing;
		}
	}

	private readonly _activeInstantiations = new Set<ServiceIdentifier<any>>();


	private _safeCreateAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {
		if (this._activeInstantiations.has(id)) {
			throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
		}
		this._activeInstantiations.add(id);
		try {
			return this._createAndCacheServiceInstance(id, desc, _trace);
		} finally {
			this._activeInstantiations.delete(id);
		}
	}

	private _createAndCacheServiceInstance<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>, _trace: Trace): T {

		type Triple = { id: ServiceIdentifier<any>; desc: SyncDescriptor<any>; _trace: Trace };
		const graph = new Graph<Triple>(data => data.id.toString());

		let cycleCount = 0;
		const stack = [{ id, desc, _trace }];
		while (stack.length) {
			const item = stack.pop()!;
			graph.lookupOrInsertNode(item);

			// a weak but working heuristic for cycle checks
			if (cycleCount++ > 1000) {
				throw new CyclicDependencyError(graph);
			}

			// check all dependencies for existence and if they need to be created first
			for (const dependency of _util.getServiceDependencies(item.desc.ctor)) {

				const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
				if (!instanceOrDesc) {
					this._throwIfStrict(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`, true);
				}

				// take note of all service dependencies
				this._globalGraph?.insertEdge(String(item.id), String(dependency.id));

				if (instanceOrDesc instanceof SyncDescriptor) {
					const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.branch(dependency.id, true) };
					graph.insertEdge(item, d);
					stack.push(d);
				}
			}
		}

		while (true) {
			const roots = graph.roots();

			// if there is no more roots but still
			// nodes in the graph we have a cycle
			if (roots.length === 0) {
				if (!graph.isEmpty()) {
					throw new CyclicDependencyError(graph);
				}
				break;
			}

			for (const { data } of roots) {
				// Repeat the check for this still being a service sync descriptor. That's because
				// instantiating a dependency might have side-effect and recursively trigger instantiation
				// so that some dependencies are now fullfilled already.
				const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
				if (instanceOrDesc instanceof SyncDescriptor) {
					// create instance and overwrite the service collections
					const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
					this._setServiceInstance(data.id, instance);
				}
				graph.removeNode(data);
			}
		}
		return <T>this._getServiceInstanceOrDescriptor(id);
	}

	private _createServiceInstanceWithOwner<T>(id: ServiceIdentifier<T>, ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace: Trace): T {
		if (this._services.get(id) instanceof SyncDescriptor) {
			return this._createServiceInstance(id, ctor, args, supportsDelayedInstantiation, _trace);
		} else if (this._parent) {
			return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
		} else {
			throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
		}
	}

	private _createServiceInstance<T>(id: ServiceIdentifier<T>, ctor: any, args: any[] = [], supportsDelayedInstantiation: boolean, _trace: Trace): T {
		if (!supportsDelayedInstantiation) {
			// eager instantiation
			return this._createInstance(ctor, args, _trace);

		} else {
			const child = new InstantiationService(undefined, this._strict, this, this._enableTracing);
			child._globalGraphImplicitDependency = String(id);

			// Return a proxy object that's backed by an idle value. That
			// strategy is to instantiate services in our idle time or when actually
			// needed but not when injected into a consumer

			// return "empty events" when the service isn't instantiated yet
			const earlyListeners = new Map<string, LinkedList<Parameters<Event<any>>>>();

			const idle = new IdleValue<any>(() => {
				const result = child._createInstance<T>(ctor, args, _trace);

				// early listeners that we kept are now being subscribed to
				// the real service
				for (const [key, values] of earlyListeners) {
					const candidate = <Event<any>>(<any>result)[key];
					if (typeof candidate === 'function') {
						for (const listener of values) {
							candidate.apply(result, listener);
						}
					}
				}
				earlyListeners.clear();

				return result;
			});
			return <T>new Proxy(Object.create(null), {
				get(target: any, key: PropertyKey): any {

					if (!idle.isInitialized) {
						// looks like an event
						if (typeof key === 'string' && (key.startsWith('onDid') || key.startsWith('onWill'))) {
							let list = earlyListeners.get(key);
							if (!list) {
								list = new LinkedList();
								earlyListeners.set(key, list);
							}
							const event: Event<any> = (callback, thisArg, disposables) => {
								const rm = list!.push([callback, thisArg, disposables]);
								return toDisposable(rm);
							};
							return event;
						}
					}

					// value already exists
					if (key in target) {
						return target[key];
					}

					// create value
					const obj = idle.value;
					let prop = obj[key];
					if (typeof prop !== 'function') {
						return prop;
					}
					prop = prop.bind(obj);
					target[key] = prop;
					return prop;
				},
				set(_target: T, p: PropertyKey, value: any): boolean {
					idle.value[p] = value;
					return true;
				}
			});
		}
	}

	private _throwIfStrict(msg: string, printWarning: boolean): void {
		if (printWarning) {
			console.warn(msg);
		}
		if (this._strict) {
			throw new Error(msg);
		}
	}
}

//#region -- tracing ---

const enum TraceType {
	Creation, Invocation, Branch
}

export class Trace {

	static all = new Set<string>();

	private static readonly _None = new class extends Trace {
		constructor() { super(-1, null); }
		override stop() { }
		override branch() { return this; }
	};

	static traceInvocation(_enableTracing: boolean, ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Invocation, ctor.name || new Error().stack!.split('\n').slice(3, 4).join('\n'));
	}

	static traceCreation(_enableTracing: boolean, ctor: any): Trace {
		return !_enableTracing ? Trace._None : new Trace(TraceType.Creation, ctor.name);
	}

	private static _totals: number = 0;
	private readonly _start: number = Date.now();
	private readonly _dep: [ServiceIdentifier<any>, boolean, Trace?][] = [];

	private constructor(
		readonly type: TraceType,
		readonly name: string | null
	) { }

	branch(id: ServiceIdentifier<any>, first: boolean): Trace {
		const child = new Trace(TraceType.Branch, id.toString());
		this._dep.push([id, first, child]);
		return child;
	}

	stop() {
		const dur = Date.now() - this._start;
		Trace._totals += dur;

		let causedCreation = false;

		function printChild(n: number, trace: Trace) {
			const res: string[] = [];
			const prefix = new Array(n + 1).join('\t');
			for (const [id, first, child] of trace._dep) {
				if (first && child) {
					causedCreation = true;
					res.push(`${prefix}CREATES -> ${id}`);
					const nested = printChild(n + 1, child);
					if (nested) {
						res.push(nested);
					}
				} else {
					res.push(`${prefix}uses -> ${id}`);
				}
			}
			return res.join('\n');
		}

		const lines = [
			`${this.type === TraceType.Creation ? 'CREATE' : 'CALL'} ${this.name}`,
			`${printChild(1, this)}`,
			`DONE, took ${dur.toFixed(2)}ms (grand total ${Trace._totals.toFixed(2)}ms)`
		];

		if (dur > 2 || causedCreation) {
			Trace.all.add(lines.join('\n'));
		}
	}
}

//#endregion
