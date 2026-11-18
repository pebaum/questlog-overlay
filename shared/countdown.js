import { clockLabel } from './local-time.js';

const maxSeconds = 24 * 60 * 60;
const validDuration = s => Number.isInteger(s) && s > 0 && s <= maxSeconds;
const validTarget = m => Number.isInteger(m) && m >= 0 && m < 1440;
const ready = (duration = 25 * 60, targetMinute) => ({
  version: 2, duration, status: 'ready', ...(targetMinute !== undefined && { targetMinute })
});

export function parseDuration(text) {
  if (typeof text !== 'string') return null;
  const match = /^(\d{1,4})(?::([0-5]\d))?$/.exec(text.trim());
  const seconds = match && Number(match[1]) * 60 + Number(match[2] ?? 0);
  return validDuration(seconds) ? seconds : null;
}

export function parseTimerEntry(text) {
  const duration = parseDuration(text);
  if (duration !== null) return { duration };
  if (typeof text !== 'string') return null;
  const m = /^(\d{1,2})(?:[:.]?([0-5]\d))?\s*([ap])m?$/i.exec(text.trim());
  if (!m || +m[1] < 1 || +m[1] > 12) return null;
  return { targetMinute: ((+m[1] % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m[2] ?? 0) };
}

// Walk real minute boundaries so a repeated local time can match twice, and a skipped one never matches.
function nextClockTime(minute, from) {
  const candidate = new Date(from - (from % 60_000) + 60_000);
  for (let i = 0; i < 3 * 1440; i++) {
    if (candidate.getHours() * 60 + candidate.getMinutes() === minute) return candidate.getTime();
    candidate.setTime(candidate.getTime() + 60_000);
  }
  throw new Error('Could not resolve the next occurrence of that local time.');
}

export function timeLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function entryLabel(state) {
  return state.targetMinute === undefined ? timeLabel(state.duration) :
    clockLabel(Math.floor(state.targetMinute / 60), state.targetMinute % 60);
}

export function remainingMs(state, now = Date.now()) {
  if (state.status === 'running') return Math.max(0, Math.min(state.duration * 1000, state.endAt - now));
  return state.status === 'done' ? 0 : state.duration * 1000;
}

function restore(s) {
  if (s === undefined) return ready();
  const clockTarget = s?.version === 2 && validTarget(s.targetMinute);
  const validLength = clockTarget ? Number.isInteger(s.duration) && s.duration > 0 && s.duration <= 3 * maxSeconds : validDuration(s?.duration);
  if (validLength && (s.targetMinute === undefined || clockTarget) && (s.version === 2 || (s.version === 1 && typeof s.open === 'boolean'))) {
    const base = ready(s.duration, s.targetMinute);
    if (s.status === 'ready' || s.status === 'done') return { ...base, status: s.status };
    if (s.status === 'running' && Number.isSafeInteger(s.endAt) && s.endAt > 0) return { ...base, status: 'running', endAt: s.endAt };
    // A formerly paused timer must not start on its own after upgrading.
    if (s.version === 1 && s.status === 'paused' && Number.isInteger(s.leftMs) && s.leftMs > 0 && s.leftMs <= s.duration * 1000)
      return ready(Math.ceil(s.leftMs / 1000));
  }
  throw new Error('Unrecognized saved timer.');
}

// Only transitions are written. The deadline, not the number of repaint ticks, owns elapsed time.
export function countdown({ initial, persist, changed, ring, onError, now = Date.now }) {
  let state = restore(initial), timeout;
  function arm() {
    clearTimeout(timeout);
    if (state.status === 'running') timeout = setTimeout(check, Math.min(30_000, remainingMs(state, now())));
  }
  function check() {
    if (state.status === 'running' && now() >= state.endAt) {
      state = { ...ready(state.duration, state.targetMinute), status: 'done' };
      try { persist(state); } catch (e) { onError(e); }
      changed(state);
      ring();
    }
    arm();
  }
  function start(input) {
    const entry = validDuration(input) ? { duration: input } : parseTimerEntry(input);
    if (!entry) throw new Error('Enter minutes, mm:ss, or a local time such as 11a or 1234p.');
    const from = now();
    const endAt = entry.targetMinute === undefined ? from + entry.duration * 1000 : nextClockTime(entry.targetMinute, from);
    check();
    const next = { ...ready(Math.ceil((endAt - from) / 1000), entry.targetMinute), status: 'running', endAt };
    persist(next); state = next; changed(state); arm();
  }
  function stop() {
    if (state.status !== 'running') return;
    const next = ready(state.duration, state.targetMinute);
    persist(next); state = next; changed(state); arm();
  }
  arm();
  return { get state() { return state; }, start, stop, check, dispose: () => clearTimeout(timeout) };
}
