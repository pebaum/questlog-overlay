import { typefaces } from './typefaces.js';
import { appearanceRanges, defaultAppearance, defaultColors, legacyAppearance } from './appearance.js';
import { blockTypes, checkSpans } from './rich.js';
import { materials } from './backgrounds.js';

export const limits = Object.freeze({ item: 32_000, notes: 200_000 });

export function newJournal() {
  return { version: 3, items: [], notes: '', notesOpen: false, ...defaultAppearance, hoverOpacity: 70, fadeText: false };
}

function isLabel(text, max) {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= max;
}

function validSettings(value, min, max) {
  return typeof value.notes === 'string' && value.notes.length <= limits.notes &&
    Number.isInteger(value.opacity) && value.opacity >= min && value.opacity <= max;
}

function checkItem(item, ids, allowBlank = false) {
  if (!item || typeof item.text !== 'string' || item.text.length > limits.item || (!allowBlank && !item.text.trim()) || typeof item.done !== 'boolean' ||
      typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id)) {
    throw new Error('Invalid or duplicate checklist item.');
  }
  ids.add(item.id);
}

export function validateJournal(value) {
  if (value?.version !== 3) throw new Error('Unrecognized journal format.');
  if (!Array.isArray(value.items) || !validSettings(value, 0, 100) || typeof value.notesOpen !== 'boolean') {
    throw new Error('Invalid checklist, notes, or opacity.');
  }
  if (typeof value.typeface !== 'string' || !Object.hasOwn(typefaces, value.typeface)) throw new Error('Unrecognized typeface.');
  for (const id of Object.keys(defaultColors)) {
    if (typeof value[id] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[id])) throw new Error(`Invalid appearance color: ${id}.`);
  }
  if (!['off', 'icon', 'compact'].includes(value.autoHide)) throw new Error('Invalid auto-hide preference.');
  if (typeof value.backgroundTexture !== 'string' || !Object.hasOwn(materials, value.backgroundTexture)) throw new Error('Invalid background texture.');
  for (const [id, [min, max]] of Object.entries(appearanceRanges)) {
    if (!Number.isInteger(value[id]) || value[id] < min || value[id] > max) throw new Error(`Invalid appearance setting: ${id}.`);
  }
  const ids = new Set();
  if (!Number.isInteger(value.hoverOpacity) || value.hoverOpacity < value.opacity || value.hoverOpacity > 100 ||
      typeof value.fadeText !== 'boolean') throw new Error('Invalid hover opacity.');
  checkSpans(value.notes, value.noteSpans);
  for (const item of value.items) {
    checkItem(item, ids, true);
    if (!blockTypes.includes(item.kind)) throw new Error('Invalid block type.');
    checkSpans(item.text, item.spans);
  }
  return value;
}

export function loadJournal(value) {
  if (value?.version === 3) return validateJournal({ ...defaultColors, autoHide: 'off', backgroundTexture: 'plain', ...value });
  if (value?.version === 2 && Object.hasOwn(value, 'opacity') && Array.isArray(value.items)) {
    return validateJournal({ ...legacyAppearance, ...value, version: 3, hoverOpacity: Math.max(value.opacity, 70), fadeText: false,
      items: value.items.map(item => ({ ...item, kind: 'todo' })) });
  }
  if (value?.version !== 1) return validateJournal(value);
  if (!Array.isArray(value.quests) || !validSettings(value, 35, 98) || !['dark', 'light', 'system'].includes(value.theme)) {
    throw new Error('Invalid legacy journal.');
  }
  const journal = { ...newJournal(), ...legacyAppearance };
  journal.notes = value.notes;
  journal.notesOpen = Boolean(value.notes);
  if (value.opacity !== 82) journal.opacity = value.opacity;
  journal.hoverOpacity = Math.max(journal.opacity, journal.hoverOpacity);
  const ids = new Set();
  for (const quest of value.quests) {
    if (!quest || !isLabel(quest.title, 100) || typeof quest.folded !== 'boolean' || !Array.isArray(quest.objectives)) {
      throw new Error('Invalid legacy quest.');
    }
    const title = { id: quest.id, text: quest.title, done: false, kind: 'todo' };
    checkItem(title, ids);
    for (const item of quest.objectives) checkItem(item, ids);
    const [first, second] = quest.objectives;
    const untouchedExample = quest.id === 'first-camp' && quest.title === 'Set up camp' &&
      quest.objectives.length === 2 && first.id === 'first-quest' && first.text === 'Add a quest of your own' &&
      second.id === 'first-note' && second.text === 'Write your first field note' && !first.done && !second.done;
    if (untouchedExample) continue;
    title.done = quest.objectives.length > 0 && quest.objectives.every(item => item.done);
    journal.items.push(title);
    for (const item of quest.objectives) journal.items.push({ id: item.id, text: item.text, done: item.done, kind: 'todo' });
  }
  return journal;
}
