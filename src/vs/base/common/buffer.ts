/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as streams from 'vs/base/common/stream';

declare const Buffer: any;

const hasBuffer = (typeof Buffer !== 'undefined');

// 文本编码器
let textEncoder: TextEncoder | null;
// 文本解码器
let textDecoder: TextDecoder | null;

/**
 * VSBuffer
 * VsCode 封装的Buffer对象，
 * NodeJs环境下使用Node的Buffer模块实现，
 * Web环境下使用8位无符号整型数组的Unit8Array和文本编解码实现。
 * 使用Unit8Array的原因是，Node的Buffer实际是Unit8Array的子类
 */
export class VSBuffer {

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 * 生成指定字节长度的buffer，
	 * 根据环境判断生成NodeJs的Buffer或者非NodeJS环境的ArrayBuffer
	 */
	static alloc(byteLength: number): VSBuffer {
		if (hasBuffer) {
			// Buffer.allocUnsafe 比 Buffer.alloc 拥有额外的性能提升
			return new VSBuffer(Buffer.allocUnsafe(byteLength));
		} else {
			return new VSBuffer(new Uint8Array(byteLength));
		}
	}

	/**
	 * When running in a nodejs context, if `actual` is not a nodejs Buffer, the backing store for
	 * the returned `VSBuffer` instance might use a nodejs Buffer allocated from node's Buffer pool,
	 * which is not transferrable.
	 */
	static wrap(actual: Uint8Array): VSBuffer {
		if (hasBuffer && !(Buffer.isBuffer(actual))) {
			// https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
			// Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
			actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
		}
		return new VSBuffer(actual);
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 * 将字符串转换成VsBuffer格式
	 * - 支持Node的Buffer方式转换
	 * - 支持TextEncoder方式转换
	 */
	static fromString(source: string, options?: { dontUseNodeBuffer?: boolean }): VSBuffer {
		const dontUseNodeBuffer = options?.dontUseNodeBuffer || false;
		// 使用NodeJs的Buffer.from转换buffer，
		// 在没有明确禁用NodeJs并且支持NodeJsBuffer的情况下
		if (!dontUseNodeBuffer && hasBuffer) {
			return new VSBuffer(Buffer.from(source));
		} else {
			// 确保已创建TextEncoder实例
			if (!textEncoder) {
				textEncoder = new TextEncoder();
			}
			// 通过TextEncoder编码成buffer格式
			return new VSBuffer(textEncoder.encode(source));
		}
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 * 将字节数组转换成VsBuffer
	 */
	static fromByteArray(source: number[]): VSBuffer {
		// 根据字节数组长度申请缓冲区
		const result = VSBuffer.alloc(source.length);
		// 迭代字节数组，将数据推入缓冲区对象
		for (let i = 0, len = source.length; i < len; i++) {
			result.buffer[i] = source[i];
		}
		return result;
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 * 将多个VSBuffer聚合成一个新的VSBuffer
	 */
	static concat(buffers: VSBuffer[], totalLength?: number): VSBuffer {
		// 获取多个VSBuffer的长度之和
		if (typeof totalLength === 'undefined') {
			totalLength = 0;
			for (let i = 0, len = buffers.length; i < len; i++) {
				totalLength += buffers[i].byteLength;
			}
		}

		// 申请一个新的VSBuffer
		const ret = VSBuffer.alloc(totalLength);
		let offset = 0;
		// 依次将每个VSBuffer的数据塞进新的VSBuffer之中
		for (let i = 0, len = buffers.length; i < len; i++) {
			const element = buffers[i];
			ret.set(element, offset);
			offset += element.byteLength;
		}

		return ret;
	}

	readonly buffer: Uint8Array;
	readonly byteLength: number;

	// NodeJs的Buffer类是JS的Unit8Array的子类
	private constructor(buffer: Uint8Array) {
		// VSBuffer实例用于buffer和byteLength属性
		this.buffer = buffer;
		this.byteLength = this.buffer.byteLength;
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	clone(): VSBuffer {
		const result = VSBuffer.alloc(this.byteLength);
		result.set(this);
		return result;
	}

	/**
	 * 实现toString方法，
	 * 将buffer转换成string
	 * @returns
	 */
	toString(): string {
		if (hasBuffer) {
			// 调用buffer的toString方法进行转换
			return this.buffer.toString();
		} else {
			if (!textDecoder) {
				textDecoder = new TextDecoder();
			}
			// 利用文本解码器将字节流转换成字符串
			return textDecoder.decode(this.buffer);
		}
	}

	slice(start?: number, end?: number): VSBuffer {
		// IMPORTANT: use subarray instead of slice because TypedArray#slice
		// creates shallow copy and NodeBuffer#slice doesn't. The use of subarray
		// ensures the same, performance, behaviour.
		return new VSBuffer(this.buffer.subarray(start, end));
	}

	set(array: VSBuffer, offset?: number): void;
	set(array: Uint8Array, offset?: number): void;
	set(array: ArrayBuffer, offset?: number): void;
	set(array: ArrayBufferView, offset?: number): void;
	set(array: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;
	set(array: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void {
		if (array instanceof VSBuffer) {
			this.buffer.set(array.buffer, offset);
		} else if (array instanceof Uint8Array) {
			this.buffer.set(array, offset);
		} else if (array instanceof ArrayBuffer) {
			this.buffer.set(new Uint8Array(array), offset);
		} else if (ArrayBuffer.isView(array)) {
			this.buffer.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
		} else {
			throw new Error(`Unknown argument 'array'`);
		}
	}

	readUInt32BE(offset: number): number {
		return readUInt32BE(this.buffer, offset);
	}

	writeUInt32BE(value: number, offset: number): void {
		writeUInt32BE(this.buffer, value, offset);
	}

	readUInt32LE(offset: number): number {
		return readUInt32LE(this.buffer, offset);
	}

	writeUInt32LE(value: number, offset: number): void {
		writeUInt32LE(this.buffer, value, offset);
	}

	readUInt8(offset: number): number {
		return readUInt8(this.buffer, offset);
	}

	writeUInt8(value: number, offset: number): void {
		writeUInt8(this.buffer, value, offset);
	}
}

export function readUInt16LE(source: Uint8Array, offset: number): number {
	return (
		((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0)
	);
}

export function writeUInt16LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = (value & 0b11111111);
	value = value >>> 8;
	destination[offset + 1] = (value & 0b11111111);
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
	);
}

export function writeUInt32BE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 3] = value;
	value = value >>> 8;
	destination[offset + 2] = value;
	value = value >>> 8;
	destination[offset + 1] = value;
	value = value >>> 8;
	destination[offset] = value;
}

export function readUInt32LE(source: Uint8Array, offset: number): number {
	return (
		((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0) |
		((source[offset + 2] << 16) >>> 0) |
		((source[offset + 3] << 24) >>> 0)
	);
}

export function writeUInt32LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = (value & 0b11111111);
	value = value >>> 8;
	destination[offset + 1] = (value & 0b11111111);
	value = value >>> 8;
	destination[offset + 2] = (value & 0b11111111);
	value = value >>> 8;
	destination[offset + 3] = (value & 0b11111111);
}

export function readUInt8(source: Uint8Array, offset: number): number {
	return source[offset];
}

export function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value;
}

export interface VSBufferReadable extends streams.Readable<VSBuffer> { }

export interface VSBufferReadableStream extends streams.ReadableStream<VSBuffer> { }

export interface VSBufferWriteableStream extends streams.WriteableStream<VSBuffer> { }

export interface VSBufferReadableBufferedStream extends streams.ReadableBufferedStream<VSBuffer> { }

export function readableToBuffer(readable: VSBufferReadable): VSBuffer {
	return streams.consumeReadable<VSBuffer>(readable, chunks => VSBuffer.concat(chunks));
}

export function bufferToReadable(buffer: VSBuffer): VSBufferReadable {
	return streams.toReadable<VSBuffer>(buffer);
}

// 将流转换成VSBuffer
export function streamToBuffer(stream: streams.ReadableStream<VSBuffer>): Promise<VSBuffer> {
	return streams.consumeStream<VSBuffer>(stream, chunks => VSBuffer.concat(chunks));
}

export async function bufferedStreamToBuffer(bufferedStream: streams.ReadableBufferedStream<VSBuffer>): Promise<VSBuffer> {
	if (bufferedStream.ended) {
		return VSBuffer.concat(bufferedStream.buffer);
	}

	return VSBuffer.concat([

		// Include already read chunks...
		...bufferedStream.buffer,

		// ...and all additional chunks
		await streamToBuffer(bufferedStream.stream)
	]);
}

export function bufferToStream(buffer: VSBuffer): streams.ReadableStream<VSBuffer> {
	return streams.toStream<VSBuffer>(buffer, chunks => VSBuffer.concat(chunks));
}

export function streamToBufferReadableStream(stream: streams.ReadableStreamEvents<Uint8Array | string>): streams.ReadableStream<VSBuffer> {
	return streams.transform<Uint8Array | string, VSBuffer>(stream, { data: data => typeof data === 'string' ? VSBuffer.fromString(data) : VSBuffer.wrap(data) }, chunks => VSBuffer.concat(chunks));
}

export function newWriteableBufferStream(options?: streams.WriteableStreamOptions): streams.WriteableStream<VSBuffer> {
	return streams.newWriteableStream<VSBuffer>(chunks => VSBuffer.concat(chunks), options);
}

export function prefixedBufferReadable(prefix: VSBuffer, readable: VSBufferReadable): VSBufferReadable {
	return streams.prefixedReadable(prefix, readable, chunks => VSBuffer.concat(chunks));
}

export function prefixedBufferStream(prefix: VSBuffer, stream: VSBufferReadableStream): VSBufferReadableStream {
	return streams.prefixedStream(prefix, stream, chunks => VSBuffer.concat(chunks));
}

/** Decodes base64 to a uint8 array. URL-encoded and unpadded base64 is allowed. */
export function decodeBase64(encoded: string) {
	let building = 0;
	let remainder = 0;
	let bufi = 0;

	// The simpler way to do this is `Uint8Array.from(atob(str), c => c.charCodeAt(0))`,
	// but that's about 10-20x slower than this function in current Chromium versions.

	const buffer = new Uint8Array(Math.floor(encoded.length / 4 * 3));
	const append = (value: number) => {
		switch (remainder) {
			case 3:
				buffer[bufi++] = building | value;
				remainder = 0;
				break;
			case 2:
				buffer[bufi++] = building | (value >>> 2);
				building = value << 6;
				remainder = 3;
				break;
			case 1:
				buffer[bufi++] = building | (value >>> 4);
				building = value << 4;
				remainder = 2;
				break;
			default:
				building = value << 2;
				remainder = 1;
		}
	};

	for (let i = 0; i < encoded.length; i++) {
		const code = encoded.charCodeAt(i);
		// See https://datatracker.ietf.org/doc/html/rfc4648#section-4
		// This branchy code is about 3x faster than an indexOf on a base64 char string.
		if (code >= 65 && code <= 90) {
			append(code - 65); // A-Z starts ranges from char code 65 to 90
		} else if (code >= 97 && code <= 122) {
			append(code - 97 + 26); // a-z starts ranges from char code 97 to 122, starting at byte 26
		} else if (code >= 48 && code <= 57) {
			append(code - 48 + 52); // 0-9 starts ranges from char code 48 to 58, starting at byte 52
		} else if (code === 43 || code === 45) {
			append(62); // "+" or "-" for URLS
		} else if (code === 47 || code === 95) {
			append(63); // "/" or "_" for URLS
		} else if (code === 61) {
			break; // "="
		} else {
			throw new SyntaxError(`Unexpected base64 character ${encoded[i]}`);
		}
	}

	const unpadded = bufi;
	while (remainder > 0) {
		append(0);
	}

	// slice is needed to account for overestimation due to padding
	return VSBuffer.wrap(buffer).slice(0, unpadded);
}

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64UrlSafeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Encodes a buffer to a base64 string. */
export function encodeBase64({ buffer }: VSBuffer, padded = true, urlSafe = false) {
	const dictionary = urlSafe ? base64UrlSafeAlphabet : base64Alphabet;
	let output = '';

	const remainder = buffer.byteLength % 3;

	let i = 0;
	for (; i < buffer.byteLength - remainder; i += 3) {
		const a = buffer[i + 0];
		const b = buffer[i + 1];
		const c = buffer[i + 2];

		output += dictionary[a >>> 2];
		output += dictionary[(a << 4 | b >>> 4) & 0b111111];
		output += dictionary[(b << 2 | c >>> 6) & 0b111111];
		output += dictionary[c & 0b111111];
	}

	if (remainder === 1) {
		const a = buffer[i + 0];
		output += dictionary[a >>> 2];
		output += dictionary[(a << 4) & 0b111111];
		if (padded) { output += '=='; }
	} else if (remainder === 2) {
		const a = buffer[i + 0];
		const b = buffer[i + 1];
		output += dictionary[a >>> 2];
		output += dictionary[(a << 4 | b >>> 4) & 0b111111];
		output += dictionary[(b << 2) & 0b111111];
		if (padded) { output += '='; }
	}

	return output;
}
