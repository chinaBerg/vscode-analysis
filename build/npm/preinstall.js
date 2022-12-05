/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let err = false;

// 获取当前NodeJs环境的版本号，Eg: 16.18.1
const nodeVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
// 主版本号
const majorNodeVersion = parseInt(nodeVersion[1]);
// 次版本号
const minorNodeVersion = parseInt(nodeVersion[2]);
// 修订版本号
const patchNodeVersion = parseInt(nodeVersion[3]);

// 检查NodeJs版本
// NodeJs版本小于16.14时，终端进行错误提示
if (majorNodeVersion < 16 || (majorNodeVersion === 16 && minorNodeVersion < 14)) {
	// 通过ASNI码输出红色
	// 期望的NodeJs版本号是 [16.14.x, 17.x.y)之间
	console.error('\033[1;31m*** Please use node.js versions >=16.14.x and <17.\033[0;0m');
	err = true;
}
// NodeJs版本大于等于17时，终端进行错误警告
if (majorNodeVersion >= 17) {
	// 通过ASNI码输出红色
	console.warn('\033[1;31m*** Warning: Versions of node.js >= 17 have not been tested.\033[0;0m')
}

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

// 获取yarn的版本
// 通过子进程运行yarn -v的方式获取，trim去掉行尾的\n
const yarnVersion = cp.execSync('yarn -v', { encoding: 'utf8' }).trim();
const parsedYarnVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(yarnVersion);
const majorYarnVersion = parseInt(parsedYarnVersion[1]);
const minorYarnVersion = parseInt(parsedYarnVersion[2]);
const patchYarnVersion = parseInt(parsedYarnVersion[3]);

// 检查yarn的版本
// yarn版本小于1.10.1或大于等于2时进行错误提示
if (
	majorYarnVersion < 1 ||
	majorYarnVersion === 1 && (
		minorYarnVersion < 10 || (minorYarnVersion === 10 && patchYarnVersion < 1)
	) ||
	majorYarnVersion >= 2
) {
	console.error('\033[1;31m*** Please use yarn >=1.10.1 and <2.\033[0;0m');
	err = true;
}

/**
 * 检查是否使用的yarn进行的依赖安装，如果不是则进行错误提示。
 * yarn运行的命令时，npm_execpath属性会包含yarn工具的路径，Eg： npm_execpath: 'C:\\xxx\\xxx\\AppData\\Roaming\\npm\\node_modules\\yarn\\bin\\yarn.js'。
 */
if (!/yarn[\w-.]*\.c?js$|yarnpkg$/.test(process.env['npm_execpath'])) {
	console.error('\033[1;31m*** Please use yarn to install dependencies.\033[0;0m');
	err = true;
}

// Windows系统下检查是否安装了C/C++的编译环境
if (process.platform === 'win32') {
	// 未安装C/C++的编译环境时，终端输出错误，提示用户查看环境安装教程
	if (!hasSupportedVisualStudioVersion()) {
		console.error('\033[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\033[0;0m');
		err = true;
	}

	if (!err) {
		// 安装./gyp/package.json的所有依赖
		// 目前安装的s是node-gyp模块，该模块主要用于将C++模块编译成NodeJs的模块
		// @see https://github.com/nodejs/node-gyp#on-windows
		installHeaders();
	}
}

// 依赖环境检查不通过时，退出进程，也就是退出依赖安装
if (err) {
	console.error('');
	process.exit(1);
}

