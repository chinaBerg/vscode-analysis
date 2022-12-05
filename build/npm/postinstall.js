/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const { dirs } = require('./dirs');
const { setupBuildYarnrc } = require('./setupBuildYarnrc');
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 * 在指定目录下运行yarn install命令安装依赖包
 * @param {string} location
 * @param {*} [opts]
 */
function yarnInstall(location, opts) {
	opts = opts || { env: process.env };
	opts.cwd = location;
	opts.stdio = 'inherit';

	const raw = process.env['npm_config_argv'] || '{}';
	const argv = JSON.parse(raw);
	const original = argv.original || [];
	const args = original.filter(arg => arg === '--ignore-optional' || arg === '--frozen-lockfile' || arg === '--check-files');
	// 忽略package.json中engines字段的检查
	// 即忽略依赖资源检查
	if (opts.ignoreEngines) {
		args.push('--ignore-engines');
		delete opts.ignoreEngines;
	}

	console.log(`Installing dependencies in ${location}...`);
	console.log(`$ yarn ${args.join(' ')}`);

	// 安装依赖
	const result = cp.spawnSync(yarn, args, opts);

	// 安装失败退出
	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

// 遍历./dir.js文件内列出的所有文件路径
for (let dir of dirs) {

	if (dir === '') {
		// `yarn` already executed in root
		continue;
	}

	if (/^remote/.test(dir) && process.platform === 'win32' && (process.arch === 'arm64' || process.env['npm_config_arch'] === 'arm64')) {
		// windows arm: do not execute `yarn` on remote folder
		continue;
	}

	// 处理build文件夹
	if (dir === 'build') {
		// 生成build/.yarnrc文件
		setupBuildYarnrc();
		// 安装build/目录下所有的依赖包
		yarnInstall('build');
		continue;
	}

	let opts;

	if (dir === 'remote') {
		// node modules used by vscode server
		const env = { ...process.env };
		if (process.env['VSCODE_REMOTE_CC']) { env['CC'] = process.env['VSCODE_REMOTE_CC']; }
		if (process.env['VSCODE_REMOTE_CXX']) { env['CXX'] = process.env['VSCODE_REMOTE_CXX']; }
		if (process.env['CXXFLAGS']) { delete env['CXXFLAGS']; }
		if (process.env['CFLAGS']) { delete env['CFLAGS']; }
		if (process.env['LDFLAGS']) { delete env['LDFLAGS']; }
		if (process.env['VSCODE_REMOTE_NODE_GYP']) { env['npm_config_node_gyp'] = process.env['VSCODE_REMOTE_NODE_GYP']; }

		opts = { env };
	} else if (/^extensions\//.test(dir)) {
		// extensions/开头的路径，忽略内部的engines字段检查，不检查依赖资源
		opts = { ignoreEngines: true };
	}

	// 安装对应文件夹下面的依赖包
	yarnInstall(dir, opts);
}

/**
 * 通过子进程运行 git config pull.rebase merges 命令, 等同于设置 git config pull --rebase --rebase-merges
 * pull操作本身是就是 git fetch + git merge或者git fetch + git rebase的组合
 * @see https://git-scm.com/docs/git-pull#Documentation/git-pull.txt---rebasefalsetruemergesinteractive
 */
cp.execSync('git config pull.rebase merges');

/**
 * 通过子进程运行 git config blame.ignoreRevsFile .git-blame-ignore 命令, 等同于设置 git config blame --ignore-revs-file .git-blame-ignore
 * @see https://git-scm.com/docs/git-blame#Documentation/git-blame.txt---ignore-revs-fileltfilegt
 */
cp.execSync('git config blame.ignoreRevsFile .git-blame-ignore');
