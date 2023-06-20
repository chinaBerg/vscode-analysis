/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

/**
 * The payload that flows in readable stream events.
 */
export type ReadableStreamEventPayload<T> = T | Error | 'end';

/**
 * 可读流事件接口，
 * 泛型 T 描述了 data 事件的 chunk 数据类型
 */
export interface ReadableStreamEvents<T> {

	/**
	 * The 'data' event is emitted whenever the stream is
	 * relinquishing ownership of a chunk of data to a consumer.
	 *
	 * NOTE: PLEASE UNDERSTAND THAT ADDING A DATA LISTENER CAN
	 * TURN THE STREAM INTO FLOWING MODE. IT IS THEREFOR THE
	 * LAST LISTENER THAT SHOULD BE ADDED AND NOT THE FIRST
	 *
	 * Use `listenStream` as a helper method to listen to
	 * stream events in the right order.
	 *
	 * on方法监听的data事件，
	 * 注意：一旦监听data事件，流将会进入流动模式（手动pause了除外）。
	 * 请使用listenStream方法正确的添加监听顺序
	 */
	on(event: 'data', callback: (data: T) => void): void;

	/**
	 * Emitted when any error occurs.
	 * on方法监听的error事件
	 */
	on(event: 'error', callback: (err: Error) => void): void;

	/**
	 * The 'end' event is emitted when there is no more data
	 * to be consumed from the stream. The 'end' event will
	 * not be emitted unless the data is completely consumed.
	 * on方法监听的end事件
	 */
	on(event: 'end', callback: () => void): void;
}

/**
 * A interface that emulates the API shape of a node.js readable
 * stream for use in native and web environments.
 * 可读流的接口，用于Node和Web环境
 */
export interface ReadableStream<T> extends ReadableStreamEvents<T> {

	/**
	 * Stops emitting any events until resume() is called.
	 * 暂停流
	 */
	pause(): void;

	/**
	 * Starts emitting events again after pause() was called.
	 * 消费流
	 */
	resume(): void;

	/**
	 * Destroys the stream and stops emitting any event.
	 * 销毁流
	 */
	destroy(): void;

	/**
	 * Allows to remove a listener that was previously added.
	 * 移除侦听事件
	 */
	removeListener(event: string, callback: Function): void;
}

/**
 * A interface that emulates the API shape of a node.js readable
 * for use in native and web environments.
 * 模拟Node的Readable接口
 */
export interface Readable<T> {

	/**
	 * Read data from the underlying source. Will return
	 * null to indicate that no more data can be read.
	 */
	read(): T | null;
}

/**
 * 是否是可读的
 */
export function isReadable<T>(obj: unknown): obj is Readable<T> {
	const candidate = obj as Readable<T> | undefined;
	if (!candidate) {
		return false;
	}

	// 只要拥有read方法则认为是可读的
	return typeof candidate.read === 'function';
}

/**
 * A interface that emulates the API shape of a node.js writeable
 * stream for use in native and web environments.
 * 可写流接口
 */
export interface WriteableStream<T> extends ReadableStream<T> {

	/**
	 * Writing data to the stream will trigger the on('data')
	 * event listener if the stream is flowing and buffer the
	 * data otherwise until the stream is flowing.
	 *
	 * If a `highWaterMark` is configured and writing to the
	 * stream reaches this mark, a promise will be returned
	 * that should be awaited on before writing more data.
	 * Otherwise there is a risk of buffering a large number
	 * of data chunks without consumer.
	 *
	 * 如果流处于流动状态，则往流写入数据会触发on('data')事件，
	 * 否则会缓存数据直到流进入流动状态。
	 *
	 * 如果配置了highWaterMark参数并且写入数据超出限制时，会返回一个promise对象用于在
	 * 写入更多数据之前进行等待。否则，会存在未消费情况下对接大量数据的风险。
	 */
	write(data: T): void | Promise<void>;

	/**
	 * Signals an error to the consumer of the stream via the
	 * on('error') handler if the stream is flowing.
	 *
	 * NOTE: call `end` to signal that the stream has ended,
	 * this DOES NOT happen automatically from `error`.
	 */
	error(error: Error): void;

	/**
	 * Signals the end of the stream to the consumer. If the
	 * result is provided, will trigger the on('data') event
	 * listener if the stream is flowing and buffer the data
	 * otherwise until the stream is flowing.
	 */
	end(result?: T): void;
}

/**
 * A stream that has a buffer already read. Returns the original stream
 * that was read as well as the chunks that got read.
 *
 * 可读的BufferedStream流
 *
 * The `ended` flag indicates if the stream has been fully consumed.
 */