// 判断是否已安装支持的VisualStudio版本
// 注意，VisualStudio是C/C++的编译环境和工具，不是前端的VisualStudioCode
function hasSupportedVisualStudioVersion() {
	const fs = require('fs');
	const path = require('path');
	// Translated over from
	// https://source.chromium.org/chromium/chromium/src/+/master:build/vs_toolchain.py;l=140-175
	// 支持VS2022、2019和2017这三个版本
	const supportedVersions = ['2022', '2019', '2017'];

	const availableVersions = [];
	// 检查是否安装了任一版本的VS
	for (const version of supportedVersions) {
		let vsPath = process.env[`vs${version}_install`];
		if (vsPath && fs.existsSync(vsPath)) {
			availableVersions.push(version);
			break;
		}
		const programFiles86Path = process.env['ProgramFiles(x86)'];
		const programFiles64Path = process.env['ProgramFiles'];

		// 检查是否安装在了ProgramFiles下
		// windows64位系统
		if (programFiles64Path) {
			vsPath = `${programFiles64Path}/Microsoft Visual Studio/${version}`;
			// 该路径下存在下面任一资源，都认为安装了对应环境
			// 类似鸭子类型的思想
			const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools'];
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}

		// 检查是否安装在了ProgramFiles(x86)下
		// windows32位系统
		if (programFiles86Path) {
			vsPath = `${programFiles86Path}/Microsoft Visual Studio/${version}`;
			// 该路径下存在下面任一资源，都认为安装了对应环境
			// 类似鸭子类型的思想
			const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools'];
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}
	}
	return availableVersions.length;
}

// 安装依赖的头文件
function installHeaders() {
	const yarn = 'yarn.cmd';
	// 安装./gyp/package.json的所有依赖
	// 实现是通过子进程运行 yarn install 命令，指定命令的的上下文在./gyp/目录下
	const yarnResult = cp.spawnSync(yarn, ['install'], {
		env: process.env,
		cwd: path.join(__dirname, 'gyp'),
		stdio: 'inherit'
	});
	// 安装错误进行错误提示
	if (yarnResult.error || yarnResult.status !== 0) {
		console.error(`Installing node-gyp failed`);
		err = true;
		return;
	}

	// The node gyp package got installed using the above yarn command using the gyp/package.json
	// file checked into our repository. So from that point it is save to construct the path
	// to that executable
	const node_gyp = path.join(__dirname, 'gyp', 'node_modules', '.bin', 'node-gyp.cmd');
	// 获取所有已安装的nodejs头文件版本
	// 通过子进程运行node-gyp list命令的方式实现
	const result = cp.execFileSync(node_gyp, ['list'], { encoding: 'utf8' });
	const versions = new Set(result.split(/\n/g).filter(line => !line.startsWith('gyp info')).map(value => value));

	// node-gyp安装完成后，判断是否安装了依赖版本的node和electron的头文件
	// 未安装则使用node-gyp install --dist-url=$url $version 从指定地址安装指定版本的头文件

	// 读取项目根目录下的.yarnrc文件的disturl和target字段内容
	const local = getHeaderInfo(path.join(__dirname, '..', '..', '.yarnrc'));
	// 读取 根目录/remote/.yarnrc文件的disturl和target字段内容
	const remote = getHeaderInfo(path.join(__dirname, '..', '..', 'remote', '.yarnrc'));

	// 如果没有安装根目录下.yarnrc中指定版本的nodejs头文件，则安装
	if (local !== undefined && !versions.has(local.target)) {
		// Both disturl and target come from a file checked into our repository
		cp.execFileSync(node_gyp, ['install', '--dist-url', local.disturl, local.target]);
	}

	// 如果没有安装根目录/remote/.yarnrc中指定版本的electron头文件，则安装
	if (remote !== undefined && !versions.has(remote.target)) {
		// Both disturl and target come from a file checked into our repository
		cp.execFileSync(node_gyp, ['install', '--dist-url', remote.disturl, remote.target]);
	}
}

/**
 * 解析.yarnrc文件中的disturl字段和target字段
 * @param {string} rcFile
 * @returns {{ disturl: string; target: string } | undefined}
 */
function getHeaderInfo(rcFile) {
	// 读取.yarnrc文件内容并按行分割
	const lines = fs.readFileSync(rcFile, 'utf8').split(/\r\n?/g);
	let disturl, target;

	// 遍历每行内容，通过正则匹配disturl和target字段的值
	for (const line of lines) {
		let match = line.match(/\s*disturl\s*\"(.*)\"\s*$/);
		if (match !== null && match.length >= 1) {
			disturl = match[1];
		}
		match = line.match(/\s*target\s*\"(.*)\"\s*$/);
		if (match !== null && match.length >= 1) {
			target = match[1];
		}
	}

	// 返回解析后的结果
	return disturl !== undefined && target !== undefined
		? { disturl, target }
		: undefined;
}
