/**
 * 该文件就是用于实现各种 Hooks
 */
import scheduleUpdateOnFiber from "../reconciler/ReactFiberWorkLoop";
import { Passive, Layout } from "../shared/utils";

/**
 * 比较两个依赖数组是否相等
 * @param {Array} nextDeps 新的依赖数组
 * @param {Array} prevDeps 旧的依赖数组
 * @returns {boolean} 是否相等
 */
function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null) {
    return false;
  }
  if (prevDeps.length !== nextDeps.length) {
    return false;
  }
  for (let i = 0; i < prevDeps.length; i++) {
    if (!Object.is(nextDeps[i], prevDeps[i])) {
      return false;
    }
  }
  return true;
}

// 首先我们先定义一些全部变量
let currentlyRenderingFiber = null; // 当前渲染的 fiber 对象
let workInProgressHook = null; // 当前正在处理的 hook
let currentHook = null; // 当前处理完的 hook
let EFFECT_HOOK_INDEX = 0; // 当前 effect hook 的索引
let HOOK_INDEX = 0; // 当前 hook 调用索引，用于检查 hook 调用顺序

// 批处理相关变量
let isBatchingUpdates = false; // 是否正在批处理更新
let updateQueue = []; // 批处理更新队列

/**
 * 重置 Hooks 链表
 * @param {*} wip 当前 fiber 对象
 */
export function renderWithHooks(wip) {
	currentlyRenderingFiber = wip;
	// 将当前渲染的 fiber 对象的 memorizedState 置为 null
	currentlyRenderingFiber.memorizedState = null;
	// 将当前正在处理的 hook 置为 null
	workInProgressHook = null;
	//存储 effect 对应的副作用函数和依赖项
	currentlyRenderingFiber.updateQueue = [];
	// 重置 effect hook 索引
	EFFECT_HOOK_INDEX = 0;
	// 重置 hook 调用索引
	HOOK_INDEX = 0;
}

/**
 * 获取或创建当前正在处理的 hook 对象
 * 并维护 workInProgressHook 指向链表的最后一个 hook
 * @returns {Object} hook 对象
 * @throws {Error} 如果在非函数组件中调用 hooks
 * @throws {Error} 如果 hook 调用顺序不一致
 */
function updateWorkInProgressHook() {
	// Hook 规则检查 1: 确保在函数组件内部调用
	if (!currentlyRenderingFiber) {
		throw new Error(
			"Hooks can only be called inside the body of a function component."
		);
	}

	// 这个变量就是存储最终我们要向外部返回的 hook
	let hook = null;

	const current = currentlyRenderingFiber.alternate; // 旧的 fiber 对象
	if (current) {
		// 进入此分支，说明不是第一次渲染，存在旧的 fiber 对象
		currentlyRenderingFiber.memorizedState = current.memorizedState;
		if (workInProgressHook) {
			// 链表已经存在
			workInProgressHook = hook = workInProgressHook.next;
			currentHook = currentHook.next;
		} else {
			// 链表不存在
			workInProgressHook = hook = currentlyRenderingFiber.memorizedState;
			currentHook = current.memorizedState;
		}

		// Hook 规则检查 2: 确保 hook 调用顺序一致
		if (!hook) {
			throw new Error(
				"Rendered more hooks than during the previous render."
			);
		}
	} else {
		// 说明是第一次渲染
		// 第一次你进来，你啥都没有，那么我们就需要做一些初始化的工作
		hook = {
			memorizedState: null, // 存储数据
			next: null, // 指向下一个 hook
		};
		if (workInProgressHook) {
			// 说明这个链表上面已经有 hook 了
			workInProgressHook = workInProgressHook.next = hook;
		} else {
			// 说明 hook 链表上面还没有 hook
			workInProgressHook = currentlyRenderingFiber.memorizedState = hook;
		}
	}

	// 增加 hook 索引
	HOOK_INDEX++;

	return hook;
}

/**
 * 处理状态更新，计算最新状态并调度重新渲染
 * @param {Object} fiber 当前正在处理的 fiber 对象
 * @param {Object} hook 当前正在处理的 hook 对象
 * @param {Function|null} reducer 状态更新的 reducer 函数，useState 时为 null
 * @param {*} action 状态更新的 action，useState 时为新状态值或更新函数
 */
function dispatchReducerAction(fiber, hook, reducer, action) {
	// 计算最新的状态
	const newValue = reducer
		? reducer(hook.memorizedState)
		: typeof action === "function"
			? action(hook.memorizedState)
			: action;

	// 如果状态没有变化，直接返回
	if (Object.is(hook.memorizedState, newValue)) {
		return;
	}

	// 更新状态
	hook.memorizedState = newValue;

	// 处理 fiber 对象
	fiber.alternate = { ...fiber };
	fiber.sibling = null;

	// 检查是否需要批处理
	if (isBatchingUpdates) {
		// 将更新操作加入队列
		updateQueue.push(() => {
			scheduleUpdateOnFiber(fiber);
		});
	} else {
		// 立即执行更新
		scheduleUpdateOnFiber(fiber);
	}
}

/**
 * 同步执行函数，并立即处理所有状态更新
 * @param {Function} fn 需要同步执行的函数
 * @returns {*} 函数执行的返回值
 */
export function flushSync(fn) {
	// 临时禁用批处理
	const prevIsBatchingUpdates = isBatchingUpdates;
	isBatchingUpdates = false;

	try {
		// 执行传入的函数
		return fn();
	} finally {
		// 恢复批处理状态
		isBatchingUpdates = prevIsBatchingUpdates;

		// 如果不在批处理中，执行队列中的更新
		if (!isBatchingUpdates && updateQueue.length > 0) {
			const queue = updateQueue;
			updateQueue = [];
			queue.forEach(update => update());
		}
	}
}

