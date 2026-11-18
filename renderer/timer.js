import { countdown, entryLabel, parseTimerEntry, remainingMs, timeLabel } from '../shared/countdown.js';

const $ = id => document.getElementById(id);
const previewKey = 'questlog.preview.timer.v1';

export function initTimer(native, locked, report) {
  const form = $('countdown'), input = $('timer-time'), start = $('timer-start'), bar = $('timer-progress');
  const cells = $('timer-cells');
  const glyph = $('timer-glyph'), playPath = glyph.getAttribute('d');
  let state, local, audio, tick, draft = null, pending = false;
  let lit = -1;
  function paintCells() {
    const count = cells.childElementCount, next = Math.floor(count * bar.position);
    if (lit === next) return;
    for (let i = 0; i < count; i++) {
      const cell = cells.children[i], filled = i < next;
      cell.textContent = filled ? '\u2588' : '\u2591';
      cell.classList.toggle('lit', filled);
    }
    lit = next;
  }
  new ResizeObserver(([entry]) => {
    const pitch = parseFloat(getComputedStyle(cells).gridAutoColumns);
    const count = Math.max(1, Math.ceil(entry.contentRect.width / pitch));
    if (count === cells.childElementCount) return;
    cells.replaceChildren(...Array.from({ length: count }, () => document.createElement('span')));
    lit = -1; paintCells();
  }).observe(cells);
  function paintTime() {
    if (!state) return;
    const remaining = remainingMs(state) / 1000, left = Math.ceil(remaining);
    const running = state.status === 'running';
    if (draft === null) input.value = running ? timeLabel(left) : entryLabel(state);
    bar.max = state.duration; bar.value = state.duration - remaining;
    bar.setAttribute('aria-valuetext', running ? `${timeLabel(left)} remaining` : state.status === 'done' ? 'Complete' : 'Ready');
    paintCells();
    input.readOnly = pending || locked();
    start.disabled = pending || locked();
  }
  function render(next) {
    const previous = state;
    state = next; clearInterval(tick);
    form.dataset.status = state.status;
    const running = state.status === 'running';
    start.type = running ? 'button' : 'submit';
    start.setAttribute('aria-label', running ? 'Stop timer' : 'Start timer');
    start.title = running ? 'Stop timer' : 'Start timer (Enter)';
    glyph.setAttribute('d', running ? 'M3 3h10v10H3z' : playPath);
    paintTime();
    if (state.status === 'running') tick = setInterval(paintTime, 250);
    if (state.status === 'done' && previous?.status === 'running') $('timer-announcement').textContent = 'Your timer is complete.';
    else if (state.status === 'ready' && previous?.status === 'running') $('timer-announcement').textContent = 'Timer stopped.';
    else if (state.status !== 'done') $('timer-announcement').textContent = '';
  }
  function primeAudio() {
    if (native || !window.AudioContext) return;
    try {
      audio ??= new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(e => report(`Timer sound unavailable: ${e.message}`));
    } catch (e) { report(`Timer sound unavailable: ${e.message}`); }
  }
  function chime() {
    if (audio?.state !== 'running') return; // Background or reloaded browsers may disallow audio.
    const tone = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, t); gain.gain.exponentialRampToValueAtTime(.12, t + .012);
    gain.gain.exponentialRampToValueAtTime(.001, t + .45);
    tone.connect(gain); gain.connect(audio.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(t); tone.stop(t + .46);
  }
  function discardDraft() {
    draft = null; input.setCustomValidity(''); paintTime();
  }
  input.onfocus = () => {
    if (input.readOnly) return;
    draft = input.value; input.select(); paintTime();
  };
  input.oninput = () => { draft = input.value; input.setCustomValidity(''); paintTime(); };
  form.onfocusout = e => {
    if (!pending && state?.status === 'running' && !form.contains(e.relatedTarget)) discardDraft();
  };
  form.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); discardDraft(); document.activeElement?.blur(); }
  };
  async function act(stopping) {
    if (locked() || pending || !state) return;
    if (!stopping && state.status === 'running' && draft === null) return;
    const entry = input.value.trim();
    if (!stopping && !parseTimerEntry(entry)) {
      input.setCustomValidity('Enter minutes, mm:ss (0:01 to 1440:00), or a local time such as 11a or 1234p.'); input.reportValidity(); return;
    }
    pending = true; paintTime();
    try {
      if (stopping) {
        if (native) await native.stopTimer(); else local.stop();
      } else {
        primeAudio();
        if (native) await native.startTimer(entry); else local.start(entry);
      }
      discardDraft(); input.blur();
    } catch (err) { report(`Timer: ${err.message}`); }
    finally { pending = false; paintTime(); }
  }
  start.onclick = e => {
    if (start.type === 'button') { e.preventDefault(); act(true); }
  };
  form.onsubmit = e => { e.preventDefault(); act(false); };
  if (native) native.watchTimer(({ state, error }) => { if (state) render(state); if (error) report(error); });
  else {
    try {
      const raw = localStorage.getItem(previewKey);
      local = countdown({ initial: raw === null ? undefined : JSON.parse(raw),
        persist: s => localStorage.setItem(previewKey, JSON.stringify(s)), changed: render, ring: chime,
        onError: e => report(`Timer not saved: ${e.message}`) });
      render(local.state);
    } catch (e) { report(`Cannot open the preview timer: ${e.message}`); }
  }
  window.addEventListener('pagehide', () => { clearInterval(tick); local?.dispose(); });
  window.addEventListener('pageshow', e => { if (e.persisted && local) { local.check(); render(local.state); } });
  return () => { if (locked()) discardDraft(); else paintTime(); };
}
