/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractMessageLogger, DEFAULT_LOG_LEVEL, ILogger, ILogService, log, LogLevel } from 'vs/platform/log/common/log';

interface ILog {
	level: LogLevel;
	message: string;
}

/**
 * BufferLogService服务
 * 支持缓存log数据，直到设置日志器之后再输出日志
 */
export class BufferLogService extends AbstractMessageLogger implements ILogService {

	declare readonly _serviceBrand: undefined;
	private buffer: ILog[] = [];
	private _logger: ILogger | undefined = undefined;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		this._register(this.onDidChangeLogLevel(level => {
			this._logger?.setLevel(level);
		}));
	}

	// 设置logger日志器
	set logger(logger: ILogger) {
		this._logger = logger;

		// 设置完成后调用日志器的相关方法输出/IO所有的缓存日志
		for (const { level, message } of this.buffer) {
			log(logger, level, message);
		}

		// 清空已缓存日志
		this.buffer = [];
	}

	// 实现AbstractMessageLogger抽象类的log方法，用于在trace/info/error等方法中调用this.log
	protected log(level: LogLevel, message: string): void {
		// 如果指定了_logger日志器，则直接调用日志器的相关方法输出日志
		if (this._logger) {
			log(this._logger, level, message);
		} else if (this.getLevel() <= level) {
			// 没有调用日志器则缓存日志数据，等待设置日志器时再完整触发一次输出
			this.buffer.push({ level, message });
		}
	}

	// 覆写dispose销毁逻辑
	// 调用传入的日志器的dispose销毁逻辑
	override dispose(): void {
		this._logger?.dispose();
	}

	// 覆写flush逻辑
	// 调用传入的日志器的flush逻辑
	override flush(): void {
		this._logger?.flush();
	}
}
