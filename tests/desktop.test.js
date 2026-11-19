import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

test('Windows whole-display capture omits or blanks the visible overlay', { skip: process.platform !== 'win32', timeout: 40_000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-capture-'));
  let app;
  try {
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: 'QUESTS' }).waitFor();
    await page.evaluate(() => {
      const marker = document.body.appendChild(document.createElement('div'));
      Object.assign(marker.style, { position: 'fixed', inset: '0', background: 'magenta', zIndex: '2147483647' });
      if (document.elementFromPoint(45, 25) !== marker) throw new Error('Test marker does not cover the sample point');
    });
    const result = await app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }) => {
      const overlay = BrowserWindow.getAllWindows()[0], d = screen.getPrimaryDisplay();
      const x = Math.round(d.workArea.x + d.workArea.width / 2), y = Math.round(d.workArea.y + d.workArea.height / 2);
      overlay.setPosition(x - 45, y - 25);
      const back = new BrowserWindow({ x: x - 100, y: y - 65, width: 470, height: 190,
        frame: false, show: false, focusable: false, skipTaskbar: true, backgroundColor: '#00ff00' });
      try {
        await back.loadURL('data:text/html,<body style="background:lime">');
        back.setAlwaysOnTop(true); back.showInactive(); overlay.moveTop();
        const near = (pixel, expected) => pixel.every((v, i) => Math.abs(v - expected[i]) < 22);
        const rgb = (image, px, py) => {
          const [b, g, r] = image.crop({ x: px, y: py, width: 1, height: 1 }).toBitmap();
          return [r, g, b];
        };
        if (!overlay.isVisible() || !overlay.isContentProtected()) return 'protected overlay not visible';
        for (let i = 0; i < 10; i++) {
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1024, height: 1024 } });
          const image = sources.find(s => s.display_id === String(d.id))?.thumbnail;
          if (!image || image.isEmpty()) throw new Error('No primary screen capture available');
          const size = image.getSize();
          const sample = (sx, sy) => rgb(image, Math.floor((sx - d.bounds.x) / d.bounds.width * size.width),
            Math.floor((sy - d.bounds.y) / d.bounds.height * size.height));
          // Only inspect two synthetic pixels. Never serialize or save the desktop image.
          if (near(sample(x - 75, y), [0, 255, 0])) {
            const center = sample(x, y);
            if (near(center, [0, 255, 0])) return 'excluded';
            if (near(center, [0, 0, 0])) return 'blanked';
            if (near(center, [255, 0, 255])) return 'overlay captured';
          }
          await new Promise(resolve => setTimeout(resolve, 120));
        }
        return 'could not calibrate desktop capture';
      } finally { back.destroy(); }
    });
    assert.ok(['excluded', 'blanked'].includes(result), result);
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});

