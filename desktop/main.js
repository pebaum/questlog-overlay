import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, session, shell, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateJournal } from '../shared/journal.js';
import { webLink } from '../shared/rich.js';
import { openJournal, readJson, writeJson } from './storage.js';
import { findDisplay, fitPanel } from './placement.js';
import { countdown } from '../shared/countdown.js';
import { assistantHelp } from './assistant-help.js';
import { windowsUpdater } from './update-manager.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const mac = process.platform === 'darwin';
const accelerator = 'CommandOrControl+Shift+Space';
app.setName('Questlog');
if (process.platform === 'win32') app.setAppUserModelId('app.questlog.desktop');

let win, tray, journal, journalFile, layoutFile, editTimer, positionTimer;
let locked = false, compactHeight = null, iconOnly = false, shortcut = false, dirty = false, quitting = false;
let requestedHeight = 100, manualSize, hoverTimer, hot = false;
let timer, timerIssue, updater, updateFrozen = false;
function send(channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
}

function flushJournal() {
  clearTimeout(editTimer);
  if (!dirty) return;
  writeJson(journalFile, journal);
  dirty = false;
  send('journal:status', { ok: true });
}

function scheduleFlush(attempt = 0) {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    try { flushJournal(); }
    catch (error) {
      // On Windows a reader can briefly block replacement of the journal after the temp file is written.
      if (process.platform === 'win32' && attempt < 4 && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) scheduleFlush(attempt + 1);
      else send('journal:status', { ok: false, error: error.message });
    }
  }, 140 * 2 ** attempt);
}

function saveLater(next) {
  try {
    journal = validateJournal(next);
    dirty = true;
    scheduleFlush();
  } catch (error) {
    send('journal:status', { ok: false, error: error.message });
  }
}

function savePosition(strict = false) {
  clearTimeout(positionTimer);
  if (!win || win.isDestroyed()) return;
  const { x, y } = win.getBounds();
  try { writeJson(layoutFile, { x, y, ...(manualSize && { size: manualSize }) }); }
  catch (error) {
    if (strict) throw error;
    console.warn('Could not remember panel position:', error.message);
  }
}

function mode() {
  return { locked, shortcut: shortcut ? (mac ? 'Cmd + Shift + Space' : 'Ctrl + Shift + Space') : null };
}

function updatePrompt(options) {
  const box = { title: 'Questlog updates', ...options };
  return win?.isVisible() && !locked ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box);
}

async function trayUpdate(check) {
  if (updater.busy || quitting) return;
  const result = await (check ? updater.check(true) : updater.action());
  if (quitting) return;
  if (result.status === 'error') await updatePrompt({ type: 'warning', message: result.message });
  else if (check) await updatePrompt({ message: {
    idle: 'Questlog is up to date.',
    available: `Questlog ${result.version} is available. Choose Download update in the tray to get it.`,
    ready: `Questlog ${result.version} is ready. Choose Restart & update in the tray when convenient.`
  }[result.status] });
}

function updateMenu() {
  if (!updater) return [];
  const { status, version, progress } = updater.state;
  const action = { available: `Download update (${version})`, downloading: `Downloading update… ${progress}%`,
    ready: `Restart && update (${version})…`, installing: 'Preparing to restart…', error: 'Retry update…' }[status];
  return [
    { label: 'Check for updates…', enabled: !updater.busy, click: () => trayUpdate(true) },
    ...(action ? [{ label: action, enabled: !updater.busy, click: () => trayUpdate(false) }] : [])
  ];
}

function refreshTray() {
  tray.setToolTip(locked ? 'Questlog - click to edit' : 'Questlog');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show & edit Questlog', click: showEditor },
    { label: 'Settings…', click: () => { showEditor(); send('panel:settings'); } },
    assistantHelp(journalFile, app.isPackaged ? path.join(process.resourcesPath, 'QUESTS-AI.md') : path.join(root, 'docs', 'QUESTS-AI.md'), clipboard, shell),
    { label: 'Click-through', type: 'checkbox', checked: locked, click: () => setLocked(!locked) },
    { label: 'Move to primary display', click: () => { resizePanel(true); showEditor(); } },
    { label: 'Hide panel', click: () => win.hide() },
    { type: 'separator' },
    ...updateMenu(),
    { label: 'Quit Questlog', click: () => app.quit() }
  ]));
}

function setLocked(next) {
  locked = next;
  if (locked && win.isFocused()) win.blur();
  win.setIgnoreMouseEvents(locked);
  win.setFocusable(!locked);
  if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  send('panel:mode', mode());
  refreshTray();
}

function showEditor() {
  if (!win || win.isDestroyed()) return;
  setLocked(false);
  send('panel:reveal');
  win.show();
  win.focus();
}

function heightLimit(area) { return Math.min(680, area.height); }

