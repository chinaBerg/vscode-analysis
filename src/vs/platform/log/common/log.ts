/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILogService = createDecorator<ILogService>('logService');
export const ILoggerService = createDecorator<ILoggerService>('loggerService');

function now(): string {
	return new Date().toISOString();
}

export enum LogLevel {
	Off,
	Trace,
	Debug,
	Info,
	Warning,
	Error
}

export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.Info;

export interface ILogger extends IDisposable {
	onDidChangeLogLevel: Event<LogLevel>;
	getLevel(): LogLevel;
	setLevel(level: LogLevel): void;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;

	/**
	 * An operation to flush the contents. Can be synchronous.
	 */
	flush(): void;
}

export function log(logger: ILogger, level: LogLevel, message: string): void {
	switch (level) {
		case LogLevel.Trace: logger.trace(message); break;
		case LogLevel.Debug: logger.debug(message); break;
		case LogLevel.Info: logger.info(message); break;
		case LogLevel.Warning: logger.warn(message); break;
		case LogLevel.Error: logger.error(message); break;
		case LogLevel.Off: /* do nothing */ break;
		default: throw new Error(`Invalid log level ${level}`);
	}
}

// 格式化多个日志内容，使用空格拼接
export function format(args: any): string {
	let result = '';

	for (let i = 0; i < args.length; i++) {
		let a = args[i];

		if (typeof a === 'object') {
			try {
				a = JSON.stringify(a);
			} catch (e) { }
		}

		result += (i > 0 ? ' ' : '') + a;
	}

	return result;
}

export interface ILogService extends ILogger {
	readonly _serviceBrand: undefined;
}

export interface ILoggerOptions {

	/**
	 * Name of the logger.
	 */
	name?: string;

	/**
	 * Do not create rotating files if max size exceeds.
	 */
	donotRotate?: boolean;

	/**
	 * Do not use formatters.
	 */
	donotUseFormatters?: boolean;

	/**
	 * If set, logger logs the message always.
	 */
	always?: boolean;
}

export interface ILoggerService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a logger, or gets one if it already exists.
	 */
	createLogger(resource: URI, options?: ILoggerOptions, logLevel?: LogLevel): ILogger;

	/**
	 * Gets an existing logger, if any.
	 */
	getLogger(resource: URI): ILogger | undefined;

	/**
	 * Set log level for a logger.
	 */
	setLevel(resource: URI, level: LogLevel | undefined): void;

	/**
	 * Get log level for a logger.
	 */
	getLogLevel(resource: URI): LogLevel | undefined;
}

/**
 * 日志的抽象基类
 */
export abstract class AbstractLogger extends Disposable implements ILogger {

	private level: LogLevel = DEFAULT_LOG_LEVEL;
	private readonly _onDidChangeLogLevel: Emitter<LogLevel> = this._register(new Emitter<LogLevel>());
	readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event;

	// 设置日志级别
	// 设置完成后触发事件回调
	setLevel(level: LogLevel): void {
		if (this.level !== level) {
			this.level = level;
			// level变化后的回调
			this._onDidChangeLogLevel.fire(this.level);
		}
	}

	getLevel(): LogLevel {
		return this.level;
	}

	// 检查日志级别是否满足
	protected checkLogLevel(level: LogLevel): boolean {
		return this.level !== LogLevel.Off && this.level <= level;
	}

	// 定义trace info等一些列抽象方法，需要由子类实现
	abstract trace(message: string, ...args: any[]): void;
	abstract debug(message: string, ...args: any[]): void;
	abstract info(message: string, ...args: any[]): void;
	abstract warn(message: string, ...args: any[]): void;
	abstract error(message: string | Error, ...args: any[]): void;
	abstract flush(): void;
}

/**
 * 消息日志的抽象类
 */
export abstract class AbstractMessageLogger extends AbstractLogger implements ILogger {

	// 子类必须实现的log方法，用于info、trace等方法中调用log方法输出
	// 将log的实现交给子类，增加灵活性
	protected abstract log(level: LogLevel, message: string): void;

	// logAlways表示是否始终运行输出日志
	constructor(private readonly logAlways?: boolean) {
		super();
	}

	// 复写父类的checkLogLevel方法
	// 只要logAlways为true或者父类的checkLogLevel方法检查通过，都运行输出日志
	protected override checkLogLevel(level: LogLevel): boolean {
		return this.logAlways || super.checkLogLevel(level);
	}

	// trace输出
	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			this.log(LogLevel.Trace, format([message, ...args]));
		}
	}

	// debug输出
	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			this.log(LogLevel.Debug, format([message, ...args]));
		}
	}

	// info输出
	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			this.log(LogLevel.Info, format([message, ...args]));
		}
	}

	// warn输出
	warn(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			this.log(LogLevel.Warning, format([message, ...args]));
		}
	}

	// error输出
	error(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {

			// 如果传递给error方法的是个Error错误而不是字符串，则取error.stach作为message内容
			if (message instanceof Error) {
				const array = Array.prototype.slice.call(arguments) as any[];
				array[0] = message.stack;
				this.log(LogLevel.Error, format(array));
			} else {
				this.log(LogLevel.Error, format([message, ...args]));
			}
		}
	}

	flush(): void { }
}