test('minimize to the title and restore content, running timer and window size', { timeout: 45_000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-title-'));
  let app;
  try {
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const page = await app.firstWindow();
    const [preview] = await Promise.all([app.waitForEvent('window'), app.evaluate(async ({ BrowserWindow }, file) => {
      const w = new BrowserWindow({ width: 650, height: 420, show: false });
      await w.loadFile(file);
    }, path.join(root, 'app', 'index.html'))]);
    for (const p of [page, preview]) {
      p.setDefaultTimeout(4500);
      await p.locator('#toggle-notes').click();
      await p.locator('#notes').fill('Return to camp');
      await p.locator('#timer-start').click();
      const fold = p.getByRole('button', { name: 'Minimize to title' });
      const restore = p.getByRole('button', { name: 'Restore overlay' });
      for (const manual of [false, true]) {
        if (manual) {
          await p.locator('#resize').press('ArrowLeft');
          await p.locator('#resize').press('ArrowDown');
          await p.waitForFunction(() => document.getElementById('panel').classList.contains('manual'));
        }
        const bounds = () => p.evaluate(() => {
          const el = window.questlog ? document.documentElement : document.getElementById('panel');
          return [el.clientWidth, el.clientHeight];
        });
        const before = await bounds();
        await fold.click(); await restore.waitFor();
        assert.ok(await p.getByRole('heading', { name: 'QUESTS' }).isVisible());
        assert.deepEqual(await p.locator('#panel button:visible').evaluateAll(bs => bs.map(b => b.id)), ['fold']);
        assert.ok(await p.locator('#writing').isHidden() && await p.locator('#countdown').isHidden() && await p.locator('#header-clock').isHidden());
        await p.waitForFunction(() => (window.questlog ? innerHeight : document.getElementById('panel').offsetHeight) <= 40);
        assert.equal((await bounds())[0], before[0]);
        await restore.press('Enter'); await fold.waitFor();
        await p.waitForFunction(([w,h]) => {
          const el = window.questlog ? document.documentElement : document.getElementById('panel');
          return el.clientWidth === w && el.clientHeight === h;
        }, before);
        assert.equal(await p.locator('#notes').innerText(), 'Return to camp');
        assert.ok(await p.getByRole('button', { name: 'Stop timer' }).isVisible());
      }
    }
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});

async function exerciseInitialRows(page, t) {
    const blank = page.getByRole('textbox', { name: 'New item', exact: true });
    assert.ok(await blank.evaluate(e => !e.hasAttribute('data-placeholder') && ['none', 'normal'].includes(getComputedStyle(e, '::before').content)));
    await blank.fill('Mark the map');
    let words = page.getByRole('textbox', { name: 'Item: Mark the map', exact: true });
    await words.press('Enter');
    await page.getByRole('textbox', { name: 'New item' }).fill('Pack the lamp');
    await t.test('reorder identically named items by position and keyboard without row arrows', async () => {
      const rows = page.getByRole('list', { name: 'Checklist' }).getByRole('listitem');
      const ids = () => rows.evaluateAll(nodes => nodes.map(n => n.id));
      const [a, b] = await ids();
      await rows.first().getByRole('checkbox').check();
      const secondText = page.locator(`#${b}`).getByRole('textbox');
      await secondText.fill('Mark the map');
      assert.equal(await page.locator('.order-tools,.move-up,.move-down').count(), 0);
      await rows.last().locator('.block-handle').click();
      assert.equal(await page.locator('#block-menu,#block-kind,#block-position,.drag-preview').count(), 0);
      assert.deepEqual(await ids(), [a, b]);
      await rows.last().getByRole('slider', { name: 'Reorder: Mark the map' }).fill('1');
      assert.deepEqual(await ids(), [b, a]);
      assert.ok(!await rows.first().getByRole('checkbox').isChecked());
      assert.ok(await rows.last().getByRole('checkbox').isChecked());
      await secondText.focus();
      await secondText.evaluate(e => getSelection().setBaseAndExtent(e.firstChild, 2, e.firstChild, 5));
      await secondText.press('Alt+ArrowDown');
      await secondText.press('Alt+ArrowDown'); // At the last position this must be a no-op.
      assert.deepEqual(await ids(), [a, b]);
      assert.deepEqual(await secondText.evaluate(e => [e === document.activeElement, getSelection().anchorOffset, getSelection().focusOffset]), [true, 2, 5]);
      await secondText.fill('Pack the lamp');
      await rows.first().getByRole('checkbox').uncheck();
    });
    return words;
}

test('filled list items continue; Enter exits an empty list item into plain text in place', { timeout: 40_000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-continue-'));
  let app;
  try {
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    const rows = page.locator('#items > li'), editor = () => rows.last().getByRole('textbox');
    await editor().pressSequentially('/text ');
    await editor().pressSequentially('[');
    assert.equal(await rows.last().getAttribute('data-kind'), 'paragraph');
    await editor().pressSequentially(']');
    assert.equal(await rows.last().getAttribute('data-kind'), 'todo');
    assert.equal(await editor().textContent(), '');
    assert.ok(await rows.last().getByRole('checkbox').isEnabled());
    await editor().pressSequentially(' Pack water'); // Old "[] " muscle memory shouldn't leave a leading space.
    assert.equal(await editor().textContent(), 'Pack water');
    await rows.last().getByRole('checkbox').check();
    await editor().press('End');
    await editor().press('Enter');
    assert.equal(await rows.count(), 2);
    assert.ok(await rows.first().getByRole('checkbox').isChecked());
    assert.ok(!await rows.last().getByRole('checkbox').isChecked());
    const blankId = await rows.last().getAttribute('id');
    await editor().press('Control+b'); await editor().press('Control+i');
    await editor().press('Enter');
    assert.equal(await rows.count(), 2);
    assert.equal(await rows.last().getAttribute('id'), blankId);
    assert.equal(await rows.last().getAttribute('data-kind'), 'paragraph');
    await editor().pressSequentially('Off list');
    assert.equal(await editor().locator('strong,em,a').count(), 0);
    await editor().press('Enter');
    await editor().pressSequentially('- ');
    await editor().pressSequentially('Map');
    await editor().press('Enter');
    assert.equal(await rows.last().getAttribute('data-kind'), 'bullet');
    await editor().press('Enter');
    assert.equal(await rows.last().getAttribute('data-kind'), 'paragraph');
    await editor().pressSequentially('Keep [] literal');
    await editor().press('Shift+Enter');
    await editor().pressSequentially('Second line');
    await editor().press('Enter');
    const snapshot = () => rows.evaluateAll(rs => rs.map(r => [r.dataset.kind, r.querySelector('.words').innerText.trim()]));
    const expected = [['todo', 'Pack water'], ['paragraph', 'Off list'], ['bullet', 'Map'], ['paragraph', 'Keep [] literal\nSecond line'], ['paragraph', '']];
    assert.deepEqual(await snapshot(), expected);
    await app.close(); app = undefined;
    const stored = JSON.parse(await readFile(path.join(profile, 'journal.json'), 'utf8'));
    assert.deepEqual(stored.items.map(i => [i.kind, i.text]), expected);
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});

test('numbered blocks continue, restart after a paragraph, and renumber after a move and reload', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-numbered-'));
  let app;
  try {
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const page = await app.firstWindow();
    const rows = page.locator('#items > li'), last = () => rows.last().getByRole('textbox');
    const numbers = () => rows.locator('.list-marker:visible').allTextContents();
    await last().pressSequentially('1. First'); await last().press('Enter');
    await last().pressSequentially('Second'); await last().press('Enter'); await last().press('Enter');
    await last().pressSequentially('Break'); await last().press('Enter');
    await last().pressSequentially('/numbered Third');
    assert.deepEqual(await numbers(), ['1.', '2.', '1.']);
    await last().press('Alt+ArrowUp');
    assert.deepEqual(await numbers(), ['1.', '2.', '3.']);
    await page.waitForFunction(() => document.getElementById('items').children[2].getAttribute('aria-description') === 'Numbered list item 3');
    await app.close(); app = undefined;
    const saved = JSON.parse(await readFile(path.join(profile, 'journal.json'), 'utf8'));
    assert.deepEqual(saved.items.map(i => [i.kind, i.text]), [['numbered', 'First'], ['numbered', 'Second'], ['numbered', 'Third'], ['paragraph', 'Break']]);
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const reopened = await app.firstWindow();
    await reopened.getByRole('textbox', { name: 'Item: Third' }).waitFor();
    assert.deepEqual(await reopened.locator('.list-marker:visible').allTextContents(), ['1.', '2.', '3.']);
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});

test('typed and pasted addresses link without a toolbar or dialog; a hidden timer finishes once', { timeout: 45_000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-clock-'));
  let app;
  try {
    app = await electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`] });
    const page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    await app.evaluate(({ shell, Notification }) => {
      globalThis.timerEffects = { pings: 0, toasts: 0 };
      shell.beep = () => { globalThis.timerEffects.pings++; };
      Notification.isSupported = () => true;
      Notification.prototype.show = function () { globalThis.timerEffects.toasts++; };
    });
    const textbox = page.locator('#items .words').first();
    await textbox.pressSequentially('Map: https://example.com/trail');
    let link = textbox.getByRole('link');
    assert.equal(await link.getAttribute('href'), 'https://example.com/trail');
    await textbox.pressSequentially('head.');
    assert.equal(await link.getAttribute('href'), 'https://example.com/trailhead');
    assert.equal(await link.textContent(), 'https://example.com/trailhead');
    await textbox.press('Control+a'); await textbox.press('Control+b');
    assert.equal(await page.getByRole('toolbar').count(), 0);
    await page.getByRole('button', { name: 'Notepad', exact: true }).click();
    const notes = page.getByRole('textbox', { name: 'Notepad' });
    await notes.evaluate(el => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', 'See www.example.org and example.com/map.');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.deepEqual(await notes.getByRole('link').evaluateAll(as => as.map(a => a.href)), ['https://www.example.org/', 'https://example.com/map']);
    const time = page.getByRole('textbox', { name: 'Timer time' });
    const start = page.getByRole('button', { name: 'Start timer' });
    const stop = page.getByRole('button', { name: 'Stop timer' });
    const bar = page.getByRole('progressbar', { name: 'Timer progress' });
    assert.ok(await bar.isVisible());
    const cells = page.locator('#timer-cells');
    await page.waitForFunction(() => /^\u2591+$/.test(document.getElementById('timer-cells').textContent));
    async function checkRowOpacity(expected) {
      const actual = await page.locator('#countdown').evaluate(row =>
        ['#timer-time', '#timer-cells', '#timer-glyph'].map(selector => {
          let alpha = 1;
          for (let el = row.querySelector(selector); el !== row.parentElement; el = el.parentElement) alpha *= Number(getComputedStyle(el).opacity);
          return alpha;
        }));
      assert.deepEqual(actual, [expected, expected, expected]);
    }
    await checkRowOpacity(.35);
    assert.equal(await start.textContent(), '');
    assert.ok(await start.locator('svg').isVisible());
    const packing = await cells.evaluate(el => {
      const first = el.firstElementChild, glyph = document.createRange();
      glyph.selectNodeContents(first);
      return {
        pitch: first.getBoundingClientRect().width, advance: glyph.getBoundingClientRect().width,
        overhang: el.lastElementChild.getBoundingClientRect().right - el.getBoundingClientRect().right
      };
    });
    assert.ok(Math.abs(packing.pitch - packing.advance) < .1, 'adjacent cells should be one glyph advance apart');
    assert.ok(packing.overhang >= -.5 && packing.overhang < packing.pitch + .5, 'cells should cover the track through its right edge');
    assert.ok(await time.evaluate(el => el.closest('form') === document.getElementById('move').nextElementSibling));
    assert.equal(await time.inputValue(), '25:00');
    assert.equal(await time.evaluate(el => getComputedStyle(el).fontFamily), await textbox.evaluate(el => getComputedStyle(el).fontFamily));
    assert.equal(await time.evaluate(el => getComputedStyle(el).fontSize), await textbox.evaluate(el => getComputedStyle(el).fontSize));
    assert.equal(await page.locator('#toggle-timer,#timer-reset,#timer-action').count(), 0);
    await time.fill('2:00');
    const playBox = await start.boundingBox(), playGlyph = await start.locator('path').getAttribute('d');
    const meterBox = await cells.boundingBox(), timeBox = await time.boundingBox();
    assert.ok(Math.abs(playBox.x - timeBox.x - timeBox.width - 4) < .1, 'control follows the time by 4px');
    assert.ok(Math.abs(meterBox.x - playBox.x - playBox.width - 4) < .1, 'progress bar follows the control by 4px');
    const playInk = await start.locator('path').boundingBox();
    await start.click();
    await page.waitForFunction(() => document.getElementById('timer-progress').max === 120);
    await checkRowOpacity(1);
    assert.deepEqual(await stop.boundingBox(), playBox);
    const stopInk = await stop.locator('path').boundingBox();
    const inkRatio = (playInk.width * playInk.height / 2) / (stopInk.width * stopInk.height);
    assert.ok(inkRatio >= .67 && inkRatio <= .71, 'play glyph should sit between the original and enlarged sizes');
    assert.notEqual(await stop.locator('path').getAttribute('d'), playGlyph);
    await time.click(); await time.fill('0:00'); await time.press('Enter');
    assert.equal(await time.evaluate(el => el.checkValidity()), false);
    await time.press('Escape');
    assert.ok(await stop.isVisible()); assert.equal(await bar.evaluate(el => el.max), 120);
    await stop.focus(); await stop.press('Space'); await start.waitFor();
    assert.equal(await time.inputValue(), '2:00');
    assert.equal(await bar.evaluate(el => el.value), 0);
    await checkRowOpacity(.35);
    assert.deepEqual(await app.evaluate(() => globalThis.timerEffects), { pings: 0, toasts: 0 });
    await time.fill('1234p'); await time.press('Enter'); await stop.waitFor();
    const alarm = JSON.parse(await readFile(path.join(profile, 'timer.json'), 'utf8'));
    const target = new Date(alarm.endAt), started = new Date(alarm.endAt - alarm.duration * 1000 + 999);
    const expected = new Date(started);
    expected.setHours(12, 34, 0, 0);
    if (expected <= started) expected.setDate(expected.getDate() + 1);
    assert.equal(target.getTime(), expected.getTime());
    const headerText = () => page.locator('header').evaluate(el => el.innerText.replace(/\s+/g, ' ').trim());
    const simpleHeader = /^QUESTS \d{1,2}:\d{2}[AP] - [A-Z]{3} \d{2}\.\d{2}$/;
    assert.match(await headerText(), simpleHeader);
    await stop.click(); await start.waitFor(); assert.equal(await time.inputValue(), '12.34P');
    assert.match(await headerText(), simpleHeader);
    await start.click();
    await time.click(); await time.fill('0:03'); await time.press('Enter');
    await page.waitForFunction(() => document.getElementById('timer-progress').max === 3);
    await page.waitForFunction(() => {
      const text = document.getElementById('timer-cells').textContent;
      const filled = Math.floor(text.length * document.getElementById('timer-progress').position);
      return /^\u2588+\u2591+$/.test(text) && text.indexOf('\u2591') === filled;
    });
    await page.getByRole('button', { name: 'Lock overlay' }).click();
    assert.ok(await bar.isVisible()); assert.ok(await time.evaluate(el => el.readOnly));
    assert.ok(await stop.isVisible()); assert.ok(await stop.isDisabled());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await page.waitForFunction(() => document.getElementById('countdown').dataset.status === 'done', null, { polling: 100 });
    assert.deepEqual(await app.evaluate(() => globalThis.timerEffects), { pings: 1, toasts: 1 });
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [], '', {}));
    await start.waitFor();
    assert.equal(await time.inputValue(), '0:03');
    assert.equal(await bar.evaluate(el => el.value / el.max), 1);
    assert.match(await cells.textContent(), /^\u2588+$/);
    await checkRowOpacity(.35);
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});

test('rich blocks, hover drag, opacity settings and a persistent two-axis window grip', { timeout: 100_000 }, async () => {
      const profile = await mkdtemp(path.join(tmpdir(), 'questlog-blocks-'));
      const launch = () => electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`], timeout: 20_000 });
      let app;
      try {
        app = await launch();
        let page = await app.firstWindow();
        page.setDefaultTimeout(7_000);
        await page.getByRole('textbox', { name: 'New item' }).fill('Trail map');
        let field = page.getByRole('textbox', { name: 'Item: Trail map', exact: true });
        await field.press('Control+a');
        await field.press('Control+b');
        await field.press('Control+i');
        await field.press('Control+u');
        assert.equal(await field.locator('u').textContent(), 'Trail map');
        await field.press('Control+u');
        assert.equal(await field.locator('u').count(), 0);
        await field.press('Control+u');
        assert.equal(await page.locator('#format, #format-block, #link-form, [role="toolbar"][aria-label="Text formatting"]').count(), 0);
        await field.evaluate(el => {
          const clipboardData = new DataTransfer();
          clipboardData.setData('text/plain', 'https://example.com/trail');
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        });
        const marked = await page.locator('.words').first().evaluate(e => ({
          text: e.querySelector('a strong em')?.textContent, rendered: e.innerHTML, label: e.getAttribute('aria-label')
        }));
        assert.equal(marked.text, 'Trail map', JSON.stringify(marked));
        await app.evaluate(({ shell }) => { shell.openExternal = async href => { globalThis.testOpenedLink = href; }; });
        await field.getByRole('link', { name: 'Trail map' }).click();
        await page.waitForTimeout(100);
        assert.equal(await app.evaluate(() => globalThis.testOpenedLink), 'https://example.com/trail');

        await page.getByRole('button', { name: 'Insert item' }).click();
        await page.getByRole('textbox', { name: 'New item' }).fill('Pack water');
        const water = page.getByRole('textbox', { name: 'Item: Pack water', exact: true });
        await water.press('Home');
        await page.keyboard.type('/bullet ');
        await water.press('End');
        await page.keyboard.press('Enter');
        await page.getByRole('textbox', { name: 'New item' }).pressSequentially('/text Meet at camp');
        await page.getByRole('checkbox', { name: 'Complete: Trail map' }).check();
        const rows = page.locator('#items > li');
        assert.equal(await rows.count(), 3);
        assert.equal(await page.getByRole('checkbox', { name: /^Complete:/ }).count(), 1);
        const kinds = () => rows.evaluateAll(rs => rs.map(r => r.dataset.kind));
        assert.deepEqual(await kinds(), ['todo', 'bullet', 'paragraph'], 'typing at the start of an existing block changes its kind in place');
        const source = rows.first(), startBox = await source.boundingBox();
        const gripBox = await source.locator('.block-handle').boundingBox();
        const x = Math.round(gripBox.x + 8), y = Math.round(gripBox.y + 8);
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + 2, y + 1);
        const ghost = page.locator('.drag-preview');
        assert.equal(await ghost.count(), 0);
        for (const [dx, dy] of [[12, 8], [18, 30]]) {
          await page.mouse.move(x + dx, y + dy);
          const box = await ghost.boundingBox();
          assert.ok(Math.abs(box.x - startBox.x - dx) <= 1 && Math.abs(box.y - startBox.y - dy) <= 1);
          assert.ok(Math.abs(box.width - startBox.width) <= 1);
        }
        assert.ok(await ghost.evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true' &&
          getComputedStyle(e).pointerEvents === 'none' && +getComputedStyle(e).opacity > 0 && +getComputedStyle(e).opacity < 1));
        assert.equal(await ghost.locator('a strong em').textContent(), 'Trail map');
        assert.ok(await ghost.evaluate(e => getComputedStyle(e.querySelector('.tick path')).display !== 'none'));
        assert.equal(await ghost.locator('[id], [contenteditable=true]').count(), 0);
        assert.equal(await rows.count(), 3);
        assert.equal(await page.getByRole('textbox', { name: 'Item: Trail map', exact: true }).count(), 1);
        await page.keyboard.press('Escape'); await page.mouse.up();
        assert.equal(await ghost.count(), 0);
        assert.ok(await source.getByRole('checkbox', { name: 'Complete: Trail map' }).isChecked());
        assert.deepEqual(await kinds(), ['todo', 'bullet', 'paragraph'], 'cancelling the drag preserves the block order');
        await rows.last().hover();
        await rows.last().locator('.block-handle').dragTo(rows.first(), { targetPosition: { x: 30, y: 1 } });
        assert.equal(await page.locator('.drag-preview,.dragging,.drop-before,.drop-after').count(), 0);
        assert.deepEqual(await rows.evaluateAll(rs => rs.map(r => [r.dataset.kind, r.querySelector('.words').textContent])),
          [['paragraph', 'Meet at camp'], ['todo', 'Trail map'], ['bullet', 'Pack water']]);
        assert.ok(await page.getByRole('checkbox', { name: 'Complete: Trail map' }).isChecked());
        await page.getByRole('button', { name: 'Notepad' }).click();
        const notes = page.getByRole('textbox', { name: 'Notepad' });
        await notes.fill('Bring a lamp'); await notes.press('Control+a'); await notes.press('Control+i');
        assert.equal(await notes.locator('em').textContent(), 'Bring a lamp');
        await notes.press('End');
        await notes.press('Control+u'); await notes.pressSequentially('!'); await notes.press('Control+u');
        await notes.pressSequentially('.');
        assert.equal(await notes.locator('u').textContent(), '!');

        const resize = page.getByRole('button', { name: 'Resize window' });
        await resize.focus(); await resize.press('ArrowDown'); await resize.press('ArrowDown');
        await page.waitForFunction(() => document.getElementById('panel').classList.contains('manual'));
        const start = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
        const cellCount = await page.locator('#timer-cells > span').count();
        const handle = await resize.boundingBox();
        await page.mouse.move(handle.x + 6, handle.y + 6); await page.mouse.down();
        await page.mouse.move(handle.x - 26, handle.y - 10, { steps: 4 }); await page.mouse.up();
        await page.waitForFunction(({ width, height }) => innerWidth < width - 18 && innerHeight < height - 6, start);
        await page.waitForFunction(n => document.getElementById('timer-cells').childElementCount < n, cellCount);
        const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
        assert.deepEqual([bounds.x, bounds.y], [start.x, start.y]);
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('slider', { name: 'Idle opacity' }).fill('15');
        await page.getByRole('slider', { name: 'Hover opacity' }).fill('88');
        await page.getByLabel('Background color').fill('#123456');
        await page.getByLabel('Text color').fill('#abc123');
        await page.getByRole('checkbox', { name: 'Fade text too' }).check();
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await app.close(); app = undefined;

        const saved = JSON.parse(await readFile(path.join(profile, 'journal.json'), 'utf8'));
        assert.deepEqual(saved.items.map(b => b.kind), ['paragraph', 'todo', 'bullet']);
        assert.deepEqual(saved.items[1].spans, [{ from: 0, to: 9, href: 'https://example.com/trail', bold: true, italic: true, underline: true }]);
        assert.deepEqual(saved.noteSpans, [{ from: 0, to: 12, italic: true }, { from: 12, to: 13, italic: true, underline: true }, { from: 13, to: 14, italic: true }]);
        assert.deepEqual([saved.opacity, saved.hoverOpacity, saved.fadeText], [15, 88, true]);
        assert.deepEqual([saved.backgroundColor, saved.textColor], ['#123456', '#abc123']);
        app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(7_000);
        field = page.getByRole('textbox', { name: 'Item: Trail map', exact: true });
        assert.equal(await field.locator('a strong em u').textContent(), 'Trail map');
        assert.equal(await page.getByRole('textbox', { name: 'Notepad' }).locator('u').textContent(), '!');
        const colors = await page.locator('#overlay-title, #header-clock, #timer-time, .words, .words a, #notes').evaluateAll(nodes =>
          [...new Set(nodes.map(el => getComputedStyle(el).color))]);
        assert.deepEqual(colors, ['rgb(171, 193, 35)']);
        await page.waitForFunction(() => getComputedStyle(document.getElementById('panel')).backgroundColor === 'rgb(18, 52, 86)');
        assert.deepEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()), bounds);

        const [preview] = await Promise.all([app.waitForEvent('window'), app.evaluate(async ({ BrowserWindow }, file) => {
          const w = new BrowserWindow({ width: 720, height: 520, show: false });
          await w.loadFile(file);
        }, path.join(root, 'app', 'index.html'))]);
        preview.setDefaultTimeout(7_000);
        await preview.getByRole('button', { name: 'Settings', exact: true }).click();
        await preview.getByRole('slider', { name: 'Idle opacity' }).fill('10');
        await preview.getByRole('slider', { name: 'Hover opacity' }).fill('85');
        await preview.getByRole('checkbox', { name: 'Fade text too' }).check();
        await preview.getByRole('button', { name: 'Done', exact: true }).click();
        await preview.mouse.move(1, 1);
        await preview.waitForFunction(() => Math.abs(+getComputedStyle(document.getElementById('panel')).opacity - .1) < .01);
        await preview.locator('#move h1').hover();
        await preview.waitForFunction(() => Math.abs(+getComputedStyle(document.getElementById('panel')).opacity - .85) < .01);
        await preview.getByRole('button', { name: 'Settings', exact: true }).click();
        await preview.getByRole('slider', { name: 'Idle opacity' }).fill('95');
        assert.equal(await preview.getByRole('slider', { name: 'Hover opacity' }).inputValue(), '95');
        await preview.getByRole('slider', { name: 'Hover opacity' }).fill('35');
        assert.equal(await preview.getByRole('slider', { name: 'Idle opacity' }).inputValue(), '35');
      } finally {
        try { await app?.close(); }
        finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
      }
});

