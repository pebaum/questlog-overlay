export function setupGeometry(panel, native, fixed, locked, report) {
  const grip = document.getElementById('move'), corner = document.getElementById('resize');
  const key = 'questlog.preview.size';
  let grab, resize;
  const place = (x, y) => {
    panel.classList.add('placed');
    panel.style.left = `${Math.max(0, Math.min(x, innerWidth - panel.offsetWidth))}px`;
    panel.style.top = `${Math.max(0, Math.min(y, innerHeight - panel.offsetHeight))}px`;
  };
  function setSize(w, h) {
    panel.classList.add('manual');
    if (native) { native.size(w, h); return; }
    const r = panel.getBoundingClientRect();
    panel.style.width = `${Math.min(innerWidth, Math.max(240, w))}px`;
    panel.style.height = `${Math.min(innerHeight, Math.max(110, h))}px`;
    place(r.left, r.top);
  }
  function storeSize() {
    if (!native) {
      try { localStorage.setItem(key, JSON.stringify([panel.offsetWidth, panel.offsetHeight])); }
      catch (e) { report(`Window size was not saved: ${e.message}`); }
    }
  }
  function reset() {
    panel.classList.remove('manual');
    panel.style.removeProperty('width'); panel.style.removeProperty('height');
    if (native) native.autoSize();
    else {
      try { localStorage.removeItem(key); } catch (e) { report(`Window size was not saved: ${e.message}`); }
      if (panel.classList.contains('placed')) place(panel.offsetLeft, panel.offsetTop);
    }
  }
  if (native) panel.classList.toggle('manual', fixed);
  else {
    try {
      const size = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (Array.isArray(size) && size.length === 2 && size.every(n => Number.isFinite(n) && n > 0)) setSize(...size);
    } catch (e) { report(`Cannot restore preview size: ${e.message}`); }
    const keep = () => { if (panel.classList.contains('placed')) place(panel.offsetLeft, panel.offsetTop); };
    window.addEventListener('resize', keep);
    new ResizeObserver(keep).observe(panel);
  }
  let moved = false;
  grip.onpointerdown = e => {
    if (locked() || !e.isPrimary || e.button !== 0 || e.target.closest('button')) return;
    moved = false;
    const r = panel.getBoundingClientRect();
    grab = { screenX: e.screenX, screenY: e.screenY, x: e.clientX - r.left, y: e.clientY - r.top };
    grip.setPointerCapture(e.pointerId);
  };
  grip.onpointermove = e => {
    if (!grab || locked() || !(e.buttons & 1) || !grip.hasPointerCapture(e.pointerId)) return;
    if (!moved && Math.hypot(e.screenX - grab.screenX, e.screenY - grab.screenY) < 4) return;
    moved = true;
    if (native) native.dragTitle(grab.x, grab.y);
    else place(e.clientX - grab.x, e.clientY - grab.y);
  };
  grip.onlostpointercapture = () => { grab = null; };
  grip.addEventListener('dblclick', e => { if (moved && !e.target.closest('button')) e.stopImmediatePropagation(); }, true);
  corner.onpointerdown = e => {
    if (locked() || !e.isPrimary || e.button !== 0) return;
    const r = panel.getBoundingClientRect();
    if (!native) place(r.left, r.top);
    resize = { x: e.screenX, y: e.screenY, w: r.width, h: r.height };
    corner.setPointerCapture(e.pointerId); e.preventDefault();
  };
  corner.onpointermove = e => {
    if (resize && !locked() && corner.hasPointerCapture(e.pointerId))
      setSize(resize.w + e.screenX - resize.x, resize.h + e.screenY - resize.y);
  };
  corner.onlostpointercapture = () => { if (resize && panel.classList.contains('manual')) storeSize(); resize = null; };
  corner.onkeydown = e => {
    const delta = { ArrowRight: [16, 0], ArrowLeft: [-16, 0], ArrowDown: [0, 16], ArrowUp: [0, -16] }[e.key];
    if (locked() || !delta) return;
    e.preventDefault(); setSize(panel.offsetWidth + delta[0], panel.offsetHeight + delta[1]); storeSize();
  };
  return reset;
}
