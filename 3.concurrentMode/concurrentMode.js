// concurrentMode:并线模式。大量的页面渲染操作会导致页面卡顿,用户操作停滞
// 使用requestIdleCallback在浏览器进程闲置时进行页面渲染,防止阻塞页面
// react把element切割成链表结构的Fibers,这样可以断断续续的进行页面更新

// 此章节还跑不起来，只做教学
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
function render(element, container) {
  const dom =
    element.type == 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(element.type);
  const isProperty = (key) => key !== 'children';
  Object.keys(element.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = element.props[name];
    });
  // 递归渲染问题:当虚拟tree过大时，渲染的时候会阻塞主进程，如果浏览器需要做更高优先级的事情
  // 比如处理用户输入或者保持动画流程，就必须等渲染完成
  element.props.children.forEach((child) => render(child, dom));
  container.appendChild(dom);
}

let nextUnitOfWork = null;
// deadline:截止日期
function workLoop(deadline) {
  let shouldYield = false; // yield:停止
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork); //perform:表演 performUnitOfWork:执行工作单元
    shouldYield = deadline.timeRemaining() < 1; // timeRemaining:剩余时间
  }
  requestIdleCallback(workLoop); // requestIdleCallback:当浏览器进程闲置时执行
}
requestIdleCallback(workLoop);

function performUnitOfWork(workLoop) {
  // TODO
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
Didact.render(element, container); // element是虚拟dom