/**
 * ConsoleMainLogger
 * 在主进程的控制台输出日志，
 * 输出日志时根据useColors属性判断日志是否带颜色
 */
export class ConsoleMainLogger extends AbstractLogger implements ILogger {

	// 控制台输出日志是否带颜色
	private useColors: boolean;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		// 非windows环境下通过ANSI转义序列给console内容添加颜色
		this.useColors = !isWindows;
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			if (this.useColors) {
				console.log(`\x1b[90m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[main ${now()}]`, message, ...args);
			}
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			if (this.useColors) {
				console.warn(`\x1b[93m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.warn(`[main ${now()}]`, message, ...args);
			}
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			if (this.useColors) {
				console.error(`\x1b[91m[main ${now()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[main ${now()}]`, message, ...args);
			}
		}
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}

}

/**
 * ConsoleLogger
 * 在控制台输出日志，
 * 输出的日志携带样式
 */
export class ConsoleLogger extends AbstractLogger implements ILogger {

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			// 颜色#888的TRACE开头
			console.log('%cTRACE', 'color: #888', message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			// 颜色#888背景色#eee的DEBUG开头
			console.log('%cDEBUG', 'background: #eee; color: #888', message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			// 颜色#33f的INFO开头
			console.log('%c INFO', 'color: #33f', message, ...args);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			// 颜色#993的WARN开头
			console.log('%c WARN', 'color: #993', message, ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			// 颜色#f33的ERR开头
			console.log('%c  ERR', 'color: #f33', message, ...args);
		}
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}
}

/**
 * AdapterLogger 日志适配器
 */
export class AdapterLogger extends AbstractLogger implements ILogger {

	constructor(private readonly adapter: { log: (logLevel: LogLevel, args: any[]) => void }, logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			this.adapter.log(LogLevel.Trace, [this.extractMessage(message), ...args]);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			this.adapter.log(LogLevel.Debug, [this.extractMessage(message), ...args]);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			this.adapter.log(LogLevel.Info, [this.extractMessage(message), ...args]);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			this.adapter.log(LogLevel.Warning, [this.extractMessage(message), ...args]);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			this.adapter.log(LogLevel.Error, [this.extractMessage(message), ...args]);
		}
	}

	private extractMessage(msg: string | Error): string {
		if (typeof msg === 'string') {
			return msg;
		}

		return toErrorMessage(msg, this.checkLogLevel(LogLevel.Trace));
	}

	override dispose(): void {
		// noop
	}

	flush(): void {
		// noop
	}
}

/**
 * MultiplexLogService 多重日志服务
 */
export class MultiplexLogService extends AbstractLogger implements ILogService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly logServices: ReadonlyArray<ILogger>) {
		super();
		if (logServices.length) {
			// 以第一个日志服务的日志级别设置所有日志服务的级别
			this.setLevel(logServices[0].getLevel());
		}
	}

	// 依次设置所有日志服务的日志级别
	override setLevel(level: LogLevel): void {
		for (const logService of this.logServices) {
			// 调用背后还会触发每个日志服务可能继承的_onDidChangeLogLevel.fire事件
			logService.setLevel(level);
		}
		// 设置完成后调用一次MultiplexLogService自身继承的setLevel方法
		// 从而触发MultiplexLogService自身继承的_onDidChangeLogLevel.fire事件
		super.setLevel(level);
	}

	// 依次调用每个日志服务的trace方法
	trace(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.trace(message, ...args);
		}
	}

	// 依次调用每个日志服务的debug方法
	debug(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.debug(message, ...args);
		}
	}

	// 依次调用每个日志服务的info方法
	info(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.info(message, ...args);
		}
	}

	// 依次调用每个日志服务的warn方法
	warn(message: string, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.warn(message, ...args);
		}
	}

	// 依次调用每个日志服务的error方法
	error(message: string | Error, ...args: any[]): void {
		for (const logService of this.logServices) {
			logService.error(message, ...args);
		}
	}

	// 依次调用每个日志服务的flush方法
	flush(): void {
		for (const logService of this.logServices) {
			logService.flush();
		}
	}

	// 依次调用每个日志服务的dispose方法
	override dispose(): void {
		for (const logService of this.logServices) {
			logService.dispose();
		}
	}
}

export class LogService extends Disposable implements ILogService {
	declare readonly _serviceBrand: undefined;

	constructor(private logger: ILogger) {
		super();
		this._register(logger);
	}

	get onDidChangeLogLevel(): Event<LogLevel> {
		return this.logger.onDidChangeLogLevel;
	}

	setLevel(level: LogLevel): void {
		this.logger.setLevel(level);
	}

	getLevel(): LogLevel {
		return this.logger.getLevel();
	}

	trace(message: string, ...args: any[]): void {
		this.logger.trace(message, ...args);
	}

	debug(message: string, ...args: any[]): void {
		this.logger.debug(message, ...args);
	}

	info(message: string, ...args: any[]): void {
		this.logger.info(message, ...args);
	}

	warn(message: string, ...args: any[]): void {
		this.logger.warn(message, ...args);
	}

	error(message: string | Error, ...args: any[]): void {
		this.logger.error(message, ...args);
	}

	flush(): void {
		this.logger.flush();
	}
}

interface ILoggerItem {
	readonly logger: ILogger;
	logLevel: LogLevel | undefined;
}

/**
 * 日志服务的抽象基类
 * 子类必须重写用于创建日志器的抽象方法doCreateLogger
 */
export abstract class AbstractLoggerService extends Disposable implements ILoggerService {

	declare readonly _serviceBrand: undefined;

	private readonly loggerItems = new ResourceMap<ILoggerItem>();

	constructor(
		private logLevel: LogLevel,
		onDidChangeLogLevel: Event<LogLevel>,
	) {
		super();
		this._register(onDidChangeLogLevel(logLevel => this.setLevel(logLevel)));
	}

	getLoggers(): ILogger[] {
		return [...this.loggerItems.values()].map(({ logger }) => logger);
	}

	getLogger(resource: URI): ILogger | undefined {
		return this.loggerItems.get(resource)?.logger;
	}

	/**
	 * 创建日志器
	 * 如果日志器已存在则直接返回，避免重复创建
	 */
	createLogger(resource: URI, options?: ILoggerOptions, logLevel?: LogLevel): ILogger {
		let logger = this.loggerItems.get(resource)?.logger;
		if (!logger) {
			logLevel = options?.always ? LogLevel.Trace : logLevel;
			// 调用子类实现的doCreateLogger方法创建日志器
			logger = this.doCreateLogger(resource, logLevel ?? this.logLevel, options);
			this.loggerItems.set(resource, { logger, logLevel });
		}
		return logger;
	}

	setLevel(logLevel: LogLevel): void;
	setLevel(resource: URI, logLevel: LogLevel): void;
	setLevel(arg1: any, arg2?: any): void {
		const resource = URI.isUri(arg1) ? arg1 : undefined;
		const logLevel = resource ? arg2 : arg1;

		if (resource) {
			const logger = this.loggerItems.get(resource);
			if (logger && logger.logLevel !== logLevel) {
				logger.logLevel = logLevel;
				logger.logger.setLevel(logLevel);
			}
		} else {
			this.logLevel = logLevel;
			this.loggerItems.forEach(({ logLevel, logger }) => {
				if (logLevel === undefined) {
					logger.setLevel(this.logLevel);
				}
			});
		}

	}

	getLogLevel(resource: URI): LogLevel | undefined {
		const logger = this.loggerItems.get(resource);
		return logger?.logLevel;
	}

	override dispose(): void {
		this.loggerItems.forEach(({ logger }) => logger.dispose());
		this.loggerItems.clear();
		super.dispose();
	}

	// 创建日志器的抽象方法，必须由子类实现
	protected abstract doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger;
}

// #region 用于测试相关的构造数据
export class NullLogger implements ILogger {
	readonly onDidChangeLogLevel: Event<LogLevel> = new Emitter<LogLevel>().event;
	setLevel(level: LogLevel): void { }
	getLevel(): LogLevel { return LogLevel.Info; }
	trace(message: string, ...args: any[]): void { }
	debug(message: string, ...args: any[]): void { }
	info(message: string, ...args: any[]): void { }
	warn(message: string, ...args: any[]): void { }
	error(message: string | Error, ...args: any[]): void { }
	critical(message: string | Error, ...args: any[]): void { }
	dispose(): void { }
	flush(): void { }
}

export class NullLogService extends NullLogger implements ILogService {
	declare readonly _serviceBrand: undefined;
}

export class NullLoggerService extends AbstractLoggerService {

	constructor() { super(LogLevel.Info, Event.None); }

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions | undefined): ILogger {
		return new NullLogger();
	}
}
// #endregion

export function getLogLevel(environmentService: IEnvironmentService): LogLevel {
	if (environmentService.verbose) {
		return LogLevel.Trace;
	}
	if (typeof environmentService.logLevel === 'string') {
		const logLevel = parseLogLevel(environmentService.logLevel.toLowerCase());
		if (logLevel !== undefined) {
			return logLevel;
		}
	}
	return DEFAULT_LOG_LEVEL;
}

// 日志级别的枚举值转换为字符串
export function LogLevelToString(logLevel: LogLevel): string {
	switch (logLevel) {
		case LogLevel.Trace: return 'trace';
		case LogLevel.Debug: return 'debug';
		case LogLevel.Info: return 'info';
		case LogLevel.Warning: return 'warn';
		case LogLevel.Error: return 'error';
		case LogLevel.Off: return 'off';
	}
}

// 转换日志级别字符串为枚举值
export function parseLogLevel(logLevel: string): LogLevel | undefined {
	switch (logLevel) {
		case 'trace':
			return LogLevel.Trace;
		case 'debug':
			return LogLevel.Debug;
		case 'info':
			return LogLevel.Info;
		case 'warn':
			return LogLevel.Warning;
		case 'error':
			return LogLevel.Error;
		case 'critical':
			return LogLevel.Error;
		case 'off':
			return LogLevel.Off;
	}
	return undefined;
}
