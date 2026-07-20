/** React 页面入口：找到 index.html 中的 #root，并把整个 App 组件渲染进去。 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode 只在开发阶段帮助发现不安全副作用，不会额外绘制可见界面。
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