/**
 * 批处理执行函数，将多个状态更新合并为一次渲染
 * @param {Function} fn 需要批处理执行的函数
 * @returns {*} 函数执行的返回值
 */
export function batchedUpdates(fn) {
	// 临时启用批处理
	const prevIsBatchingUpdates = isBatchingUpdates;
	isBatchingUpdates = true;

	try {
		// 执行传入的函数
		return fn();
	} finally {
		// 恢复批处理状态
		isBatchingUpdates = prevIsBatchingUpdates;

		// 如果不在批处理中，执行队列中的更新
		if (!isBatchingUpdates && updateQueue.length > 0) {
			const queue = updateQueue;
			updateQueue = [];
			queue.forEach(update => update());
		}
	}
}

/**
 *
 * @param {*} initialState 初始化状态
 */
export function useState(initialState) {
	return useReducer(null, initialState);
}

/**
 *
 * @param {*} reducer 改变状态的纯函数
 * @param {*} initialState 初始化状态
 */
export function useReducer(reducer, initialState) {
	// 首先我们要拿到最新的 hook
	// 这里的 hook 其实是一个对象，里面存储了一些数据
	// hook ---> {memorizedState: xxx, next: xxx}
	// hook 对象里面有两个属性，一个 memorizedState 用于存储数据，一个 next 用于指向下一个 hook
	const hook = updateWorkInProgressHook();

	if (!currentlyRenderingFiber.alternate) {
		// 说明是首次渲染
		hook.memorizedState = initialState; // 将当前 hook 的 memorizedState 置为 initialState
	}

	const dispatch = dispatchReducerAction.bind(
		null,
		currentlyRenderingFiber,
		hook,
		reducer,
	);

	return [hook.memorizedState, dispatch];
}

/**
 * 创建并添加一个副作用到 fiber 的更新队列
 * @param {number} tag 副作用类型标签
 * @param {Function} create 创建副作用的函数
 * @param {Function} destroy 清理副作用的函数
 * @param {Array|null} deps 依赖数组
 * @returns {Object} 副作用对象
 */
function pushEffect(tag, create, destroy, deps) {
	const effect = {
		tag,
		create,
		destroy,
		deps,
		next: null,
	};

	if (currentlyRenderingFiber.updateQueue === null) {
		currentlyRenderingFiber.updateQueue = { lastEffect: null };
	}

	const updateQueue = currentlyRenderingFiber.updateQueue;
	if (updateQueue.lastEffect === null) {
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		const lastEffect = updateQueue.lastEffect;
		const firstEffect = lastEffect.next;
		lastEffect.next = effect;
		effect.next = firstEffect;
		updateQueue.lastEffect = effect;
	}

	return effect;
}

/**
 * 注册一个副作用，在 DOM 更新后异步执行
 * @param {Function} create 创建副作用的函数，返回清理函数
 * @param {Array} [deps] 依赖数组，依赖变化时重新执行副作用
 */
export function useEffect(create, deps) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	if (currentlyRenderingFiber.alternate) {
		const prevEffect = hook.memorizedState;
		if (prevEffect) {
			const prevDeps = prevEffect.deps;
			if (nextDeps !== null) {
				const depsEqual = nextDeps.every((dep, i) => Object.is(dep, prevDeps[i]));
				if (depsEqual) {
					return;
				}
			}
		}
	}

	const effect = pushEffect(Passive, create, undefined, nextDeps);
	hook.memorizedState = effect;
}

/**
 * 注册一个副作用，在 DOM 更新前同步执行
 * @param {Function} create 创建副作用的函数，返回清理函数
 * @param {Array} [deps] 依赖数组，依赖变化时重新执行副作用
 */
export function useLayoutEffect(create, deps) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	if (currentlyRenderingFiber.alternate) {
		const prevEffect = hook.memorizedState;
		if (prevEffect) {
			const prevDeps = prevEffect.deps;
			if (nextDeps !== null) {
				const depsEqual = nextDeps.every((dep, i) => Object.is(dep, prevDeps[i]));
				if (depsEqual) {
					return;
				}
			}
		}
	}

	const effect = pushEffect(Layout, create, undefined, nextDeps);
	hook.memorizedState = effect;
}

/**
 * 记忆化回调函数，依赖变化时才重新创建
 * @param {Function} callback 回调函数
 * @param {Array} [deps] 依赖数组，依赖变化时重新创建回调
 * @returns {Function} 记忆化的回调函数
 */
export function useCallback(callback, deps) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	if (currentlyRenderingFiber.alternate) {
		const prevState = hook.memorizedState;
		if (prevState && nextDeps) {
			const depsEqual = areHookInputsEqual(nextDeps, prevState.deps);
			if (depsEqual) {
				return prevState.value;
			}
		}
	}

	const memoizedCallback = callback;
	hook.memorizedState = {
		value: memoizedCallback,
		deps: nextDeps
	};

	return memoizedCallback;
}

/**
 * 记忆化计算结果，依赖变化时才重新计算
 * @param {Function} create 计算函数，返回计算结果
 * @param {Array} [deps] 依赖数组，依赖变化时重新计算
 * @returns {*} 记忆化的计算结果
 */
export function useMemo(create, deps) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	if (currentlyRenderingFiber.alternate) {
		const prevState = hook.memorizedState;
		if (prevState && nextDeps) {
			const depsEqual = areHookInputsEqual(nextDeps, prevState.deps);
			if (depsEqual) {
				return prevState.value;
			}
		}
	}

	const memoizedValue = create();
	hook.memorizedState = {
		value: memoizedValue,
		deps: nextDeps
	};

	return memoizedValue;
}
