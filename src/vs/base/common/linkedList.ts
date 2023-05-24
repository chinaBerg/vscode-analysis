/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Node
 * @description 链表中的节点
 */
class Node<E> {

	// 静态属性，一个只读的空节点
	static readonly Undefined = new Node<any>(undefined);

	element: E;
	next: Node<E>;
	prev: Node<E>;

	constructor(element: E) {
		this.element = element;
		// 指向链表中下个节点的指针
		this.next = Node.Undefined;
		// 指向链表中上个节点的指针
		this.prev = Node.Undefined;
	}
}

/**
 * LinkedList
 * @description 链表
 */
export class LinkedList<E> {

	private _first: Node<E> = Node.Undefined;
	private _last: Node<E> = Node.Undefined;
	private _size: number = 0;

	// 获取节点数量
	get size(): number {
		return this._size;
	}

	// 链表是否为空
	isEmpty(): boolean {
		return this._first === Node.Undefined;
	}

	// 清空链表
	clear(): void {
		let node = this._first;
		while (node !== Node.Undefined) {
			const next = node.next;
			node.prev = Node.Undefined;
			node.next = Node.Undefined;
			node = next;
		}

		this._first = Node.Undefined;
		this._last = Node.Undefined;
		this._size = 0;
	}

	// 从头部插入一个节点
	unshift(element: E): () => void {
		return this._insert(element, false);
	}

	// 从尾部插入一个节点
	push(element: E): () => void {
		return this._insert(element, true);
	}

	private _insert(element: E, atTheEnd: boolean): () => void {
		const newNode = new Node(element);
		// 空链表时直接插入在第一个节点
		if (this._first === Node.Undefined) {
			this._first = newNode;
			this._last = newNode;

		} else if (atTheEnd) {
			// push
			// 在最后插入一个节点
			const oldLast = this._last!;
			this._last = newNode;
			newNode.prev = oldLast;
			oldLast.next = newNode;

		} else {
			// unshift
			// 从前面插入一个节点
			const oldFirst = this._first;
			this._first = newNode;
			newNode.next = oldFirst;
			oldFirst.prev = newNode;
		}
		// 更新链表节点数量
		this._size += 1;

		// 返回一个用于删除新建节点的函数
		let didRemove = false;
		return () => {
			// 防止重复删除
			if (!didRemove) {
				didRemove = true;
				this._remove(newNode);
			}
		};
	}

	// 从头部取出一个节点
	shift(): E | undefined {
		if (this._first === Node.Undefined) {
			return undefined;
		} else {
			const res = this._first.element;
			this._remove(this._first);
			return res;
		}
	}

	// 从尾部取出一个节点
	pop(): E | undefined {
		if (this._last === Node.Undefined) {
			return undefined;
		} else {
			const res = this._last.element;
			this._remove(this._last);
			return res;
		}
	}

	private _remove(node: Node<E>): void {
		if (node.prev !== Node.Undefined && node.next !== Node.Undefined) {
			// middle
			const anchor = node.prev;
			anchor.next = node.next;
			node.next.prev = anchor;

		} else if (node.prev === Node.Undefined && node.next === Node.Undefined) {
			// only node
			this._first = Node.Undefined;
			this._last = Node.Undefined;

		} else if (node.next === Node.Undefined) {
			// last
			this._last = this._last!.prev!;
			this._last.next = Node.Undefined;

		} else if (node.prev === Node.Undefined) {
			// first
			this._first = this._first!.next!;
			this._first.prev = Node.Undefined;
		}

		// done
		this._size -= 1;
	}

	// 实现可迭代协议
	// 用于支持for/of循环
	*[Symbol.iterator](): Iterator<E> {
		let node = this._first;
		while (node !== Node.Undefined) {
			yield node.element;
			node = node.next;
		}
	}
}
