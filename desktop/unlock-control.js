import { BrowserWindow } from 'electron';
import path from 'node:path';

// Keep the journal window genuinely click-through. Only the padlock gets a native input surface.
export function unlockControl(owner, root, unlock, report) {
  let button, rect, ready = false;
  function sync() {
    if (!button || !rect || !ready || owner.isDestroyed()) return;
    if (!owner.isVisible() || owner.isMinimized()) { button.hide(); return; }
    const b = owner.getContentBounds();
    const x = Math.round(b.x + Math.min(Math.max(0, rect.x), Math.max(0, b.width - 24)));
    const y = Math.round(b.y + Math.min(Math.max(0, rect.y), Math.max(0, b.height - 24)));
    button.setPosition(x, y);
    if (!button.isVisible()) button.showInactive();
  }
  function clear() {
    ready = false; rect = null;
    if (button && !button.isDestroyed()) button.destroy();
    button = undefined;
  }
  for (const event of ['move', 'resize', 'show', 'restore']) owner.on(event, sync);
  for (const event of ['hide', 'minimize']) owner.on(event, () => button?.hide());
  owner.on('closed', clear);
  return {
    clear,
    bounds(box) {
      if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return;
      rect = box;
      if (button) { sync(); return; }
      const w = button = new BrowserWindow({
        parent: owner, title: 'Unlock Questlog', width: 24, height: 24, show: false, frame: false, transparent: true,
        alwaysOnTop: true, focusable: false, skipTaskbar: true, resizable: false, hasShadow: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false,
          preload: path.join(root, 'desktop', 'unlock-preload.cjs') }
      });
      if (process.platform === 'win32') {
        w.setContentProtection(true);
        w.setShape([{ x: 0, y: 0, width: 24, height: 24 }]);
      }
      w.setAlwaysOnTop(true, 'screen-saver');
      w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      w.webContents.on('will-navigate', e => e.preventDefault());
      w.webContents.ipc.on('unlock:activate', e => {
        if (button === w && e.senderFrame === w.webContents.mainFrame) unlock();
      });
      w.loadURL('about:blank').then(() => {
        if (button === w) { ready = true; sync(); }
      }).catch(e => { if (button === w) { clear(); report(e); } });
    }
  };
}