export interface ReadableBufferedStream<T> {

	/**
	 * The original stream that is being read.
	 * 已经被读取的原始流
	 */
	stream: ReadableStream<T>;

	/**
	 * An array of chunks already read from this stream.
	 * 从该流中已经读取的chunks
	 */
	buffer: T[];

	/**
	 * Signals if the stream has ended or not. If not, consumers
	 * should continue to read from the stream until consumed.
	 * 指示流是否完全被消费，如果没有，消费者应该继续从流中读取，直到消费完为止
	 */
	ended: boolean;
}

/**
 * 判断目标是否为可读流
 */
export function isReadableStream<T>(obj: unknown): obj is ReadableStream<T> {
	const candidate = obj as ReadableStream<T> | undefined;
	if (!candidate) {
		return false;
	}

	// 鸭式辨型，只要拥有了on\puse\resume\destroy方法则认为是可读流
	return [candidate.on, candidate.pause, candidate.resume, candidate.destroy].every(fn => typeof fn === 'function');
}

/**
 * 判断目标是否为ReadableBufferedStream
 */
export function isReadableBufferedStream<T>(obj: unknown): obj is ReadableBufferedStream<T> {
	const candidate = obj as ReadableBufferedStream<T> | undefined;
	if (!candidate) {
		return false;
	}

	return isReadableStream(candidate.stream) && Array.isArray(candidate.buffer) && typeof candidate.ended === 'boolean';
}

export interface IReducer<T, R = T> {
	(data: T[]): R;
}

export interface IDataTransformer<Original, Transformed> {
	(data: Original): Transformed;
}

export interface IErrorTransformer {
	(error: Error): Error;
}

export interface ITransformer<Original, Transformed> {
	data: IDataTransformer<Original, Transformed>;
	error?: IErrorTransformer;
}

/**
 * 实例化一个可写流
 */
export function newWriteableStream<T>(reducer: IReducer<T>, options?: WriteableStreamOptions): WriteableStream<T> {
	return new WriteableStreamImpl<T>(reducer, options);
}

/**
 * 可写流Options选项接口
 */
export interface WriteableStreamOptions {

	/**
	 * The number of objects to buffer before WriteableStream#write()
	 * signals back that the buffer is full. Can be used to reduce
	 * the memory pressure when the stream is not flowing.
	 */
	highWaterMark?: number;
}

/**
 * VsCode的可写流实现
 */
class WriteableStreamImpl<T> implements WriteableStream<T> {

	/**
	 * 流的状态
	 */
	private readonly state = {
		/** 是否流动中 */
		flowing: false,
		/** 是否结束 */
		ended: false,
		/** 是否已销毁 */
		destroyed: false
	};

	/** buffer */
	private readonly buffer = {
		data: [] as T[],
		error: [] as Error[]
	};

	/** 侦听器 */
	private readonly listeners = {
		/** on('data')的侦听器 */
		data: [] as { (data: T): void }[],
		/** on('error')的侦听器 */
		error: [] as { (error: Error): void }[],
		/** on('end')的侦听器 */
		end: [] as { (): void }[]
	};

	private readonly pendingWritePromises: Function[] = [];

	constructor(private reducer: IReducer<T>, private options?: WriteableStreamOptions) { }

	// 暂停
	pause(): void {
		if (this.state.destroyed) {
			return;
		}

		// 将flowing状态设置为false
		this.state.flowing = false;
	}

	// 切换为流动模式
	resume(): void {
		if (this.state.destroyed) {
			return;
		}

		if (!this.state.flowing) {
			// 将flowing状态设置为true
			this.state.flowing = true;

			// emit buffered events
			// 触发相关事件
			this.flowData();
			this.flowErrors();
			this.flowEnd();
		}
	}

	// 往可写流中写入数据
	write(data: T): void | Promise<void> {
		// 流已销毁直接return
		if (this.state.destroyed) {
			return;
		}

		// flowing: directly send the data to listeners
		// 流动状态下：emit data事件给监听者
		if (this.state.flowing) {
			this.emitData(data);
		}

		// not yet flowing: buffer data until flowing
		// 非流动状态下：缓存data数据，一直到切换为流动状态为止
		else {
			this.buffer.data.push(data);

			// highWaterMark: if configured, signal back when buffer reached limits
			// 缓存数据超出阀值时，返回一个等待的指示，
			// 实际就是将resolve缓存到pendingWritePromises数组中等待被调用
			if (typeof this.options?.highWaterMark === 'number' && this.buffer.data.length > this.options.highWaterMark) {
				return new Promise(resolve => this.pendingWritePromises.push(resolve));
			}
		}
	}

