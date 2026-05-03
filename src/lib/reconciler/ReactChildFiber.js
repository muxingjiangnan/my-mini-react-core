import { isStrOrNum, isArray, Update } from "../shared/utils";
import createFiber from "../reconciler/ReactFiber";
import {
	sameNode,
	placeChild,
	deleteRemainingChildren,
	mapRemainingChildren,
	deleteChild,
} from "./ReactChildFiberAssistant";

/**
 * React Diff 算法：协调子节点，构建 fiber 链表。
 * @param {*} returnFiber 父 fiber
 * @param {*} children 新子节点的 vnode 数组
 */
export function reconcileChildren(returnFiber, children) {
	// 文本节点已经在 updateNode 处理过了
	if (isStrOrNum(children)) return;
	// 规范化为 vnode 数组
	const normalizedChildren = isArray(children) ? children : [children];
	let lastNewFiber = null; // 上一个创建的新 fiber，用于链接 sibling
	let oldFiber = returnFiber.alternate?.child; // 当前位置对应的旧 fiber（更新时才有）
	let i = 0; // normalizedChildren 数组索引
	let lastPlacedIndex = 0; // 上次次插入的最远位置，用于判断节点是否需要移动
	// 是否是初次渲染: true=更新，false=初次渲染
	let isUpdate = !!returnFiber.alternate;
	// 暂存 oldFiber ，以便 sameNode 判断不可复用，跳出第一次遍历
	// 暂存下一个旧 fiber
	let nextOldFiber = null;
	//  整体来讲分为 5 个大的步骤:
	//  1. 第一轮遍历，从左往右遍历新节点（vnode），在遍历的同时比较新旧节点（旧节点是 fiber 对象）
	//     (1)节点可以复用，则复用，循环继续往右走 (sibling)
	//     (2)节点不能复用，那么就跳出循环，结束第一轮遍历
	//  2. 检查 normalizedChildren 是否完成了遍历，因为上一步结束，就两种情况:
	//     (1)提前跳出
	//     (2)遍历完跳出，新节点全部复用，旧节点（fiber对象）还有剩余，删除旧节点
	//  3. 初次渲染或旧节点已耗尽:
	//     !oldFiber 表示旧节点链表已经走到头了（或一开始就没有）
	//     剩余的新节点全部创建新 fiber，挂载到 fiber 链表。
	//  4. 新旧节点都剩余 —— Map 查找复用
	//     (1)将剩余旧节点构建成 Map<key, fiber>
	//     (2)遍历剩余新节点，用 key (或 type-index )去 Map 中查找可复用的旧节点。
	//         找到则复用(继承 stateNode 和 alternate )，并且会从 Map 中删除对应的旧节点
	//      注意: 即使 type + key 相同能复用，仍需要通过 placeChild 判断是否移动位置(标记 flags)。
	//  5. 清理 Map 中剩余的旧节点，标记为删除，在 commit 阶段统一处理。

	// 1. 第一轮遍历，从左往右遍历新节点（vnode），在遍历的同时比较新旧节点（旧节点是 fiber 对象）
	// 第一轮遍历，会尝试复用节点
	// 复用节点意味着你首先得有这些节点，才能说能不能复用的问题
	for (; oldFiber && i < normalizedChildren.length; i++) {
		// 第一次是不会进入到这个循环的，因为一开始压根儿没有 oldFiber
		// 首先拿到当前的 vnode
		const newChild = normalizedChildren[i];
		if (newChild === null) continue;

		// 在判断是否能够复用之前，先给 nextOldFiber 赋值
		// 这里有一种情况
		// old 一开始是 1 2 3 4 5，进行了一些修改，现在只剩下 5 和 4
		// old >> 5(4) 4(3)
		// new >> 4(3) 1 2 3 5(4)
		// 此时旧的节点的 index 是大于 i，因此需要将 nextOldFiber 暂存为 oldFiber
		if (oldFiber.index > i) {
			nextOldFiber = oldFiber;
			oldFiber = null;
		} else {
			nextOldFiber = oldFiber.sibling;
		}

		// 接下来下一步，就是判断是否能够复用
		const same = sameNode(newChild, oldFiber);

		if (!same) {
			// 在退出第一轮遍历之前，会做一些额外的工作
			if (oldFiber === null) {
				// 需要将 oldFiber 原本的值还原，方便后面使用
				oldFiber = nextOldFiber;
			}
			// 如果不能复用，那么就跳出循环，第一轮遍历就结束了
			break;
		}

		// 如果没有进入到上面的 if，那么代码走到这里，就说明可以复用
		const newFiber = createFiber(newChild, returnFiber);
		// 复用旧 fiber 上面的部分信息，特别是 DOM 节点
		Object.assign(newFiber, {
			stateNode: oldFiber.stateNode,
			alternate: oldFiber,
			flags: Update,
		});

		// 更新 lastPlacedIndex 的值
		lastPlacedIndex = placeChild(
			newFiber,
			lastPlacedIndex,
			i,
			isUpdate,
		);

		// 最后，需要将 newFiber 加入到 fiber 链表中去
		if (lastNewFiber === null) {
			// 说明你是第一个子节点
			returnFiber.child = newFiber;
		} else {
			// 进入此分支，说明当前生成的 fiber 节点并非父 fiber 的第一个节点
			lastNewFiber.sibling = newFiber;
		}

		// 将 lastNewFiber 设置为 newFiber
		lastNewFiber = newFiber;
		// oldFiber 存储下一个旧节点信息
		oldFiber = nextOldFiber;
	}

	// 2. 检查 normalizedChildren 是否完成了遍历
	// 从上面的 for 循环出来，有两种情况
	// 1. oldFiber 为 null，说明是初次渲染
	// 2. i === normalizedChildren.length，说明是遍历完了出来的
	if (i === normalizedChildren.length) {
		// 如果还剩余有旧的 fiber 节点，那么就需要将其删除掉
		deleteRemainingChildren(returnFiber, oldFiber);
		return;
	}

	// 3. 接下来就是初次渲染的情况
	if (!oldFiber) {
		// 那么需要将 normalizedChildren 数组中的每一个元素都生成一个 fiber 对象
		// 然后将这些 fiber 对象串联起来
		for (; i < normalizedChildren.length; i++) {
			const newChildVnode = normalizedChildren[i];

			// 那么这一次就不处理，直接跳到下一次
			if (newChildVnode === null) continue;

			// 下一步就应该根据 vnode 生成新的 fiber
			const newFiber = createFiber(newChildVnode, returnFiber);

			// 接下来需要去更新 lastPlacedIndex 这个值
			lastPlacedIndex = placeChild(
				newFiber,
				lastPlacedIndex,
				i,
				isUpdate,
			);

			// 接下来非常重要了，接下来要将新生成的 fiber 加入到 fiber 链表里面去
			if (lastNewFiber === null) {
				// 说明你是第一个子节点
				returnFiber.child = newFiber;
			} else {
				// 进入此分支，说明当前生成的 fiber 节点并非父 fiber 的第一个节点
				lastNewFiber.sibling = newFiber;
			}
			// 将 lastNewFiber 设置为 newFiber
			// 从而将当前 fiber 更新为上一个 fiber
			lastNewFiber = newFiber;
		}
	}

	// 4. 处理新旧节点都还有剩余的情况
	// 首先需要创建一个 map 结构，用于存储剩余的旧节点
	const existingChildren = mapRemainingChildren(oldFiber);
	// 去遍历剩余的新节点
	for (; i < normalizedChildren.length; i++) {
		// 先拿到当前的 vnode
		const newChild = normalizedChildren[i];
		if (newChild === null) continue;

		// 根据新节点的 vnode 去生成新的 fiber
		const newFiber = createFiber(newChild, returnFiber);

		// 接下来就需要去哈希表里面寻找是否有可以复用的节点
		// 对于没有 key 的节点，使用与 mapRemainingChildren 相同的逻辑生成 key
		const key = newFiber.key || `${newFiber.type}-${i}`;
		const matchedFiber = existingChildren.get(key);
		// 这里就有两种情况：
		// 有可能从哈希表里面找到了，也有可能没有找到
		if (matchedFiber) {
			// 说明找到了，那么就可以复用
			// 复用旧 fiber 上面的部分信息，特别是 DOM 节点
			Object.assign(newFiber, {
				stateNode: matchedFiber.stateNode,
				alternate: matchedFiber,
				flags: Update,
			});
			// 删除哈希表中的旧 fiber
			existingChildren.delete(key);
		}

		// 更新 lastPlacedIndex 的值
		lastPlacedIndex = placeChild(
			newFiber,
			lastPlacedIndex,
			i,
			isUpdate,
		);

		// 形成链表
		if (lastNewFiber === null) {
			// 说明你是第一个子节点
			returnFiber.child = newFiber;
		} else {
			// 进入此分支，说明当前生成的 fiber 节点并非父 fiber 的第一个节点
			lastNewFiber.sibling = newFiber;
		}
		// 不要忘了更新 lastNewFiber
		lastNewFiber = newFiber;
	}

	// 5. 整个新节点遍历完成后，如果 map 中还有剩余的旧节点，这些旧节点也就没有用了，直接删除即可
	if (isUpdate) {
		existingChildren.forEach((child) => {
			deleteChild(returnFiber, child);
		});
	}
}
