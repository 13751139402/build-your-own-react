// fiber和element的区别
// 1.type和props直接继承element,无区别
// 2.增加了parent,child,sibling,等于强化过的element tree,用于并发模式找到下一个UnitOfWork
// 3.增加了dom,映射关系是 element tree->fiber tree->dom tree

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}
function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
function createDom(fiber) {
  const dom =
    fiber.type == 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type);

  const isProperty = (key) => key !== 'children';
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    });

  return dom;
}
// render函数只是触发并发模式
function render(element, container) {
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
  };
}

let nextUnitOfWork = null;
function workLoop(deadline) {
  console.log('workLoop');
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // requestIdleCallback会当浏览器住进程空闲时触发，每一帧渲染完成的空闲时间,如果超过帧完成时间则shouldYield,把主进程留给优先级更高的操作,等待下一次空闲再渲染
    shouldYield = deadline.timeRemaining() < 1;
  }
  requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop); // requestIdleCallback是一直运行着

// 三件事
// 1.创建fiber的dom节点
// 2.为fiber的每个child创建对应的fiber
// 3.返回下一个fiber
function performUnitOfWork(fiber) {
  // ==================== 1. 创建dom节点
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  if (fiber.parent) {
    fiber.parent.dom.appendChild(fiber.dom);
  }
  // ==================== 2.为每个child创建对应的fiber
  const elements = fiber.props.children;
  let index = 0;
  let prevSibling = null;

  while (index < elements.length) {
    const element = elements[index];

    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
      dom: null,
    };
    // 将newFiber设置为child或者sibling,具体取决于是否为第一个child
    if (index === 0) {
      fiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
  // ==================== 3. 返回下一个fiber,顺序为child, sibling, uncle
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling; // uncle就是parent的sibling
    }
    nextFiber = nextFiber.parent;
  }
}
const Didact = {
  createElement,
  render,
};

/** @jsx Didact.createElement */
const element = (
  <div style='background: salmon'>
    <h1>Hello World</h1>
    <h2 style='text-align:right'>from Didact</h2>
  </div>
);
const container = document.getElementById('root');
Didact.render(element, container);
