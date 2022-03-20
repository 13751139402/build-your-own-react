// 步骤4的问题是Fibers是分段渲染到页面上的，而且渲染中断的话用户会看到一个不完整的页面
// 这里进行改进，把render和commit分开来处理，render创建dom,commit一次新渲染页面
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

function commitRoot() {
  commitWork(wipRoot.child);
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return;
  const domParent = fiber.parent.dom;
  domParent.appendChild(fiber.dom);
  // 递归将dom添加到页面中
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function render(element, container) {
  wipRoot = {
    // 用于render后commit
    dom: container,
    props: {
      children: [element],
    },
  };
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // requestIdleCallback会当浏览器住进程空闲时触发，每一帧渲染完成的空闲时间,如果超过帧完成时间则shouldYield,把主进程留给优先级更高的操作,等待下一次空闲再渲染
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitOfWork && wipRoot) {
    // 当渲染完成后，再commit一次性更新页面
    commitRoot();
  }
  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

// 执行任务单元,分为三件事
// 1.创建dom  2.为每个child创建fiber 3.寻找下一个fiber并返回
function performUnitOfWork(fiber) {
  // ==================== 1. add dom node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // commit阶段一次性添加到页面中
  // if (fiber.parent) {
  //   fiber.parent.dom.appendChild(fiber.dom);
  // }

  // ==================== 2.each child we create a new fiber.
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
  // ==================== 3. return next unit of work 寻找下一个fiber,顺序为child sibling uncle
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
console.log('element:', element);
Didact.render(element, container);
