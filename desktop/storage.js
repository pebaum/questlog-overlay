import { constants, copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadJournal, newJournal } from '../shared/journal.js';

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flush: true });
  renameSync(temp, file);
}

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export function openJournal(file) {
  const existing = readJson(file);
  const journal = existing === undefined ? newJournal() : loadJournal(existing);
  if (existing?.version === journal.version) return journal;
  if (existing !== undefined) {
    try { copyFileSync(file, `${file}.v${existing.version}.bak`, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  writeJson(file, journal);
  return journal;
}
