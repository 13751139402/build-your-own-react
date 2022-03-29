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
// render，把虚拟dom渲染到dom中
function render(element, container) {
  // 创建元素,这里需要区分常规元素和文本元素
  const dom =
    element.type == 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(element.type);
  // 把props添加到element的property
  const isProperty = (key) => key !== 'children';
  Object.keys(element.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = element.props[name];
    });
  // 递归创建元素
  element.props.children.forEach((child) => render(child, dom));
  container.appendChild(dom);
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
