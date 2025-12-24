
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Could not find root element to mount to");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    console.error("React render crash:", err);
    rootElement.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">
      <h3 style="margin-bottom: 10px;">应用加载失败</h3>
      <p style="font-size: 14px;">请尝试刷新页面，或在浏览器中直接打开。</p>
      <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 10px;">刷新重试</button>
    </div>`;
  }
}