test('direct editing, independent checkboxes, true opacity endpoints, lock and restart', { timeout: 90_000 }, async t => {
  const profile = await mkdtemp(path.join(tmpdir(), 'questlog-desktop-'));
  const launch = () => electron.launch({ cwd: root, args: ['.', `--user-data-dir=${profile}`], timeout: 20_000 });
  let app;
  try {
    app = await launch();
    let page = await app.firstWindow();
    page.setDefaultTimeout(8_000);
    const words = await exerciseInitialRows(page, t);
    await t.test('new journals keep the compact reference look and expose normal settings', async () => {
      const pitch = () => page.locator('.line').evaluateAll(rows => rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top);
      assert.equal(await pitch(), 24);
      assert.equal(await words.evaluate(e => getComputedStyle(e).fontSize), '15px');
      assert.equal(await page.locator('#overlay-title').evaluate(e => getComputedStyle(e).fontSize), '20px');
      assert.ok(Math.abs(parseFloat(await words.evaluate(e => getComputedStyle(e).lineHeight)) - 16.5) < 0.01);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,');
      assert.ok(await page.getByRole('slider', { name: 'Idle opacity' }).isVisible());
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await page.locator('#dev-panel, #toggle-dev, #move > svg').count(), 0);
      assert.deepEqual(await page.locator('.tools button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label'))),
        ['Insert item', 'Notepad', 'Settings', 'Lock overlay', 'Minimize to title']);
    });
    const check = page.getByRole('checkbox', { name: 'Complete: Mark the map', exact: true });
    await check.click();
    assert.ok(await check.isChecked());
    await words.click();
    assert.ok(await words.evaluate(n => n === document.activeElement));
    assert.ok(await check.isChecked());
    await words.fill('Mark two trails');
    assert.ok(await page.getByRole('checkbox', { name: 'Complete: Mark two trails' }).isChecked());
    await page.getByRole('textbox', { name: 'Item: Pack the lamp' }).fill('');
    await page.getByRole('button', { name: 'Notepad' }).click();
    await page.getByRole('textbox', { name: 'Notepad' }).fill('Camp is east of the river.\nBring a lamp.');
    assert.equal(await page.locator('#items li').count(), 1);
    assert.equal(await page.getByRole('button', { name: /^Move (up|down):/ }).count(), 0);
    async function checkFace(family) {
      const session = await page.context().newCDPSession(page);
      try {
        await session.send('DOM.enable');
        await session.send('CSS.enable');
        const { root } = await session.send('DOM.getDocument');
        const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#overlay-title' });
        const writing = await page.evaluate(async name => {
          await document.fonts.load(`20px "${name}"`, 'QUESTS');
          await document.fonts.ready;
          return ['.words', '#notes'].map(s => getComputedStyle(document.querySelector(s)).fontFamily.split(',')[0].replaceAll('"', ''));
        }, family);
        assert.deepEqual(writing, [family, family]);
        const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
        assert.ok(fonts.some(f => f.isCustomFont && (f.familyName === family || f.familyName.startsWith(`${family} `)) && f.glyphCount > 0),
          `${family} should render the title without falling back: ${JSON.stringify(fonts)}`);
      } finally { await session.detach(); }
    }
    await checkFace('DotGothic16');
    const sampleBackdrop = async () => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const image = await window.webContents.capturePage({ x: window.getContentBounds().width - 11, y: 12, width: 8, height: 8 });
        const alpha = image.toBitmap().filter((_value, index) => index % 4 === 3);
        return { min: Math.min(...alpha), max: Math.max(...alpha), mean: alpha.reduce((sum, a) => sum + a, 0) / alpha.length };
      });
    };
    await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0], p = screen.getCursorScreenPoint(), area = screen.getPrimaryDisplay().workArea;
      w.setPosition(p.x < area.x + area.width / 2 ? area.x + area.width - w.getBounds().width : area.x, area.y + 24);
    });
    await page.waitForTimeout(300);
    const stipple = await sampleBackdrop();
    assert.ok(stipple.max > stipple.min && Math.abs(stipple.mean / 255 - 0.06) < 0.015);
    await app.close();
    app = undefined;
    const file = path.join(profile, 'journal.json');
    const fresh = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(fresh.pixelSize, 1);
    assert.equal(fresh.dither, 100);
    const tuned = { ...fresh, typeface: 'shippori-mincho', rowGap: 6, lineHeight: 150, titleSize: 22, opacity: 0, hoverOpacity: 0, pixelSize: 2 };
    await writeFile(file, JSON.stringify(tuned));
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('checkbox', { name: 'Complete: Mark two trails' }).waitFor();
    await checkFace('Shippori Mincho');
    assert.equal(await page.locator('#overlay-title').evaluate(e => getComputedStyle(e).fontSize), '22px');
    assert.equal((await sampleBackdrop()).max, 0);
    await t.test('dithering changes the actual strokes of focused text on a clear panel', async () => {
      async function pixels(rect) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const encoded = await app.evaluate(async ({ BrowserWindow }, area) => {
          const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(area);
          return image.toBitmap().toString('base64');
        }, rect);
        return Buffer.from(encoded, 'base64');
      }
      for (const field of [page.locator('.words').first(), page.locator('#notes')]) {
        await field.focus();
        await field.press('Control+End');
        const box = await field.boundingBox();
        const bottom = await pixels({ x: Math.floor(box.x + box.width) - 24, y: Math.floor(box.y + box.height) - 1, width: 12, height: 1 });
        assert.ok(bottom.every((v, i) => i % 4 !== 3 || v === 0), 'editing should not draw a guide beneath the text');
        const rect = { x: Math.ceil(box.x), y: Math.ceil(box.y), width: 80, height: 24 };
        const dithered = await pixels(rect);
        const plainStyle = await page.addStyleTag({ content: '#panel { filter: none; }' });
        const plain = await pixels(rect);
        await plainStyle.evaluate(el => el.remove());
        const drops = [];
        for (let i = 0; i < plain.length; i += 4) {
          if (plain[i + 3] >= 240 && plain[i + 2] >= 180) drops.push(plain[i + 2] - dithered[i + 2]);
        }
        assert.ok(drops.filter(delta => delta > 24).length >= 10, 'the pattern must darken letter strokes, not just the backdrop');
        assert.ok(Math.max(...drops) - Math.min(...drops) >= 30, 'strokes must have multiple tones, not a uniform tint');
      }
    });
    await page.getByRole('textbox', { name: 'Notepad' }).fill('Camp is east of the river.\nBring two lamps.');
    await page.getByRole('button', { name: 'Lock overlay' }).click();
    await page.waitForSelector('html.locked', { state: 'attached' });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocusable()), false);
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [], '', {}));
    await page.waitForSelector('html:not(.locked)', { state: 'attached' });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
    await app.close();
    app = undefined;

    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(saved, { ...tuned, notes: 'Camp is east of the river.\nBring two lamps.' });
    await writeFile(file, JSON.stringify({ ...saved, opacity: 100, hoverOpacity: 100, dither: 0 }));
    app = await launch();
    const restored = page = await app.firstWindow();
    assert.ok(await restored.getByRole('checkbox', { name: 'Complete: Mark two trails' }).isChecked());
    assert.equal(await restored.getByRole('textbox', { name: 'Notepad' }).innerText(), saved.notes);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), 'QUESTS');
    assert.equal((await sampleBackdrop()).min, 255);
    assert.equal(await restored.locator('#panel').evaluate(e => getComputedStyle(e).filter), 'none');

    await t.test('drag the heading in the standalone preview; locking prevents movement', async () => {
      const [preview] = await Promise.all([
        app.waitForEvent('window'),
        app.evaluate(async ({ BrowserWindow }, file) => {
          const window = new BrowserWindow({ width: 650, height: 420, show: false });
          await window.loadFile(file);
        }, path.join(root, 'app', 'index.html'))
      ]);
      const title = preview.getByRole('heading', { name: 'QUESTS', exact: true });
      const panel = preview.getByRole('main', { name: 'QUESTS' });
      await preview.clock.install({ time: new Date(2026, 10, 18, 12, 14, 20) });
      await preview.reload();
      assert.equal(await preview.locator('#header-clock').textContent(), '12:14P - WED 11.18');
      await preview.clock.fastForward(60_000);
      assert.equal(await preview.locator('#header-clock').textContent(), '12:15P - WED 11.18');
      await preview.getByRole('textbox', { name: 'Item: Pack the field notebook' }).press('Alt+ArrowUp');
      await preview.reload();
      assert.equal(await preview.getByRole('listitem', { name: 'Item 1 of 3' }).getByRole('textbox').innerText(), 'Pack the field notebook');
      async function dragTitle() {
        const { x, y, width, height } = await title.boundingBox();
        await preview.mouse.move(x + width / 2, y + height / 2);
        await preview.mouse.down();
        await preview.mouse.move(x + width / 2 + 48, y + height / 2 + 36);
        await preview.mouse.up();
      }
      const start = await panel.boundingBox();
      await dragTitle();
      const moved = await panel.boundingBox();
      assert.ok(Math.abs((moved.x - start.x) - 48) < 1);
      assert.ok(Math.abs((moved.y - start.y) - 36) < 1);
      await preview.getByRole('button', { name: 'Lock overlay' }).click();
      await dragTitle();
      assert.deepEqual(await panel.boundingBox(), moved);
    });
  } finally {
    try { await app?.close(); }
    finally { await rm(profile, { force: true, recursive: true, maxRetries: 4, retryDelay: 150 }); }
  }
});
