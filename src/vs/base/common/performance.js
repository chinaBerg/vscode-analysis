/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

(function () {

	/**
	 * @returns {{mark(name:string):void, getMarks():{name:string, startTime:number}[]}}
	 */
	function _definePolyfillMarks(timeOrigin) {

		const _data = [];
		if (typeof timeOrigin === 'number') {
			_data.push('code/timeOrigin', timeOrigin);
		}

		function mark(name) {
			// 使用时间戳作为hack
			_data.push(name, Date.now());
		}
		function getMarks() {
			const result = [];
			for (let i = 0; i < _data.length; i += 2) {
				result.push({
					name: _data[i],
					startTime: _data[i + 1],
				});
			}
			return result;
		}
		return { mark, getMarks };
	}

	/**
	 * @returns {{mark(name:string):void, getMarks():{name:string, startTime:number}[]}}
	 */
	function _define() {

		// Identify browser environment when following property is not present
		// https://nodejs.org/dist/latest-v16.x/docs/api/perf_hooks.html#performancenodetiming
		if (typeof performance === 'object' && typeof performance.mark === 'function' && !performance.nodeTiming) {
			// in a browser context, reuse performance-util

			if (typeof performance.timeOrigin !== 'number' && !performance.timing) {
				// safari & webworker: because there is no timeOrigin and no workaround
				// we use the `Date.now`-based polyfill.
				return _definePolyfillMarks();

			} else {
				// use "native" performance for mark and getMarks
				// 原生支持performace的mark和getMarks则使用原生的语法
				return {
					mark(name) {
						// 调用原生mark方法记录某一个时刻高精度时间
						performance.mark(name);
					},
					getMarks() {
						let timeOrigin = performance.timeOrigin;
						// safari兼容
						if (typeof timeOrigin !== 'number') {
							// safari: there is no timerOrigin but in renderers there is the timing-property
							// see https://bugs.webkit.org/show_bug.cgi?id=174862
							timeOrigin = performance.timing.navigationStart || performance.timing.redirectStart || performance.timing.fetchStart;
						}

						// 第一项是记录性能测量开始时的时间的高精度时间戳
						const result = [{ name: 'code/timeOrigin', startTime: Math.round(timeOrigin) }];
						for (const entry of performance.getEntriesByType('mark')) {
							// 获取所有mark方法调用而记录的时间戳
							result.push({
								name: entry.name,
								startTime: Math.round(timeOrigin + entry.startTime)
							});
						}
						return result;
					}
				};
			}

		} else if (typeof process === 'object') {
			// node.js: use the normal polyfill but add the timeOrigin
			// from the node perf_hooks API as very first mark
			const timeOrigin = Math.round((require.__$__nodeRequire || require)('perf_hooks').performance.timeOrigin);
			return _definePolyfillMarks(timeOrigin);

		} else {
			// unknown environment
			console.trace('perf-util loaded in UNKNOWN environment');
			return _definePolyfillMarks();
		}
	}

	function _factory(sharedObj) {
		if (!sharedObj.MonacoPerformanceMarks) {
			sharedObj.MonacoPerformanceMarks = _define();
		}
		return sharedObj.MonacoPerformanceMarks;
	}

	// 支持amd和commonjs模块化规范

	// This module can be loaded in an amd and commonjs-context.
	// Because we want both instances to use the same perf-data
	// we store them globally

	// eslint-disable-next-line no-var
	var sharedObj;
	if (typeof global === 'object') {
		// nodejs
		sharedObj = global;
	} else if (typeof self === 'object') {
		// browser
		sharedObj = self;
	} else {
		sharedObj = {};
	}

	if (typeof define === 'function') {
		// amd
		define([], function () { return _factory(sharedObj); });
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		// commonjs
		module.exports = _factory(sharedObj);
	} else {
		console.trace('perf-util defined in UNKNOWN context (neither requirejs or commonjs)');
		sharedObj.perf = _factory(sharedObj);
	}

})();
