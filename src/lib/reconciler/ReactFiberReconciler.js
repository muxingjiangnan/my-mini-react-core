import { updateNode } from "../shared/utils";
import { reconcileChildren } from "./ReactChildFiber";
import { renderWithHooks } from "../react/ReactHooks";

/**
 *
 * @param {*} wip 需要处理的 fiber 对象节点
 * 注意这个 fiber 节点已经能够确定的是一个 HostComponent
 */
export function updateHostComponent(wip) {
  // 1. 创建真实的 DOM 节点对象
  if (!wip.stateNode) {
    // 进入此 if，说明当前的 fiber 节点没有创建过真实的 DOM 节点
    wip.stateNode = document.createElement(wip.type);
    // 接下来我们需要更新节点上的属性
    updateNode(wip.stateNode, {}, wip.props);
  }
  reconcileChildren(wip, wip.props.children);
}

/**
 * 更新文本节点
 * @param {*} wip 需要处理的 fiber 对象节点
 */
export function updateHostTextComponent(wip) {
  wip.stateNode = document.createTextNode(wip.props.children);
}

/**
 * 更新函数组件
 * @param {*} wip 需要处理的 fiber 对象节点
 */
export function updateFunctionComponent(wip) {
  // 重置 Hooks 链表
  renderWithHooks(wip);
  const { type, props } = wip;
  // 执行函数组件，返回 React Element（单个 vnode）
  const children = type(props);
  // 传入 reconcileChildren，内部会统一处理为数组
  reconcileChildren(wip, children);
}

/**
 * 更新类组件
 * @param {*} wip 需要处理的 fiber 对象节点
 */
export function updateClassComponent(wip) {
  const { type, props } = wip;
  const instance = new type(props);
  // 调用 render 方法，获取到 vnode
  const children = instance.render();
  // diff 算法处理子节点
  reconcileChildren(wip, children);
}

