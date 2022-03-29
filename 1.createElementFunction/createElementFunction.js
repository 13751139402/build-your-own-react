import React from 'react';
import ReactDOM from 'react-dom';
// const element = (
//   <div id='foo'>
//     <a>bar</a>
//     <b />
//   </div>
// );
// const container = document.getElementById('root');
// ReactDOM.render(element, container);

// ========================== 上面的jsx会被babel编译成如下 ==========================
const reactElement = React.createElement(
  'div',
  { id: 'foo' },
  React.createElement('a', null, 'bar'),
  React.createElement('b')
);
const container = document.getElementById('root');
ReactDOM.render(reactElement, container);

// ========================== 手写React.createElement =========================
// createElement将传入的参数编译为一个element(virtual node)

// children允许多个child,而不是需要一个元素包裹
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      // children允许原始值,为了后期统一处理对象（简单），这里将原始值封装为对象
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}
// React并不会包装原始值，或者没有children时创建空children，这里只是为了简单而不是高性能
function createTextElement(text) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

// ========================== 用手写的替换createElement =========================
// const Didact = {
//   createElement,
// };
// const didactElement = Didact.createElement(
//   'div',
//   { id: 'foo' },
//   Didact.createElement('a', null, 'bar'),
//   Didact.createElement('b')
// );
// console.log('DidactElement:', didactElement);

// ========================== JSX替换createElement =========================
const Didact = {
  createElement,
};
// 下面的注释告诉JSX用Didact.createElement替换React.createElement来编译
/** @jsx Didact.createElement */
const didactElement = (
  <div id='foo'>
    <a>bar</a>
    <b />
  </div>
);
console.log('didactElement:', didactElement);
