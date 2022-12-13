/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

import * as path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const rootDir = path.resolve(__dirname, '..', '..');

// 在根目录下运行指定命令
function runProcess(command: string, args: ReadonlyArray<string> = []) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

// 检查根目录下指定路径是否存在
async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

// 检查根目录下node_modules文件夹是否存在
async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		// 不存在时运行yarn安装依赖包
		await runProcess(yarn);
	}
}

// 运行yarn electron命令
// 该命令在package.json scripts中定义
async function getElectron() {
	await runProcess(yarn, ['electron']);
}

// 检查资源是否被编译完成，未编译则运行yarn compile命令进行编译
// 该命令在package.json scripts中定义
async function ensureCompiled() {
	if (!(await exists('out'))) {
		await runProcess(yarn, ['compile']);
	}
}

async function main() {
	// 确保项目运行过yarn install安装了依赖包
	await ensureNodeModules();
	// 运行yarn electron命令
	await getElectron();
	// 确保运行过yarn compile命令完成了编译
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = require('./builtInExtensions');
	// 下载内置扩展插件
	await getBuiltInExtensions();
}

// 直接调用脚本时运行
if (require.main === module) {
	// 预启动做了四件事：运行yarn install、yarn electron和yarn compile、下载内置扩展插件
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
