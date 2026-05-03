import { Placement, Update, updateNode } from "../shared/utils";

function getParentDom(wip) {
	let temp = wip;
	while (temp) {
		if (temp.stateNode) return temp.stateNode;
		// 代码执行到此 说明当前节点 temp 并没有 对应的真实 DOM 节点
		// 那么我们就需要继续往上找
		// 那么问题来了： 为什么该 fiber 上没有对应的 DOM 对象？
		// 因为该 Fiber 可能是一个 函数组件、类组件、Fragment
		temp = temp.return;
	}
}

function getDeletionDom(fiber) {
	let node = fiber;
	while (node) {
		if (node.stateNode) {
			return node.stateNode;
		}
		node = node.child;
	}
	return null;
}

function commitNode(wip) {
	// 首先第一步 我们需要获取到当前 fiber 节点的父节点
	const parentNodeDOM = getParentDom(wip.return);
	const { flags, stateNode } = wip;
	if (flags & Placement && stateNode) {
		parentNodeDOM.appendChild(wip.stateNode);
    }
    if(flags & Update && stateNode){
        updateNode(stateNode,wip.alternate.props,wip.props);
    }
}

function commitWork(wip) {
	if (!wip) return;
	// 整个 commitWork 分三步走 ：
	// 1、提交自己 wip
	// 2、提交子节点
	// 3、提交兄弟节点
	commitNode(wip); // 提交自己

	// 处理 deletions：删除旧 fiber 对应的 DOM
	if (wip.deletions) {
		const parentDOM = getParentDom(wip);
		wip.deletions.forEach(childToDelete => {
			const dom = getDeletionDom(childToDelete);
			if (dom && parentDOM) {
				parentDOM.removeChild(dom);
			}
		});
	}

	commitWork(wip.child); // 提交子节点  (递归调用此方法，因为每个节点都可能有子节点、兄弟节点)
	commitWork(wip.sibling); // 提交兄弟节点
}
export default commitWork;
