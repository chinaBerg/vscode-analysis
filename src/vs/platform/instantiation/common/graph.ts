/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Node<T> {


	readonly incoming = new Map<string, Node<T>>();
	readonly outgoing = new Map<string, Node<T>>();

	// 等同于：
	// this.key = key
	// this.data = data
	constructor(
		readonly key: string,
		readonly data: T
	) { }
}

export class Graph<T> {

	private readonly _nodes = new Map<string, Node<T>>();

	/**
	 * @param _hashFn 自定义节点key的生成函数
	 */
	constructor(private readonly _hashFn: (element: T) => string) {
		// empty
	}

	// 查找图中的所有根节点
	// 根节点是所有未被其他节点依赖的节点
	roots(): Node<T>[] {
		const ret: Node<T>[] = [];
		for (const node of this._nodes.values()) {
			if (node.outgoing.size === 0) {
				ret.push(node);
			}
		}
		return ret;
	}

	// 插入节点
	// 并且建立节点直接的依赖关系
	insertEdge(from: T, to: T): void {
		const fromNode = this.lookupOrInsertNode(from);
		const toNode = this.lookupOrInsertNode(to);

		fromNode.outgoing.set(toNode.key, toNode);
		toNode.incoming.set(fromNode.key, fromNode);
	}

	// 删除节点
	// 同时删除所有节点中对被删除节点的依赖关系
	removeNode(data: T): void {
		const key = this._hashFn(data);
		this._nodes.delete(key);
		for (const node of this._nodes.values()) {
			node.outgoing.delete(key);
			node.incoming.delete(key);
		}
	}

	/**
	 * 查询或插入节点
	 */
	lookupOrInsertNode(data: T): Node<T> {
		// data调用自定义的_hashFn方法转换成key字符串
		const key = this._hashFn(data);
		// 根据key获取节点
		let node = this._nodes.get(key);

		// 节点不存在则创建并插入节点
		if (!node) {
			node = new Node(key, data);
			this._nodes.set(key, node);
		}

		// 返回节点
		return node;
	}

	lookup(data: T): Node<T> | undefined {
		return this._nodes.get(this._hashFn(data));
	}

	isEmpty(): boolean {
		return this._nodes.size === 0;
	}

	toString(): string {
		const data: string[] = [];
		for (const [key, value] of this._nodes) {
			data.push(`${key}\n\t(-> incoming)[${[...value.incoming.keys()].join(', ')}]\n\t(outgoing ->)[${[...value.outgoing.keys()].join(',')}]\n`);

		}
		return data.join('\n');
	}

	/**
	 * This is brute force and slow and **only** be used
	 * to trouble shoot.
	 */
	findCycleSlow() {
		for (const [id, node] of this._nodes) {
			const seen = new Set<string>([id]);
			// 查找出现循环依赖的链路
			// 具体实现在_findCycle函数中
			const res = this._findCycle(node, seen);
			if (res) {
				return res;
			}
		}
		return undefined;
	}

	private _findCycle(node: Node<T>, seen: Set<string>): string | undefined {
		// 遍历所有节点
		// 递归每个节点在自己依赖节点及依赖节点的依赖节点中（深度遍历）是否存在循环引用
		// e.g. A -> B/C, B -> A，A节点依赖B节点，B的outgoing依赖节点中也依赖了A，便出现了循环依赖
		// 此时根据出现循环依赖的链路，输出依赖链路的message消息，如：'A -> B'
		for (const [id, outgoing] of node.outgoing) {
			if (seen.has(id)) {
				return [...seen, id].join(' -> ');
			}
			seen.add(id);
			// 递归
			const value = this._findCycle(outgoing, seen);
			if (value) {
				return value;
			}
			seen.delete(id);
		}
		return undefined;
	}
}