	error(error: Error): void {
		if (this.state.destroyed) {
			return;
		}

		// flowing: directly send the error to listeners
		if (this.state.flowing) {
			this.emitError(error);
		}

		// not yet flowing: buffer errors until flowing
		else {
			this.buffer.error.push(error);
		}
	}

	end(result?: T): void {
		if (this.state.destroyed) {
			return;
		}

		// end with data if provided
		if (typeof result !== 'undefined') {
			this.write(result);
		}

		// flowing: send end event to listeners
		if (this.state.flowing) {
			this.emitEnd();

			this.destroy();
		}

		// not yet flowing: remember state
		else {
			this.state.ended = true;
		}
	}

	// 触发on('data')添加的所有侦听器事件
	private emitData(data: T): void {
		// slice是为了防止listeners数据突变
		this.listeners.data.slice(0).forEach(listener => listener(data)); // slice to avoid listener mutation from delivering event
	}

	// 触发on('error')添加的所有侦听器事件
	private emitError(error: Error): void {
		if (this.listeners.error.length === 0) {
			onUnexpectedError(error); // nobody listened to this error so we log it as unexpected
		} else {
			this.listeners.error.slice(0).forEach(listener => listener(error)); // slice to avoid listener mutation from delivering event
		}
	}

	// 触发on('end')添加的所有侦听器事件
	private emitEnd(): void {
		this.listeners.end.slice(0).forEach(listener => listener()); // slice to avoid listener mutation from delivering event
	}

	on(event: 'data', callback: (data: T) => void): void;
	on(event: 'error', callback: (err: Error) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: 'data' | 'error' | 'end', callback: (arg0?: any) => void): void {
		if (this.state.destroyed) {
			return;
		}

		switch (event) {
			case 'data':
				this.listeners.data.push(callback);

				// switch into flowing mode as soon as the first 'data'
				// listener is added and we are not yet in flowing mode
				// 侦听data事件后立即将流切换为流动模式
				this.resume();

				break;

			case 'end':
				this.listeners.end.push(callback);

				// emit 'end' event directly if we are flowing
				// and the end has already been reached
				//
				// finish() when it went through
				if (this.state.flowing && this.flowEnd()) {
					this.destroy();
				}

				break;

			case 'error':
				this.listeners.error.push(callback);

				// emit buffered 'error' events unless done already
				// now that we know that we have at least one listener
				if (this.state.flowing) {
					this.flowErrors();
				}

				break;
		}
	}

	// 移除指定事件的指定侦听器
	removeListener(event: string, callback: Function): void {
		if (this.state.destroyed) {
			return;
		}

		let listeners: unknown[] | undefined = undefined;

		switch (event) {
			case 'data':
				listeners = this.listeners.data;
				break;

			case 'end':
				listeners = this.listeners.end;
				break;

			case 'error':
				listeners = this.listeners.error;
				break;
		}

		if (listeners) {
			const index = listeners.indexOf(callback);
			if (index >= 0) {
				listeners.splice(index, 1);
			}
		}
	}

	// 流动数据
	private flowData(): void {
		if (this.buffer.data.length > 0) {
			// 通过reducer将缓存的data数据处理完整的数据
			const fullDataBuffer = this.reducer(this.buffer.data);

			// 触发on('data')添加的所有侦听器事件
			this.emitData(fullDataBuffer);
			// 置空缓存数据
			this.buffer.data.length = 0;

			// When the buffer is empty, resolve all pending writers
			// resolve所有的超出等待指示
			const pendingWritePromises = [...this.pendingWritePromises];
			this.pendingWritePromises.length = 0;
			pendingWritePromises.forEach(pendingWritePromise => pendingWritePromise());
		}
	}

	// 流动错误
	private flowErrors(): void {
		if (this.listeners.error.length > 0) {
			// 遍历所有错误数据，依次触发所有的错误事件侦听器
			for (const error of this.buffer.error) {
				this.emitError(error);
			}

			// 置空错误
			this.buffer.error.length = 0;
		}
	}

	// 流动结束
	private flowEnd(): boolean {
		if (this.state.ended) {
			this.emitEnd();

			return this.listeners.end.length > 0;
		}

		return false;
	}

