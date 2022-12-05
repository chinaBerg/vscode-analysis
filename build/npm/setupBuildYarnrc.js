/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs');

// make sure we install the deps of build for the system installed
// node, since that is the driver of gulp
function setupBuildYarnrc() {
	// 获取要写入的.yarnrc文件路径
	// 等同于../../.yarnrc，实际是build/.yarnrc
	const yarnrcPath = path.join(path.dirname(__dirname), '.yarnrc');
	// 待写入的.yarnrc文件内容
	const yarnrc = `disturl "https://nodejs.org/download/release"
target "${process.versions.node}"
runtime "node"
arch "${process.arch}"`;

	// 写入到.yarnrc
	fs.writeFileSync(yarnrcPath, yarnrc, 'utf8');
}

exports.setupBuildYarnrc = setupBuildYarnrc;

// 只有直接运行该脚本时才执行
if (require.main === module) {
	setupBuildYarnrc();
}
