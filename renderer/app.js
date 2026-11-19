import { limits, loadJournal, newJournal } from '../shared/journal.js';
import { blockTypes, webLink } from '../shared/rich.js';
import { typefaces } from '../shared/typefaces.js';
import { caretAt, inlineEditor, richValue } from './inline.js';
import { setupGeometry } from './geometry.js';
import { enableBlockDrag } from './reorder.js';
import { initTimer } from './timer.js';
import { localStamp } from '../shared/local-time.js';
import { bindUpdateAction } from './update-action.js';
import { bindVisibility } from './visibility.js';

const $ = id => document.getElementById(id);
const root = document.documentElement, native = window.questlog, list = $('items'), panel = $('panel');
const editors = new Map(), values = new Map(), previewKey = 'questlog.preview.v3';
// An explicit blank block (Enter or a type shortcut) is not a disposable input placeholder.
const keptBlanks = new WeakSet();
let journal, mode = { locked: false, shortcut: null }, note, frame, cancelDrag, resetSize, syncTimerMode, visibility;
const locked = () => mode.locked;

function openPreview() {
  const raw = localStorage.getItem(previewKey) ?? localStorage.getItem('questlog.preview.v2') ?? localStorage.getItem('questlog.preview.v1');
  if (raw !== null) return loadJournal(JSON.parse(raw));
  const sample = newJournal();
  sample.items = [
    { id: 'map', text: 'Mark the trail on the map', kind: 'todo', done: false },
    { id: 'book', text: 'Pack the field notebook', kind: 'bullet', done: false },
    { id: 'lamp', text: 'Camp before dusk.', kind: 'paragraph', done: false }
  ];
  return sample;
}
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function save() {
  try {
    if (native) native.save(journal);
    else { localStorage.setItem(previewKey, JSON.stringify(journal)); notice(); }
  } catch (e) { notice(`Changes not saved: ${e.message}`); }
}
function fit() {
  cancelAnimationFrame(frame);
  if (!native) return;
  frame = requestAnimationFrame(() => native.fit(Math.ceil(panel.getBoundingClientRect().height),
    panel.classList.contains('icon-only') ? 'icon' : panel.classList.contains('folded') ? 'compact' : 'expanded'));
}
function appearance() {
  const s = panel.style;
  s.setProperty('--journal-face', `"${typefaces[journal.typeface].name}", var(--song-stack)`);
  s.setProperty('--text-size', `${journal.textSize / 16}rem`); s.setProperty('--title-size', `${journal.titleSize / 16}rem`);
  s.setProperty('--row-gap', `${journal.rowGap}px`); s.setProperty('--leading', journal.lineHeight / 100);
  s.setProperty('--idle', `${journal.opacity}%`); s.setProperty('--hover', `${journal.hoverOpacity}%`);
  s.setProperty('--cp-smoke', journal.backgroundColor);
  s.setProperty('--cp-ivory', journal.textColor);
  $('background-color').value = journal.backgroundColor;
  $('text-color').value = journal.textColor;
  panel.classList.toggle('fade-text', journal.fadeText);
  panel.classList.toggle('auto-hide', journal.autoHide !== 'off');
  $('auto-hide').value = journal.autoHide;
  s.setProperty('--screen-fx', journal.dither ? 'url("#screen-dither")' : 'none');
  $('dither-mix').setAttribute('k2', journal.dither / 100); $('dither-mix').setAttribute('k3', 1 - journal.dither / 100);
  for (const side of ['width', 'height']) $('dither-cell').setAttribute(side, journal.pixelSize * 4);
  for (const [id, value] of [['idle-opacity', journal.opacity], ['hover-opacity', journal.hoverOpacity]]) {
    $(id).value = value; $(id).setAttribute('aria-valuetext', `${value}%`);
    $(id).nextElementSibling.value = `${value}%`;
  }
  $('fade-text').checked = journal.fadeText; $('typeface').value = journal.typeface;
}
function closeSettings() {
  $('settings').hidden = true;
  $('gear').setAttribute('aria-expanded', 'false');
  visibility?.refresh();
}
function openSettings() {
  if (locked()) return;
  visibility.reveal();
  $('settings').hidden = false; $('gear').setAttribute('aria-expanded', 'true'); $('idle-opacity').focus();
}
function openLink(href) {
  const url = webLink(href);
  if (locked() || !url) return;
  if (native) native.openLink(url).catch(e => notice(`Could not open link: ${e.message}`));
  else window.open(url, '_blank', 'noopener,noreferrer');
}
function bindSettings() {
  $('gear').onclick = () => { if ($('settings').hidden) openSettings(); else closeSettings(); };
  $('settings-done').onclick = () => { closeSettings(); $('gear').focus(); };
  $('idle-opacity').oninput = () => {
    journal.opacity = $('idle-opacity').valueAsNumber; journal.hoverOpacity = Math.max(journal.opacity, journal.hoverOpacity);
    appearance(); save();
  };
  $('hover-opacity').oninput = () => {
    journal.hoverOpacity = $('hover-opacity').valueAsNumber; journal.opacity = Math.min(journal.opacity, journal.hoverOpacity);
    appearance(); save();
  };
  $('fade-text').onchange = () => { journal.fadeText = $('fade-text').checked; appearance(); save(); };
  $('auto-hide').onchange = () => { journal.autoHide = $('auto-hide').value; appearance(); visibility.refresh(); save(); };
  for (const [id, key] of [['background-color', 'backgroundColor'], ['text-color', 'textColor']]) {
    $(id).oninput = () => { journal[key] = $(id).value; appearance(); save(); };
  }
  for (const [id, f] of Object.entries(typefaces)) $('typeface').add(new Option(f.name, id));
  $('typeface').onchange = () => { journal.typeface = $('typeface').value; appearance(); save(); };
  $('fit-content').onclick = () => { closeSettings(); resetSize(); fit(); };
  document.addEventListener('keydown', e => {
    if (locked() || e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.key === 'Escape') {
      cancelDrag?.();
      if (!$('settings').hidden) { closeSettings(); $('gear').focus(); }
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!$('settings').hidden && !e.target.closest('#settings,#gear')) closeSettings();
  });
}
const itemRows = () => [...list.children].filter(row => !row.classList.contains('empty'));
function startHeaderClock() {
  const clock = $('header-clock');
  let timeout;
  function refresh() {
    clearTimeout(timeout);
    const now = new Date();
    clock.textContent = localStamp(now);
    clock.dateTime = now.toISOString();
    clock.setAttribute('aria-label', `Current time: ${now.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}`);
    timeout = setTimeout(refresh, 60_000 - now.getTime() % 60_000);
  }
  refresh();
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', () => clearTimeout(timeout));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
function saveRows() {
  journal.items = itemRows().map(row => ({
    id: row.dataset.id, kind: row.dataset.kind, done: row.dataset.kind === 'todo' && row.querySelector('.tick input').checked, ...values.get(row)
  }));
  save();
}
function updateRow(row) {
  const { text } = values.get(row), todo = row.dataset.kind === 'todo';
  if (text.trim()) keptBlanks.delete(row);
  const draft = !text.trim() && !keptBlanks.has(row);
  const check = row.querySelector('.tick input'), order = row.querySelector('.order-value');
  row.classList.toggle('empty', draft);
  if (draft) check.checked = false;
  row.querySelector('.tick').hidden = !todo;
  const marker = row.querySelector('.list-marker');
  marker.hidden = row.dataset.kind !== 'bullet' && (row.dataset.kind !== 'numbered' || draft);
  if (row.dataset.kind === 'bullet') marker.textContent = '\u2022';
  check.disabled = draft || locked();
  check.setAttribute('aria-label', draft ? 'Empty item' : `Complete: ${text.trim() ? text : 'Untitled to-do'}`);
  order.setAttribute('aria-label', `Reorder: ${text.trim() || 'Untitled block'}`);
  if (draft) {
    order.hidden = true;
    row.setAttribute('aria-label', 'New item'); row.removeAttribute('aria-posinset'); row.removeAttribute('aria-setsize');
  }
}
function syncOrder() {
  const rows = itemRows();
  let number = 0;
  rows.forEach((row, i) => {
    number = row.dataset.kind === 'numbered' ? number + 1 : 0;
    if (number) row.querySelector('.list-marker').textContent = `${number}.`;
    row.setAttribute('aria-label', `Item ${i + 1} of ${rows.length}`);
    row.setAttribute('aria-description', number ? `Numbered list item ${number}` : `${row.dataset.kind} block`);
    row.setAttribute('aria-posinset', i + 1); row.setAttribute('aria-setsize', rows.length);
    const order = row.querySelector('.order-value');
    order.hidden = locked() || rows.length < 2;
    order.max = rows.length; order.value = i + 1;
    order.setAttribute('aria-valuetext', `${i + 1} of ${rows.length}`);
  });
}
function placeRow(row, before) {
  if (locked() || row === before || row.nextElementSibling === before) return;
  const focus = row.contains(document.activeElement) ? document.activeElement : null;
  const selection = document.getSelection();
  // Moving an editor can preserve focus but collapse the selection onto its old parent.
  const caret = focus && selection?.rangeCount && row.contains(selection.anchorNode) && row.contains(selection.focusNode)
    ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset] : null;
  if (list.moveBefore) list.moveBefore(row, before); else list.insertBefore(row, before);
  if (focus && focus !== document.activeElement) focus.focus({ preventScroll: true });
  if (caret) selection.setBaseAndExtent(...caret);
  syncOrder(); saveRows();
  row.scrollIntoView({ block: 'nearest' });
  $('order-status').textContent = `Moved ${values.get(row).text} to ${row.getAttribute('aria-label')}.`;
}
function stepRow(row, step) {
  const rows = itemRows(), target = rows[rows.indexOf(row) + step];
  if (target && rows.includes(row)) placeRow(row, step < 0 ? target : target.nextElementSibling);
}
function changeKind(row, kind) {
  if (!row || !blockTypes.includes(kind) || locked()) return;
  row.dataset.kind = kind;
  if (!values.get(row).text.trim()) keptBlanks.add(row);
  if (kind !== 'todo') row.querySelector('.tick input').checked = false;
  updateRow(row); syncOrder(); saveRows();
}
function removeRow(row) {
  const view = editors.get(row);
  view.destroy(); editors.delete(row); values.delete(row); row.remove();
}
function clearEmptyRows() {
  for (const row of list.querySelectorAll('.empty')) {
    if (row.contains(document.activeElement)) continue;
    if (list.children.length > 1 || journal.notesOpen) removeRow(row);
  }
}
function createRow(item = {}, after = null) {
  const row = $('line').content.firstElementChild.cloneNode(true), id = item.id ?? crypto.randomUUID();
  const field = row.querySelector('.words'), check = row.querySelector('.tick input'), order = row.querySelector('.order-value');
  row.id = `item-${id}`; row.dataset.id = id; row.dataset.kind = item.kind ?? 'todo';
  if ((item.id || after) && !item.text?.trim()) keptBlanks.add(row);
  field.id = `text-${id}`; check.id = `check-${id}`; order.id = `order-${id}`;
  check.checked = item.done || false; check.onchange = saveRows;
  order.oninput = () => stepRow(row, order.valueAsNumber - 1 - itemRows().indexOf(row));
  row.onkeydown = e => {
    if (!locked() && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); stepRow(row, e.key === 'ArrowUp' ? -1 : 1);
    }
  };
  if (after) after.after(row); else list.append(row);
  let optionalSpace = false;
  field.addEventListener('blur', () => { optionalSpace = false; });
  const view = inlineEditor(field, {
    text: item.text ?? '', spans: item.spans, limit: limits.item, locked, openLink, error: notice,
    label: t => t.trim() ? `Item: ${t}` : 'New item',
    changed(v) {
      optionalSpace = false;
      const empty = row.classList.contains('empty');
      values.set(row, richValue(v.state.doc)); updateRow(row);
      if (empty !== row.classList.contains('empty')) syncOrder();
      saveRows();
    },
    prefix(v, before, typed, pos) {
      if (optionalSpace && typed === ' ' && !pos) { optionalSpace = false; return true; }
      const brackets = before + typed === '[]';
      if (!brackets && typed !== ' ') return false;
      const kind = brackets || ['[]', '[ ]', '/todo'].includes(before) ? 'todo'
        : ['-', '*', '/bullet'].includes(before) ? 'bullet' : ['1.', '/numbered'].includes(before) ? 'numbered'
        : ['/text', '/paragraph'].includes(before) ? 'paragraph' : null;
      if (!kind) return false;
      if (pos) v.dispatch(v.state.tr.delete(0, pos));
      check.checked = false; changeKind(row, kind);
      optionalSpace = brackets;
      return true;
    },
    key(v, e) {
      const { doc, selection: { from, to, empty } } = v.state;
      if (e.key === 'Escape') { v.dom.blur(); closeSettings(); return true; }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (row.dataset.kind !== 'paragraph' && !doc.textContent.trim()) {
          v.dispatch(v.state.tr.delete(0, doc.content.size).setStoredMarks([]));
          optionalSpace = false; changeKind(row, 'paragraph'); return true;
        }
        const tail = richValue(doc.cut(to));
        keptBlanks.add(row);
        if (from < doc.content.size) v.dispatch(v.state.tr.delete(from, doc.content.size));
        else updateRow(row);
        const next = createRow({ kind: row.dataset.kind, ...tail }, row);
        caretAt(next, 0); syncOrder(); saveRows(); return true;
      }
      if (e.key === 'Backspace' && empty && from === 0) {
        if (row.dataset.kind !== 'paragraph' && doc.content.size) { changeKind(row, 'paragraph'); return true; }
        const prev = editors.get(row.previousElementSibling);
        if (!prev) {
          if (doc.content.size || !keptBlanks.has(row)) return false;
          const next = editors.get(row.nextElementSibling);
          if (next) { removeRow(row); caretAt(next, 0); }
          else { keptBlanks.delete(row); updateRow(row); }
          syncOrder(); saveRows(); return true;
        }
        const at = prev.state.doc.content.size;
        if (at + doc.content.size > limits.item) { notice('These blocks are too long to merge.'); return true; }
        prev.dispatch(prev.state.tr.insert(at, doc.content)); removeRow(row); caretAt(prev, at); syncOrder(); saveRows(); return true;
      }
      return false;
    }
  });
  editors.set(row, view); values.set(row, richValue(view.state.doc)); updateRow(row);
  return view;
}
function showNotes() {
  $('notes-wrap').hidden = !journal.notesOpen || (locked() && !journal.notes);
  $('toggle-notes').setAttribute('aria-expanded', String(journal.notesOpen));
  if (!journal.notesOpen && !list.children.length && !locked()) createRow();
}
function setMode(next) {
  mode = next;
  if (locked()) { document.activeElement?.blur(); closeSettings(); clearEmptyRows(); cancelDrag?.(); }
  root.classList.toggle('locked', locked()); $('move').title = locked() ? '' : 'Drag to move; double-click to minimize or restore';
  syncTimerMode?.();
  for (const [row, v] of editors) { v.setProps({}); updateRow(row); }
  note.setProps({}); syncOrder(); showNotes();
  const action = locked() ? 'Unlock overlay' : 'Lock overlay';
  $('lock').title = native ? `${action} (${mode.shortcut ?? 'use the tray to unlock'})` : `${action} (preview only)`;
  $('lock').setAttribute('aria-label', action); $('lock').setAttribute('aria-pressed', String(locked()));
  $('lock').querySelector('use').setAttribute('href', locked() ? '#i-closed' : '#i-open');
  fit();
}
async function init() {
  let fixed = false;
  if (native) {
    root.classList.add('desktop');
    const data = await native.load();
    journal = loadJournal(data.journal); mode = data.mode; fixed = data.manualSize;
    root.style.setProperty('--panel-limit', `${data.maxHeight}px`);
    panel.classList.toggle('hot', !!data.hot);
    native.onLimit(h => root.style.setProperty('--panel-limit', `${h}px`));
    native.onSave(s => notice(s.ok ? '' : `Changes not saved: ${s.error}`));
    native.onMode(setMode); native.onSettings(openSettings);
  } else journal = openPreview();
  resetSize = setupGeometry(panel, native, fixed, locked, notice);
  visibility = bindVisibility(panel, native, () => journal.autoHide, fit, panel.classList.contains('hot'), closeSettings);
  cancelDrag = enableBlockDrag(list, $('writing'), locked, placeRow);
  bindSettings();
  for (const item of journal.items) createRow(item);
  startHeaderClock();
  note = inlineEditor($('notes'), {
    text: journal.notes, spans: journal.noteSpans, limit: limits.notes, placeholder: 'Write a note…',
    label: () => 'Notepad', locked, openLink, error: notice,
    changed(v) {
      const data = richValue(v.state.doc); journal.notes = data.text;
      if (data.spans) journal.noteSpans = data.spans; else delete journal.noteSpans;
      save();
    }
  });
  $('append').onclick = () => {
    visibility.reveal();
    closeSettings(); const last = list.lastElementChild;
    (last?.classList.contains('empty') ? editors.get(last) : createRow()).focus();
  };
  $('toggle-notes').onclick = () => {
    visibility.reveal();
    closeSettings(); journal.notesOpen = !journal.notesOpen;
    showNotes(); clearEmptyRows(); save(); if (journal.notesOpen) note.focus();
  };
  $('lock').onclick = () => native ? native.toggleLock() : setMode({ ...mode, locked: !locked() });
  document.addEventListener('click', clearEmptyRows); document.addEventListener('keyup', clearEmptyRows);
  syncTimerMode = initTimer(native, locked, notice);
  bindUpdateAction($('update-action'), native, notice);
  appearance(); setMode(mode); new ResizeObserver(fit).observe(panel);
}
init().catch(e => {
  $('writing').inert = true; document.querySelector('.tools').inert = true;
  notice(`Cannot open the journal: ${e.message} Your saved data has not been replaced.`);
});
