/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';

type StorageDatabase = { [key: string]: unknown };

// 文件存储
export class FileStorage {

	// 存储数据库
	private storage: StorageDatabase = Object.create(null);
	private lastSavedStorageContents = '';

	private readonly flushDelayer = new ThrottledDelayer<void>(100 /* buffer saves over a short time */);

	private initializing: Promise<void> | undefined = undefined;
	private closing: Promise<void> | undefined = undefined;

	constructor(
		// 数据存储库写入的文件地址
		private readonly storagePath: URI,
		// 日志服务
		private readonly logService: ILogService,
		// 文件服务
		private readonly fileService: IFileService
	) {
	}

	init(): Promise<void> {
		// 避免重复初始化
		if (!this.initializing) {
			this.initializing = this.doInit();
		}
		// 返回初始化结果
		return this.initializing;
	}

	// 初始化逻辑
	private async doInit(): Promise<void> {
		try {
			// 读取"{appdata}/code-oss-dev/User/globalStorage/storage.json"配置
			this.lastSavedStorageContents = (await this.fileService.readFile(this.storagePath)).value.toString();
			this.storage = JSON.parse(this.lastSavedStorageContents);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}

	// 获取数据库字段的值
	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		const res = this.storage[key];
		if (isUndefinedOrNull(res)) {
			return defaultValue;
		}

		return res as T;
	}

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.setItems([{ key, data }]);
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void {
		let save = false;

		for (const { key, data } of items) {

			// Shortcut for data that did not change
			// 数据未变化不更新数据库
			if (this.storage[key] === data) {
				continue;
			}

			// Remove items when they are undefined or null
			if (isUndefinedOrNull(data)) {
				if (!isUndefined(this.storage[key])) {
					this.storage[key] = undefined;
					save = true;
				}
			}

			// Otherwise add an item
			else {
				this.storage[key] = data;
				save = true;
			}
		}

		// save用于控制只新增值为undefined的key时，不立即写入
		if (save) {
			// 调用save方法更新到磁盘
			this.save();
		}
	}

	removeItem(key: string): void {

		// Only update if the key is actually present (not undefined)
		if (!isUndefined(this.storage[key])) {
			this.storage[key] = undefined;
			this.save();
		}
	}

	private async save(): Promise<void> {
		if (this.closing) {
			return; // already about to close
		}

		return this.flushDelayer.trigger(() => this.doSave());
	}

	private async doSave(): Promise<void> {
		if (!this.initializing) {
			return; // if we never initialized, we should not save our state
		}

		// Make sure to wait for init to finish first
		// 确保初始化完成
		await this.initializing;

		// Return early if the database has not changed
		// 数据库内容未变化，不写入，尽量减少IO次数
		const serializedDatabase = JSON.stringify(this.storage, null, 4);
		if (serializedDatabase === this.lastSavedStorageContents) {
			return;
		}

		// Write to disk
		try {
			// 调用文件服务写入磁盘
			await this.fileService.writeFile(this.storagePath, VSBuffer.fromString(serializedDatabase));
			// 记录最后一次写入数据，用于下次是存在数据库更新的判断
			this.lastSavedStorageContents = serializedDatabase;
		} catch (error) {
			this.logService.error(error);
		}
	}

	async close(): Promise<void> {
		if (!this.closing) {
			this.closing = this.flushDelayer.trigger(() => this.doSave(), 0 /* as soon as possible */);
		}

		return this.closing;
	}
}

// 应用状态服务
export class StateService implements IStateService {

	declare readonly _serviceBrand: undefined;

	protected readonly fileStorage: FileStorage;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@IFileService fileService: IFileService
	) {
		// 初始化文件存储数据库
		this.fileStorage = new FileStorage(environmentService.stateResource, logService, fileService);
	}

	async init(): Promise<void> {
		await this.fileStorage.init();
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		return this.fileStorage.getItem(key, defaultValue);
	}
}
