/**
 * 该文件是辅助文件 为 diff 算法提供一些辅助方法
 */

import { Placement } from "../shared/utils";

/**
 * 判断两个节点是否相同
 * 1、在同一层级下面
 * 2、类型相同 type
 * 3、 key 相同
 * @param {*} a 新的 vnode 节点
 * @param {*} b 旧的 fiber 节点
 */
export function sameNode(a, b) {
	return a && b && a.type === b.type && a.key === b.key;
}

/**
 * 该方法专门用于更新 lastPlacedIndex
 * @param {*} newFiber 刚刚创建的新的 fiber 对象
 * @param {*} lastPlacedIndex lastPlacedIndex 表示"最后一个不需要移动的节点在旧链表中的位置索引"
                              它的核心作用是：判断节点是否需要移动，而不是每次都重新插入所有节点。
 * @param {*} newIndex 当前的索引 初始值 0
 * @param {*} shouldTrackSideEffects 用于判断 returnFiber是初次渲染还是更新
 */
export function placeChild(
	newFiber,
	lastPlacedIndex,
	newIndex,
	shouldTrackSideEffects
) {
	// 更新 fiber 对象上的 index， 其记录了当前节点在当前层级的位置
	newFiber.index = newIndex;
	if (!shouldTrackSideEffects) {
		// 条件：初次渲染，不需要追踪副作用
		// 逻辑：直接返回 lastPlacedIndex，因为初次渲染所有节点都是新增的，不需要判断移动
		// 效果：所有节点都会标记为 Placement
		// 组件初次渲染 不需要记录节点的位置 (lastPlacedIndex)
		return lastPlacedIndex;
	}
	// 首先拿到旧的 fiber 节点
	const current = newFiber.alternate;
	if (current) {
		// 有对应旧节点（更新情况）
		const oldIndex = current.index;
		if (oldIndex < lastPlacedIndex) {
			// 条件：节点在旧链表中的位置比最后一个稳定节点还要靠前
			// 含义：这个节点"跑到后面去了"，需要移动
			// 示例：
			// text
			// 旧顺序: A(0) -> B(1) -> C(2) -> D(3)
			// 新顺序: C -> D -> A -> B

			// 处理过程：
			// - C: oldIndex=2, lastPlacedIndex=0 → 更新lastPlacedIndex=2
			// - D: oldIndex=3, lastPlacedIndex=2 → 更新lastPlacedIndex=3
			// - A: oldIndex=0, lastPlacedIndex=3 → 0<3，需要移动！
			// - B: oldIndex=1, lastPlacedIndex=3 → 1<3，需要移动！
			// 说明当前的节点是需要移动的
			newFiber.flags |= Placement;
			return lastPlacedIndex;
		} else {
			// 条件：节点在旧链表中的位置在最后一个稳定节点之后或相同
			// 含义：节点相对位置正确，不需要移动
			// 效果：更新 lastPlacedIndex 为当前节点的 oldIndex
			// 进入此分支，说明 oldIndex 应该作为最新的 lastPlacedIndex
			return oldIndex;
		}
	} else {
		// 条件：没有对应的旧节点（完全新增）
		// 逻辑：标记为新增，lastPlacedIndex 不变
		// 原因：新增节点不影响已有节点的相对位置判断
		// 说明该 fiber 节点是初次渲染
		newFiber.flags |= Placement;
		return lastPlacedIndex;
	}
}

/**
 *
 * @param {*} returnFiber 父 fiber
 * @param {*} childToDelete 需要删除的子 fiber
 */
export function deleteChild(returnFiber, childToDelete) {
	// 这里的删除只是标记一下 真正的删除在 commit 阶段
	// 将要删除的 fiber 放入到一个数组中
	const deletions = returnFiber.deletions;
	if (deletions) {
		returnFiber.deletions.push(childToDelete);
	} else {
		// 第一次是没有这个数组的 那么我们初始一个数组
		// 并且将这个 childToDelete 放入其中
		returnFiber.deletions = [childToDelete];
	}
}

/**
 * 这里要删除多个节点 核心思想也就是一个个去删除
 * @param {*} returnFiber 父 fiber 对象
 * @param {*} currentFirstChild 旧的第一个待删除的 fiber
 */
export function deleteRemainingChildren(returnFiber, currentFirstChild) {
	let childToDelete = currentFirstChild;
	while (childToDelete) {
		deleteChild(returnFiber, childToDelete);
		childToDelete = childToDelete.sibling;
	}
}

/**
 * 将旧的子节点构建到一个 map 结构里面
 * @param {*} currentFirstChild
 */
export function mapRemainingChildren(currentFirstChild) {
	// 创建一个 Map
	const existingChildren = new Map();
	let existingChild = currentFirstChild;
	while (existingChild) {
		existingChildren.set(
			existingChild.key || existingChild.index,
			existingChild
		);
		// 切换到下一个兄弟节点
		existingChild = existingChild.sibling;
	}
	return existingChildren;
}