	// 销毁流
	destroy(): void {
		// 重置所有状态
		if (!this.state.destroyed) {
			this.state.destroyed = true;
			this.state.ended = true;

			this.buffer.data.length = 0;
			this.buffer.error.length = 0;

			this.listeners.data.length = 0;
			this.listeners.error.length = 0;
			this.listeners.end.length = 0;

			this.pendingWritePromises.length = 0;
		}
	}
}

/**
 * Helper to fully read a T readable into a T.
 * 一个工具函数，
 * 消费可读流chunks，聚合成一个完整数据返回
 */
export function consumeReadable<T>(readable: Readable<T>, reducer: IReducer<T>): T {
	const chunks: T[] = [];

	let chunk: T | null;
	// 循环调用可读流的read方法获取数据
	while ((chunk = readable.read()) !== null) {
		chunks.push(chunk);
	}

	return reducer(chunks);
}

/**
 * Helper to read a T readable up to a maximum of chunks. If the limit is
 * reached, will return a readable instead to ensure all data can still
 * be read.
 * 一个工具函数，
 * 读取maxChunks次可读流中的数据，如果流未被消费完则返回可读流用于继续消费，否则直接返回聚合数据
 */
export function peekReadable<T>(readable: Readable<T>, reducer: IReducer<T>, maxChunks: number): T | Readable<T> {
	const chunks: T[] = [];

	let chunk: T | null | undefined = undefined;
	while ((chunk = readable.read()) !== null && chunks.length < maxChunks) {
		chunks.push(chunk);
	}

	// If the last chunk is null, it means we reached the end of
	// the readable and return all the data at once
	// 在maxChunks次之前已经消费完流，则直接返回流的聚合数据
	if (chunk === null && chunks.length > 0) {
		return reducer(chunks);
	}

	// Otherwise, we still have a chunk, it means we reached the maxChunks
	// value and as such we return a new Readable that first returns
	// the existing read chunks and then continues with reading from
	// the underlying readable.
	return {
		read: () => {

			// First consume chunks from our array
			// 先返回chunks中的数据
			if (chunks.length > 0) {
				return chunks.shift()!;
			}

			// Then ensure to return our last read chunk
			// 确保最后一次读取的chunk被处理（第maxChunks次）
			if (typeof chunk !== 'undefined') {
				const lastReadChunk = chunk;

				// explicitly use undefined here to indicate that we consumed
				// the chunk, which could have either been null or valued.
				chunk = undefined;

				return lastReadChunk;
			}

			// Finally delegate back to the Readable
			// 调用可读流的read方法获取流中剩余的数据
			return readable.read();
		}
	};
}

/**
 * Helper to fully read a T stream into a T or consuming
 * a stream fully, awaiting all the events without caring
 * about the data.
 */
export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer: IReducer<T, R>): Promise<R>;
export function consumeStream(stream: ReadableStreamEvents<unknown>): Promise<undefined>;
export function consumeStream<T, R = T>(stream: ReadableStreamEvents<T>, reducer?: IReducer<T, R>): Promise<R | undefined> {
	return new Promise((resolve, reject) => {
		const chunks: T[] = [];

		listenStream(stream, {
			onData: chunk => {
				if (reducer) {
					chunks.push(chunk);
				}
			},
			onError: error => {
				if (reducer) {
					reject(error);
				} else {
					resolve(undefined);
				}
			},
			onEnd: () => {
				if (reducer) {
					resolve(reducer(chunks));
				} else {
					resolve(undefined);
				}
			}
		});
	});
}

export interface IStreamListener<T> {

	/**
	 * The 'data' event is emitted whenever the stream is
	 * relinquishing ownership of a chunk of data to a consumer.
	 */
	onData(data: T): void;

	/**
	 * Emitted when any error occurs.
	 */
	onError(err: Error): void;

	/**
	 * The 'end' event is emitted when there is no more data
	 * to be consumed from the stream. The 'end' event will
	 * not be emitted unless the data is completely consumed.
	 */
	onEnd(): void;
}

/**
 * Helper to listen to all events of a T stream in proper order.
 */
export function listenStream<T>(stream: ReadableStreamEvents<T>, listener: IStreamListener<T>): IDisposable {
	let destroyed = false;

	stream.on('error', error => {
		if (!destroyed) {
			listener.onError(error);
		}
	});

	stream.on('end', () => {
		if (!destroyed) {
			listener.onEnd();
		}
	});

	// Adding the `data` listener will turn the stream
	// into flowing mode. As such it is important to
	// add this listener last (DO NOT CHANGE!)
	stream.on('data', data => {
		if (!destroyed) {
			listener.onData(data);
		}
	});

	return toDisposable(() => destroyed = true);
}

