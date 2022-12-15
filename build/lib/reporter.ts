/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import * as _ from 'underscore';
import * as fancyLog from 'fancy-log';
import * as ansiColors from 'ansi-colors';
import * as fs from 'fs';
import * as path from 'path';

class ErrorLog {
	constructor(public id: string) {
	}
	allErrors: string[][] = [];
	startTime: number | null = null;
	// 控制开始和结束输出的依赖关系
	// 改用状态机更健壮一些
	count = 0;

	// 开始输出日志
	onStart(): void {
		if (this.count++ > 0) {
			return;
		}

		// 记录开始输出日志的时间
		this.startTime = new Date().getTime();
		// 输出日志
		fancyLog(`Starting ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''}...`);
	}

	// 结束输出
	onEnd(): void {
		if (--this.count > 0) {
			return;
		}

		this.log();
	}

	log(): void {
		const errors = _.flatten(this.allErrors);
		const seen = new Set<string>();

		// 输出错误日志
		errors.map(err => {
			// 避免输出重复日志
			if (!seen.has(err)) {
				seen.add(err);
				fancyLog(`${ansiColors.red('Error')}: ${err}`);
			}
		});

		// 输出结束日志
		fancyLog(`Finished ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''} with ${errors.length} errors after ${ansiColors.magenta((new Date().getTime() - this.startTime!) + ' ms')}`);

		const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
		const messages = errors
			.map(err => regex.exec(err))
			.filter(match => !!match)
			.map(x => x as string[])
			.map(([, path, line, column, message]) => ({ path, line: parseInt(line), column: parseInt(column), message }));

		try {
			// 输出日志到.build/log_${this.id}文件
			const logFileName = 'log' + (this.id ? `_${this.id}` : '');
			fs.writeFileSync(path.join(buildLogFolder, logFileName), JSON.stringify(messages));
		} catch (err) {
			//noop
		}
	}

}

// 获取ErrorLog实例，不存在则创建一个
const errorLogsById = new Map<string, ErrorLog>();
function getErrorLog(id: string = '') {
	let errorLog = errorLogsById.get(id);
	if (!errorLog) {
		errorLog = new ErrorLog(id);
		errorLogsById.set(id, errorLog);
	}
	return errorLog;
}

const buildLogFolder = path.join(path.dirname(path.dirname(__dirname)), '.build');

try {
	// 确保.build目录存在，不存在则新建
	fs.mkdirSync(buildLogFolder);
} catch (err) {
	// ignore
}

export interface IReporter {
	(err: string): void;
	hasErrors(): boolean;
	end(emitError: boolean): NodeJS.ReadWriteStream;
}

export function createReporter(id?: string): IReporter {
	const errorLog = getErrorLog(id);

	const errors: string[] = [];
	errorLog.allErrors.push(errors);

	// 添加错误
	const result = (err: string) => errors.push(err);

	// 判断是否存在错误
	result.hasErrors = () => errors.length > 0;

	// 输出日志
	result.end = (emitError: boolean): NodeJS.ReadWriteStream => {
		errors.length = 0;
		// 调用result.end()方法开始输出日志
		errorLog.onStart();

		// 并且返回一个双工流
		// 该双工流定义了结束方法
		return es.through(undefined, function () {
			errorLog.onEnd();

			if (emitError && errors.length > 0) {
				if (!(errors as any).__logged__) {
					errorLog.log();
				}

				(errors as any).__logged__ = true;

				const err = new Error(`Found ${errors.length} errors`);
				(err as any).__reporter__ = true;
				this.emit('error', err);
			} else {
				this.emit('end');
			}
		});
	};

	return result;
}
