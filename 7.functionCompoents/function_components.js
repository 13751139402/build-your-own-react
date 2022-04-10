// 函数组件只在两点有变动
// 1.render-performUnitOfWork中检验到element为function会执行函数拿到这个函数组件的返回值(children element)。之后走下面的逻辑
// 2.commitWork中于Fiber tree映射为dom tree的时候会跳过了function fiber

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
function createDom(fiber) {
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);
  return dom;
}

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  // 删除旧的或者更改事件监听器
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 添加新的事件监听器
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
}

function commitRoot() {
  deletions.forEach(commitWork); // 处理需要删除的dom
  commitWork(wipRoot.child);
  // 保留提交给dom的最后一个纤维书，用于diff
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return;
  let domParentFiber = fiber.parent;
  // 因为组件函数的fiber没有dom,commitWork为了appendChild,得先找到parentDom
  // 相当于Fiber tree映射为dom tree的时候跳过了function fiber
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;
  // 如果为placement放置,则把
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }
  // 递归将dom添加到页面中
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;
let currentRoot = null;
let deletions = null;

function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

// 1.创建fiber参数的dom
// 2.创建fiber参数的children fiber
// 3.返回下一个fiber
function performUnitOfWork(fiber) {
  // 判断type是否为函数/dom,导入不同的更新逻辑
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}
// 处理函数组件节点的更新流程,运行函数获得children fiber
// 函数fiber没有dom的,后面commitWork会处理
function updateFunctionComponent(fiber) {
  const children = [fiber.type(fiber.props)]; // fiber为函数组件，运行后返回element结构
  reconcileChildren(fiber, children);
}

// 处理dom节点的更新流程,和old fiber对比获得children fiber并打标effectTag
function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

// 创建fiber children: 对比current(old  fiber)与elements，创建拥有effectTag的Fiber
// Fiber是一个链表+树的结构
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;
    // 对比oldFiber和element,三个策略:
    // 1.如果旧的Fiber和新的元素具有相同的类型，我们可以保留DOM节点并使用新的props更新它
    // 2.如果类型不同并且有一个new element,则意味着我们需要创建一个新的dom
    // 3.如果类型不同并且有一个old fiber,则意味着我们需要删除旧的dom
    // react还设置了key,用于更好的检测children改变了数组中的位置
    const sameType = oldFiber && element && element.type === oldFiber.type;
    if (sameType) {
      // 更新node
      // 新的fiber保留旧fiber的dom和element的props
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom, // 这里会沿用old dom,当new Fiber进入performUnitOfWork就不再创建新的dom
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE", // 新增的属性以后会在commit阶段使用
      };
    }
    // 注意看下方两个if,如果一个dom type但是新旧fiber都存在,会锚中两个if,即删除原来的再创建新的dom
    if (element && !sameType) {
      // 存在element,但是oldFiber可能不存在或者类型不同，添加这个节点
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT", // PLACEMENT:放置
      };
    }
    if (oldFiber && !sameType) {
      // 存在oldFiber,但是element可能不存在或者类型不同,删除oldFiber节点
      // 这种情况不需要newFiber,而是给oldFiber添加effect,到commit阶段会删除dom
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }
    // fiber不仅要树状结构，还要sibling和child的链表结构
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

const Didact = {
  createElement,
  render,
};

// 函数fiber来源于组件函数,并没有dom node
/** @jsx Didact.createElement */
function App(props) {
  return <h1>Hi {props.name}</h1>;
}
const element = <App name="foo" />;
// jsx转化后就是下面:
// function App(props) {
//   return Didact.createElement('h1', null, 'Hi ', props.name);
// }
// const element = Didact.createElement(App, {
//   name: 'foo',
// });
const container = document.getElementById("root");
Didact.render(element, container);
