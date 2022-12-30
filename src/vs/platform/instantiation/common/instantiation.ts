/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as descriptors from './descriptors';
import { ServiceCollection } from './serviceCollection';

// ------ internal util

export namespace _util {

	export const serviceIds = new Map<string, ServiceIdentifier<any>>();

	export const DI_TARGET = '$di$target';
	export const DI_DEPENDENCIES = '$di$dependencies';

	export function getServiceDependencies(ctor: any): { id: ServiceIdentifier<any>; index: number }[] {
		return ctor[DI_DEPENDENCIES] || [];
	}
}

// --- interfaces ------

export type BrandedService = { _serviceBrand: undefined };

export interface IConstructorSignature<T, Args extends any[] = []> {
	new <Services extends BrandedService[]>(...args: [...Args, ...Services]): T;
}

export interface ServicesAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService');

/**
 * Given a list of arguments as a tuple, attempt to extract the leading, non-service arguments
 * to their own tuple.
 */
export type GetLeadingNonServiceArgs<Args> =
	Args extends [...BrandedService[]] ? []
	: Args extends [infer A, ...BrandedService[]] ? [A]
	: Args extends [infer A, ...infer R] ? [A, ...GetLeadingNonServiceArgs<R>]
	: never;

export interface IInstantiationService {

	readonly _serviceBrand: undefined;

	/**
	 * Synchronously creates an instance that is denoted by the descriptor
	 */
	createInstance<T>(descriptor: descriptors.SyncDescriptor0<T>): T;
	createInstance<Ctor extends new (...args: any[]) => any, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;

	/**
	 * Calls a function with a service accessor.
	 */
	invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R;

	/**
	 * Creates a child of this service which inherits all current services
	 * and adds/overwrites the given services.
	 */
	createChild(services: ServiceCollection): IInstantiationService;
}


/**
 * Identifies a service of type `T`.
 */
export interface ServiceIdentifier<T> {
	(...args: any[]): void;
	type: T;
}

/**
 * 在被装饰参数所属的类上挂载_util.DI_DEPENDENCIES属性记录所有的依赖服务
 * 注意，记录的实际是装饰器函数，因为业务侧调用时与服务映射的key也应该是装饰器
 * 例如: IA = createDecorator('ServiceId'); services.set(IA, AServiceInstance);
 * @param id 装饰器
 * @param target 被修饰参数所属类
 * @param index 被装饰城参数的下标
 */
function storeServiceDependency(id: Function, target: Function, index: number): void {
	// 记录依赖服务
	if ((target as any)[_util.DI_TARGET] === target) {
		(target as any)[_util.DI_DEPENDENCIES].push({ id, index });
	} else {
		// DI_TARGET和DI_DEPENDENCIES属性不存在则创建，并记录依赖
		(target as any)[_util.DI_DEPENDENCIES] = [{ id, index }];
		(target as any)[_util.DI_TARGET] = target;
	}
}

/**
 * The *only* valid way to create a {{ServiceIdentifier}}.
 * 创建唯一的ServiceIdentifier类型服务
 */
export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {

	// 装饰器已存在不再重新创建，直接返回服务
	if (_util.serviceIds.has(serviceId)) {
		return _util.serviceIds.get(serviceId)!;
	}

	// createDecorator返回的装饰器
	const id = <any>function (target: Function, key: string, index: number): any {
		// 必须传入3个参数
		if (arguments.length !== 3) {
			throw new Error('@IServiceName-decorator can only be used to decorate a parameter');
		}
		// 装饰器的真正实现
		// target 装饰构造函数参数时实际是被装饰类
		// index 被装饰参数的下标
		storeServiceDependency(id, target, index);
	};

	// 重写id函数的toString方法为返回serviceId
	id.toString = () => serviceId;

	// 将创建的服务添加到serviceIds服务映射表中
	_util.serviceIds.set(serviceId, id);
	return id;
}

export function refineServiceDecorator<T1, T extends T1>(serviceIdentifier: ServiceIdentifier<T1>): ServiceIdentifier<T> {
	return <ServiceIdentifier<T>>serviceIdentifier;
}
