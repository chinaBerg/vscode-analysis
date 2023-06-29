/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { regExpFlags } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';
import { MarshalledId } from './marshallingIds';

export function stringify(obj: any): string {
	return JSON.stringify(obj, replacer);
}

export function parse(text: string): any {
	let data = JSON.parse(text);
	data = revive(data);
	return data;
}

export interface MarshalledObject {
	$mid: MarshalledId;
}

function replacer(key: string, value: any): any {
	// URI is done via toJSON-member
	if (value instanceof RegExp) {
		return {
			$mid: MarshalledId.Regexp,
			source: value.source,
			flags: regExpFlags(value),
		};
	}
	return value;
}


type Deserialize<T> = T extends UriComponents ? URI
	: T extends VSBuffer ? VSBuffer
	: T extends object
	? Revived<T>
	: T;

export type Revived<T> = { [K in keyof T]: Deserialize<T[K]> };

// 对编组数据恢复还原，如果是URI、正则或者日期方法，进行数据欢迎，
// 即根据编组后的数据重新创建目标类型数据
export function revive<T = any>(obj: any, depth = 0): Revived<T> {
	// 最大处理200层深
	if (!obj || depth > 200) {
		return obj;
	}

	if (typeof obj === 'object') {

		switch ((<MarshalledObject>obj).$mid) {
			// uri则调用URI.revive复原
			case MarshalledId.Uri: return <any>URI.revive(obj);
			// 正则表达式对象则重新创建新的正则表达式
			case MarshalledId.Regexp: return <any>new RegExp(obj.source, obj.flags);
			// 日期对象则重新创建日期对象
			case MarshalledId.Date: return <any>new Date(obj.source);
		}

		// node buffer 或 web arrary buffer，直接返回
		if (
			obj instanceof VSBuffer
			|| obj instanceof Uint8Array
		) {
			return <any>obj;
		}

		// 数组
		if (Array.isArray(obj)) {
			// 对数组没想数据重新编组复原
			for (let i = 0; i < obj.length; ++i) {
				obj[i] = revive(obj[i], depth + 1);
			}
		} else {
			// walk object
			// 对象，递归每一个key值重新进行编组复原
			for (const key in obj) {
				if (Object.hasOwnProperty.call(obj, key)) {
					obj[key] = revive(obj[key], depth + 1);
				}
			}
		}
	}

	return obj;
}
