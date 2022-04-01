// 之前只有增,现在增加删改
// 1.wipRoot     : 处于render阶段的fiber tree。
//   currentRoot : 与dom对应的fiber tree,也就是上一次render的fiber tree
//   alternate   : 每个fiber新增alternate属性,连接着wipRoot和currentRoot
// 2.render-performUnitOfWork阶段新旧fiber对比进行打标effectTag
// 3.commit阶段依据effectTag进行更新dom

// 渲染流程图:
// 1.workLoop：执行下一个unitOfWork, 或者跳出进行commit
// 2.performUnitOfWork:
//    1.createDom创建fiber参数的dom
//    2.reconcileChildren创建fiber参数的children fiber
//    3.返回下一个fiber
// 3.commitRoot将fiber dom改动更新到页面中

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

  updateDom(dom, {}, fiber.props);
  return dom;
}
// 事件属性要特别处理
const isEvent = (key) => key.startsWith('on');
const isProperty = (key) => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  // 函数对比会转化为字符串再对比
  // 删除new fiber不存在或者不相同的事件
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 设置新增的或者更改后的事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // 删除new fiber不存在的属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // 设置新增的或者更改后的属性
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
  const domParent = fiber.parent.dom;
  // 如果为placement放置,则把
  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'DELETION') {
    domParent.removeChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }
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
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 把performUnitOfWork新增fiber的代码放在reconcileChildren中
  // 与旧fibers进行比较
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);

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

// 创建fiber children: 对比oldFiber与elements，创建拥有effectTag的Fiber
// Fiber是一个链表+树的结构
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate?.child;
  let prevSibling = null;
  // oldFiber是链表结构,elements是数组机构
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;
    // 对比oldFiber和element,三个策略:
    // 1.如果旧的Fiber和新的元素具有相同的类型，我们可以保留DOM节点并使用新的props更新它
    // 2.如果有element且类型不同,则意味着我们需要创建一个新的dom
    // 3.如果有fiber且类型不同,则意味着我们需要删除旧的dom
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
        effectTag: 'UPDATE', // 新增的属性以后会在commit阶段使用
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
        effectTag: 'PLACEMENT', // PLACEMENT:放置
      };
    }
    if (oldFiber && !sameType) {
      // 存在oldFiber,但是element可能不存在或者类型不同,删除oldFiber节点
      // 这种情况不需要newFiber,而是给oldFiber添加effect,到commit阶段会删除dom
      oldFiber.effectTag = 'DELETION';
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

/** @jsx Didact.createElement */
const container = document.getElementById('root');

const updateValue = (e) => {
  rerender(e.target.value); // 这里模拟了useState调用render函数
};

const rerender = (value) => {
  // 接受参数，创建了新的element tree
  const element = (
    <div>
      <input onInput={updateValue} value={value} />
      <h2>Hello {value}</h2>
    </div>
  );
  Didact.render(element, container);
};

rerender('World');
