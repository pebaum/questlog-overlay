const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  document.title = 'Unlock Questlog';
  document.body.style.margin = '0';
  const b = document.createElement('button');
  b.type = 'button'; b.title = 'Unlock overlay'; b.setAttribute('aria-label', b.title);
  b.style.cssText = 'width:24px;height:24px;display:grid;place-items:center;margin:0;padding:0;border:0;border-radius:4px;background:Canvas;color:CanvasText;color-scheme:dark;cursor:pointer';
  b.innerHTML = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3M12 14v2"/></svg>';
  b.onclick = () => ipcRenderer.send('unlock:activate');
  document.body.append(b);
});
