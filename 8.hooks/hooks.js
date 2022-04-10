// ------------------ hook执行流程 ---------------------

// ------ 名词描述
// action: setState调用时传入的参数,类型为函数,调用后返回值用于修改state
// hook对象: 两个属性:1.state:当前值 2.queue:function[],当前函数组件中调用了多少次useState,就会把参数(修改state的函数)保存起来

// ------ useState
// 1.render-updateFunctionComponent时执行函数组件会触发useState
// 2.useState拿到与这个函数组件对应的old Fiber中的hook(这里取名oldHook)
// 3.useState执行oldHook中的queue拿到最新的state，然后返回state和setState
//   setState中保存了useState闭包的hook对象,下次render时hook对象就是oldHook

// ------ useState
// 1.setState触发时: 1.保存action 2.触发render
//   setState并不更新state,而是保存action等到下次useState时再触发
// 2.循环总结  1.useState:更新值,返回setState 2.setState:保存action,触发render
//   useState => setState => useState => setState ... 
//   所以在函数组件中直接调用setState会死循环,只能"触发"形式的调用

// ------ 为什么要有wipFiber.hooks和hook.queue
// 1.wipFiber.hooks: 在同一个函数组件中:可以使用多个useState,每个useState的状态会存入wipFiber.hooks中,下次跟新时才能获取oldHook
// 2.hook.queue: 每个useState返回的setState在同一个函数组件中能多次调用,这样就会有多个action,得把action数组循环执行完毕才能得到最终的state用于render
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };}

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
// 事件属性要特别处理
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
  // 组件函数节点有fiber(APP), 但是没有dom
  // 因为组件函数的fiber没有dom,commitWork为了appendChild,得先找到parentDom
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
  // 进行中的tree称之为wipRoot
  wipRoot = {
    // 用于render后commit
    dom: container,
    props: {
      children: [element],
    },
    // 将旧的fiber tree保存起来，用于diff
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let nextUnitOfWork = null;
let wipRoot = null;
let currentRoot = null;
let deletions = null; // 保存需要删除的fiber

// 并发更新
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // requestIdleCallback会当浏览器住进程空闲时触发，每一帧渲染完成的空闲时间,如果超过帧完成时间则shouldYield,把主进程留给优先级更高的操作,等待下一次空闲再渲染
    shouldYield = deadline.timeRemaining() < 1; // 当前帧剩余数小于1毫秒则让出主线程
  }
  if (!nextUnitOfWork && wipRoot) {
    // 当渲染完成后，再commit一次性更新页面
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
//  设置两个全局函数用于useState的调用
let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  // render-workOfUnit阶段中保存fiber用于useState
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = []; // 支持useState在同一个组件中调用多次（多个state），持续追踪当前hookIndex
  const children = [fiber.type(fiber.props)]; // fiber为函数组件，运行后返回element结构
  reconcileChildren(fiber, children);
}

function useState(initial) {
  // wipFiber=当前workOfUnit的fiber
  // alternate=fiber对应的old fiber
  const oldHook = wipFiber.alternate?.hooks?.[hookIndex]; // 检查是否有oldHook
  const hook = {
    state: oldHook ? oldHook.state : initial, // 有old state则延用，无则initial初始化state
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  // 一个组件函数中能使用多个hook(useState),hookIndex区分
  // 同一个setState可以在函数中调用多次,把每个回调函数都执行完得到最终的hook.state
  actions.forEach((action) => {
    // action为传入的修改state的函数
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    // setState仅触发render并不直接更改hook.state,会在下个workOfUnit的useState更改
    // 这样回调函数获取的state就是下个reader阶段的最新值
    hook.queue.push(action);
    // wipRoot为进行中的树,currentRoot为上一次渲染的树
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    // 设置工作单元进行页面更新
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
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
  useState,
};

/** @jsx Didact.createElement */
function Counter() {
  // hook要在函数组件中才能使用,调用setState会触发页面render,当函数组件被render执行时useState会返回新的值
  const [state, setState] = Didact.useState(1);
  return <h1 onClick={() => setState((c) => c + 1)}>Count: {state}</h1>;
}
const element = <Counter />;

const container = document.getElementById("root");
Didact.render(element, container);