function resizePanel(reset = false) {
  if (!win || win.isDestroyed()) return;
  const current = win.getBounds();
  const display = reset ? screen.getPrimaryDisplay() : screen.getDisplayMatching(current);
  const limit = manualSize ? display.workArea.height : heightLimit(display.workArea);
  send('panel:limit', limit);
  const point = reset ? null : current;
  const height = Math.min(compactHeight ?? manualSize?.height ?? requestedHeight, limit);
  const bounds = fitPanel(display.workArea, point, height, iconOnly ? height : manualSize?.width, iconOnly ? 24 : 240);
  if (['x', 'y', 'width', 'height'].some(k => current[k] !== bounds[k])) win.setBounds(bounds);
}

function fromPanel(event) {
  return win && !win.isDestroyed() && event.senderFrame === win.webContents.mainFrame;
}

async function start() {
  const data = app.getPath('userData');
  journalFile = path.join(data, 'journal.json');
  layoutFile = path.join(data, 'window.json');
  try { journal = openJournal(journalFile); }
  catch (error) {
    dialog.showErrorBox('Questlog could not open your journal', `${error.message}\n\n${journalFile}\n\nNo existing journal was replaced.`);
    app.quit();
    return;
  }
  let point;
  try { point = readJson(layoutFile); }
  catch (error) { console.warn('Could not restore panel position:', error.message); }
  const remembered = findDisplay(screen.getAllDisplays(), point);
  const area = (remembered ?? screen.getPrimaryDisplay()).workArea;
  if (Number.isFinite(point?.size?.width) && Number.isFinite(point?.size?.height) &&
      point.size.width > 0 && point.size.height > 0) manualSize = point.size;
  const icon = nativeImage.createFromPath(path.join(root, 'assets', 'icon.png'));
  const trayIcon = mac
    ? nativeImage.createFromPath(path.join(root, 'assets', 'trayTemplate.png'))
    : icon.resize({ width: 24, height: 24 });
  if (mac) trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  if (!mac) tray.on('click', showEditor);
  Menu.setApplicationMenu(mac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null);
  win = new BrowserWindow({
    ...fitPanel(area, remembered ? point : null, manualSize?.height ?? requestedHeight, manualSize?.width),
    title: 'QUESTS', icon, frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, hasShadow: false, resizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, show: false,
    webPreferences: {
      preload: path.join(root, 'desktop', 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, devTools: !app.isPackaged
    }
  });
  if (process.platform === 'win32') {
    // Apply this to the hidden native window, before any journal content is loaded.
    win.setContentProtection(true);
    if (!win.isContentProtected()) {
      win.destroy();
      throw new Error('Windows capture protection could not be enabled. The overlay has not been shown.');
    }
  }
  win.setAlwaysOnTop(true, 'screen-saver');
  if (mac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  const timerFile = path.join(data, 'timer.json');
  try {
    timer = countdown({
      initial: readJson(timerFile), persist: value => writeJson(timerFile, value),
      changed: state => send('timer:state', { state }),
      onError: e => send('timer:state', { error: `Cannot save the timer: ${e.message}` }),
      ring: () => {
        try { shell.beep(); }
        catch (e) { send('timer:state', { error: `Timer complete; system sound unavailable: ${e.message}` }); }
        try {
          if (Notification.isSupported()) new Notification({ title: 'QUESTS', body: 'Your countdown is complete.', icon, silent: true }).show();
        } catch (e) { send('timer:state', { error: `Timer complete; desktop notification unavailable: ${e.message}` }); }
      }
    });
    powerMonitor.on('resume', timer.check);
  } catch (e) {
    timerIssue = `Cannot open the saved timer: ${e.message}`;
  }
  if (app.isPackaged && process.platform === 'win32') {
    updater = windowsUpdater({
      data, installed: app.getVersion(),
      changed: state => {
        // Quiesce input while hashing the staged file; outstanding save IPCs can drain.
        if (state.status === 'installing') { updateFrozen = true; win.setEnabled(false); }
        else if (updateFrozen && !quitting) { updateFrozen = false; win.setEnabled(true); }
        send('update:state', state);
        if (!quitting) refreshTray();
      },
      activity: () => { if (!quitting && tray && !tray.isDestroyed()) refreshTray(); },
      confirmRestart: async version => (await updatePrompt({
        message: `Restart Questlog to install ${version}?`, detail: 'Your journal, timer and window settings will be saved first.',
        buttons: ['Restart & update', 'Later'], defaultId: 1, cancelId: 1, noLink: true
      })).response === 0,
      prepareRestart: () => {
        flushJournal();
        if (timerIssue) throw new Error(timerIssue);
        writeJson(timerFile, timer.state);
        savePosition(true);
      },
      quit: () => app.quit()
    });
  }
  ipcMain.on('update:watch', e => {
    if (fromPanel(e)) send('update:state', updater?.state ?? { status: 'idle' });
  });
  ipcMain.handle('update:action', (e, ...args) => {
    if (!fromPanel(e) || locked || args.length) throw new Error('Use the unlocked journal to manage updates.');
    if (!updater) throw new Error('Updates are available only in the installed Windows app.');
    return updater.action();
  });
  ipcMain.on('timer:watch', e => {
    if (fromPanel(e)) send('timer:state', timer ? { state: timer.state } : { error: timerIssue });
  });
  function editableTimer(e) {
    if (!fromPanel(e) || locked) throw new Error('Unlock the overlay to control the timer.');
    if (!timer) throw new Error(timerIssue);
    return timer;
  }
  ipcMain.handle('timer:start', (e, entry) => editableTimer(e).start(entry));
  ipcMain.handle('timer:stop', e => editableTimer(e).stop());
  ipcMain.handle('journal:load', event => {
    if (!fromPanel(event)) throw new Error('Not the journal window.');
    const workArea = screen.getDisplayMatching(win.getBounds()).workArea;
    return { journal, mode: mode(), manualSize: !!manualSize, hot, maxHeight: manualSize ? workArea.height : heightLimit(workArea) };
  });
  ipcMain.handle('link:open', (e, href) => {
    const url = webLink(href);
    if (!fromPanel(e) || locked || !url) throw new Error('Only web links from the unlocked journal can be opened.');
    return shell.openExternal(url);
  });
  ipcMain.on('panel:size', (e, s) => {
    if (!fromPanel(e) || locked || compactHeight !== null || !Number.isFinite(s?.width) || !Number.isFinite(s?.height)) return;
    const bounds = win.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    manualSize = {
      width: Math.min(Math.max(240, Math.round(s.width)), Math.max(240, area.x + area.width - bounds.x)),
      height: Math.min(Math.max(110, Math.round(s.height)), Math.max(110, area.y + area.height - bounds.y))
    };
    resizePanel();
    clearTimeout(positionTimer);
    positionTimer = setTimeout(savePosition, 250);
  });
  ipcMain.on('panel:auto-size', e => {
    if (!fromPanel(e) || locked || compactHeight !== null) return;
    manualSize = undefined;
    resizePanel();
    savePosition();
  });
  ipcMain.on('journal:save', (e, value) => { if (fromPanel(e)) saveLater(value); });
  ipcMain.on('panel:fit', (e, h, layout) => {
    if (!fromPanel(e) || !['expanded', 'icon', 'compact'].includes(layout) || !Number.isFinite(h) || h <= 0) return;
    iconOnly = layout === 'icon';
    compactHeight = layout === 'expanded' ? null : h;
    if (compactHeight === null && !manualSize) requestedHeight = h;
    resizePanel();
  });
  ipcMain.on('panel:toggle-lock', e => { if (fromPanel(e)) setLocked(!locked); });
  ipcMain.on('panel:hide', e => { if (fromPanel(e)) win.hide(); });
  ipcMain.on('panel:quit', e => { if (fromPanel(e)) app.quit(); });
  shortcut = globalShortcut.register(accelerator, () => {
    if (!win.isVisible() || locked) showEditor();
    else setLocked(true);
  });
  refreshTray();
  win.on('move', () => {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => { resizePanel(); savePosition(); }, 250);
  });
  for (const event of ['display-metrics-changed', 'display-removed']) screen.on(event, () => resizePanel());
  win.on('close', event => {
    if (!quitting) { event.preventDefault(); app.quit(); }
  });
  win.on('closed', () => { win = undefined; });
  await win.loadFile(path.join(root, 'app', 'index.html'));
  win.showInactive();
  updater?.start();
  // Fully transparent pixels and click-through windows do not reliably receive mouseenter.
  hoverTimer = setInterval(() => {
    if (!win?.isVisible()) return;
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (inside !== hot) { hot = inside; send('panel:hover', hot); }
  }, 100);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showEditor);
  app.on('activate', showEditor);
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('Questlog could not start', error.message);
    app.quit();
  });
  app.on('before-quit', event => {
    // Let only the verified installer handoff quit during the final verification/save/spawn.
    if (updater?.state.status === 'installing' && !updater.committed) { event.preventDefault(); return; }
    try { flushJournal(); }
    catch (error) {
      const choice = dialog.showMessageBoxSync({
        type: 'error', buttons: ['Keep editing', 'Quit without saving'], defaultId: 0, cancelId: 0,
        title: 'Changes not saved', message: 'Questlog could not save the latest changes.', detail: error.message
      });
      if (choice === 0) { event.preventDefault(); showEditor(); return; }
    }
    quitting = true;
    savePosition();
  });
  app.on('will-quit', () => {
    updater?.stop();
    if (timer) { timer.dispose(); powerMonitor.removeListener('resume', timer.check); }
    clearInterval(hoverTimer); globalShortcut.unregisterAll(); tray?.destroy();
  });
  app.on('window-all-closed', () => { if (!quitting) app.quit(); });
}