/**
 * Helper to peek up to `maxChunks` into a stream. The return type signals if
 * the stream has ended or not. If not, caller needs to add a `data` listener
 * to continue reading.
 *
 * 一个帮助程序，用于向上窥探流的maxChunks。
 * 返回的ended值用于指示流是否已经结束，如果没有结束则需要调用者自己添加data监听器继续获取流
 */
export function peekStream<T>(stream: ReadableStream<T>, maxChunks: number): Promise<ReadableBufferedStream<T>> {
	return new Promise((resolve, reject) => {
		const streamListeners = new DisposableStore();
		const buffer: T[] = [];

		// Data Listener
		const dataListener = (chunk: T) => {

			// Add to buffer
			buffer.push(chunk);

			// We reached maxChunks and thus need to return
			// 达到maxChunks数量时需要返回
			if (buffer.length > maxChunks) {

				// Dispose any listeners and ensure to pause the
				// stream so that it can be consumed again by caller
				streamListeners.dispose();
				// 暂停流
				stream.pause();

				// 此时流并未end，因此返回的ended值为false
				return resolve({ stream, buffer, ended: false });
			}
		};

		// Error Listener
		const errorListener = (error: Error) => {
			return reject(error);
		};

		// End Listener
		const endListener = () => {
			// 此时流已经未end，因此返回的ended值为true
			return resolve({ stream, buffer, ended: true });
		};

		streamListeners.add(toDisposable(() => stream.removeListener('error', errorListener)));
		stream.on('error', errorListener);

		streamListeners.add(toDisposable(() => stream.removeListener('end', endListener)));
		stream.on('end', endListener);

		// Important: leave the `data` listener last because
		// this can turn the stream into flowing mode and we
		// want `error` events to be received as well.
		streamListeners.add(toDisposable(() => stream.removeListener('data', dataListener)));
		// 监听data事件
		stream.on('data', dataListener);
	});
}

/**
 * Helper to create a readable stream from an existing T.
 */
export function toStream<T>(t: T, reducer: IReducer<T>): ReadableStream<T> {
	const stream = newWriteableStream<T>(reducer);

	stream.end(t);

	return stream;
}

/**
 * Helper to create an empty stream
 */
export function emptyStream(): ReadableStream<never> {
	const stream = newWriteableStream<never>(() => { throw new Error('not supported'); });
	stream.end();

	return stream;
}

/**
 * Helper to convert a T into a Readable<T>.
 */
export function toReadable<T>(t: T): Readable<T> {
	let consumed = false;

	return {
		read: () => {
			if (consumed) {
				return null;
			}

			consumed = true;

			return t;
		}
	};
}

/**
 * Helper to transform a readable stream into another stream.
 */
export function transform<Original, Transformed>(stream: ReadableStreamEvents<Original>, transformer: ITransformer<Original, Transformed>, reducer: IReducer<Transformed>): ReadableStream<Transformed> {
	const target = newWriteableStream<Transformed>(reducer);

	listenStream(stream, {
		onData: data => target.write(transformer.data(data)),
		onError: error => target.error(transformer.error ? transformer.error(error) : error),
		onEnd: () => target.end()
	});

	return target;
}

/**
 * Helper to take an existing readable that will
 * have a prefix injected to the beginning.
 */
export function prefixedReadable<T>(prefix: T, readable: Readable<T>, reducer: IReducer<T>): Readable<T> {
	let prefixHandled = false;

	return {
		read: () => {
			const chunk = readable.read();

			// Handle prefix only once
			if (!prefixHandled) {
				prefixHandled = true;

				// If we have also a read-result, make
				// sure to reduce it to a single result
				if (chunk !== null) {
					return reducer([prefix, chunk]);
				}

				// Otherwise, just return prefix directly
				return prefix;
			}

			return chunk;
		}
	};
}

/**
 * Helper to take an existing stream that will
 * have a prefix injected to the beginning.
 */
export function prefixedStream<T>(prefix: T, stream: ReadableStream<T>, reducer: IReducer<T>): ReadableStream<T> {
	let prefixHandled = false;

	const target = newWriteableStream<T>(reducer);

	listenStream(stream, {
		onData: data => {

			// Handle prefix only once
			if (!prefixHandled) {
				prefixHandled = true;

				return target.write(reducer([prefix, data]));
			}

			return target.write(data);
		},
		onError: error => target.error(error),
		onEnd: () => {

			// Handle prefix only once
			if (!prefixHandled) {
				prefixHandled = true;

				target.write(prefix);
			}

			target.end();
		}
	});

	return target;
}
