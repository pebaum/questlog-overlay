import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openJournal, writeJson } from '../desktop/storage.js';
import { findDisplay, fitPanel } from '../desktop/placement.js';
import { loadJournal, newJournal, validateJournal } from '../shared/journal.js';
import { legacyAppearance } from '../shared/appearance.js';
import { webLink } from '../shared/rich.js';

function tempJournal(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'questlog-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'journal.json');
}

test('completed items, Unicode notes, preferences, and a deliberately empty list survive restart', t => {
  const file = tempJournal(t);
  const journal = openJournal(file);
  journal.items.push({ id: 'map', kind: 'todo', text: 'Mark campsite', done: true, spans: [{ from: 0, to: 4, bold: true, italic: true }] });
  journal.notes = 'Inventory\n\u2615 and a map';
  for (const opacity of [0, 100]) {
    journal.opacity = opacity;
    journal.hoverOpacity = 100;
    writeJson(file, journal);
    assert.deepEqual(openJournal(file), journal);
  }
  for (const opacity of [-1, 101]) assert.throws(() => validateJournal({ ...journal, opacity }));
  journal.items = [];
  writeJson(file, journal);
  assert.deepEqual(openJournal(file).items, []);
});

test('upgrading preserves original file, ordering, titles, checks, notes, and custom opacity', t => {
  const file = tempJournal(t);
  const old = { version: 1, quests: [
    { id: 'trip', title: 'Weekend trip', folded: true, objectives: [{ id: 'map', text: 'Bring the map', done: true }] },
    { id: 'call', title: 'Call the guide', folded: false, objectives: [] }
  ], opacity: 48, notes: 'Meet at noon.', theme: 'light' };
  writeJson(file, old);
  const original = readFileSync(file, 'utf8');
  const flat = openJournal(file);
  assert.deepEqual(flat.items, [
    { id: 'trip', text: 'Weekend trip', done: true, kind: 'todo' },
    { id: 'map', text: 'Bring the map', done: true, kind: 'todo' },
    { id: 'call', text: 'Call the guide', done: false, kind: 'todo' }
  ]);
  assert.equal(flat.opacity, 48);
  assert.equal(flat.notes, old.notes);
  assert.equal(flat.notesOpen, true);
  assert.deepEqual(openJournal(file), flat);
  assert.equal(readFileSync(`${file}.v1.bak`, 'utf8'), original);
  assert.equal(loadJournal({ ...old, opacity: 82 }).opacity, 12);
});

test('a v2 checklist becomes to-do blocks with its order, checkmarks, settings and original backup intact', t => {
  const file = tempJournal(t);
  const previous = { version: 2, items: [{ id: 'keep', text: 'Keep my casing', done: true }], notes: 'My notes', notesOpen: true, opacity: 0 };
  writeJson(file, previous);
  const expected = { ...legacyAppearance, ...previous, version: 3, hoverOpacity: 70, fadeText: false, items: [{ ...previous.items[0], kind: 'todo' }] };
  assert.deepEqual(openJournal(file), expected);
  assert.deepEqual(JSON.parse(readFileSync(`${file}.v2.bak`, 'utf8')), previous);
  assert.deepEqual(openJournal(file), expected);
  assert.throws(() => loadJournal({ ...previous, typeface: 'unknown-face' }), /typeface/);
});

test('pre-tuner journals gain compact defaults without resetting their font, opacity or content', () => {
  const previous = { version: 2, items: [{ id: 'keep', text: 'Mark campsite', done: true }], notes: 'North trail', notesOpen: true, opacity: 0, typeface: 'dotgothic16' };
  assert.deepEqual(loadJournal(previous), { ...legacyAppearance, ...previous, version: 3, hoverOpacity: 70, fadeText: false, items: [{ ...previous.items[0], kind: 'todo' }] });
  for (const invalid of [{ rowGap: -1 }, { lineHeight: 0 }, { textSize: 400 }, { titleSize: 0 }, { pixelSize: 1.5 }, { dither: 101 }]) {
    assert.throws(() => loadJournal({ ...previous, ...invalid }));
  }
});

test('validate typed blocks, inline marks, web URLs and the idle/hover pair', () => {
  const journal = newJournal();
  const block = { id: 'note', kind: 'paragraph', text: 'Read this', done: false, spans: [{ from: 5, to: 9, italic: true, href: 'https://example.com/notes' }] };
  journal.items = [block];
  journal.notes = 'Hello';
  journal.noteSpans = [{ from: 1, to: 4, underline: true }];
  assert.deepEqual(validateJournal(journal), journal);
  assert.throws(() => validateJournal({ ...journal, noteSpans: [{ from: 1, to: 4, italic: true, underline: 'yes' }] }));
  assert.equal(webLink('https://example.com'), 'https://example.com/');
  for (const invalid of ['file:///notes', 'javascript:void(0)', 'data:text/plain,notes', 'https://user:pass@example.com/']) assert.equal(webLink(invalid), null);
  for (const spans of [[{ from: 0, to: 10, bold: true }], [{ from: 0, to: 1, href: 'file:///notes' }], [{ from: 1, to: 4, bold: true }, { from: 3, to: 4, italic: true }]]) {
    assert.throws(() => validateJournal({ ...journal, items: [{ ...block, spans }] }));
  }
  assert.throws(() => validateJournal({ ...journal, opacity: 50, hoverOpacity: 30 }));
});

test('a damaged or newer journal is never replaced with an empty list', t => {
  const file = tempJournal(t);
  for (const raw of ['{', '{"version":4}', '{"version":3}', '{"version":2}', '{"version":1,"quests":[]}']) {
    writeFileSync(file, raw);
    assert.throws(() => openJournal(file));
    assert.equal(readFileSync(file, 'utf8'), raw);
  }
});

test('older v3 journals gain color defaults and only opaque picker colors are accepted', () => {
  const { backgroundColor, textColor, ...old } = newJournal();
  old.notes = 'Stay as written'; old.opacity = 0;
  assert.deepEqual(loadJournal(old), { ...old, backgroundColor, textColor });
  for (const bad of [null, 'red', '#12345678', ['#ffffff']]) {
    assert.throws(() => loadJournal({ ...old, textColor: bad }), /color/);
  }
});

test('restore on a left-hand monitor; keep a growing panel inside its work area', () => {
  const left = { x: -1280, y: -50, width: 1280, height: 900 };
  const right = { x: 0, y: 0, width: 1920, height: 1080 };
  const displays = [left, right].map(bounds => ({ bounds }));
  assert.equal(findDisplay(displays, { x: -100, y: 830 }), displays[0]);
  assert.equal(findDisplay([displays[1]], { x: -100, y: 830 }), undefined);
  assert.deepEqual(fitPanel(left, { x: -100, y: 830 }, 400), { x: -350, y: 450, width: 350, height: 400 });
});
