function makePreview(row, width) {
  const preview = document.createElement('div');
  preview.className = 'line drag-preview';
  preview.dataset.kind = row.dataset.kind;
  preview.inert = true;
  preview.setAttribute('aria-hidden', 'true');
  preview.popover = 'manual';
  preview.style.width = `${width}px`;

  const handle = document.createElement('span');
  handle.className = 'block-handle';
  handle.append(row.querySelector('.block-handle svg').cloneNode(true));
  preview.append(handle);
  if (row.dataset.kind === 'todo') {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.append(row.querySelector('.tick svg').cloneNode(true));
    preview.classList.toggle('checked', row.querySelector('.tick input').checked);
    preview.append(tick);
  } else if (!row.querySelector('.list-marker').hidden) {
    preview.append(row.querySelector('.list-marker').cloneNode(true));
  }
  const words = row.querySelector('.words').cloneNode(true);
  words.removeAttribute('id'); words.removeAttribute('contenteditable'); words.removeAttribute('role');
  preview.append(words);
  // The top layer uses viewport coordinates even when the real row scrolls inside the filtered panel.
  row.closest('#panel').append(preview);
  preview.showPopover();
  return preview;
}

export function enableBlockDrag(list, scroller, locked, commit) {
  let drag, marker, frame, suppressClick = false;
  function cleanup() {
    cancelAnimationFrame(frame);
    marker?.classList.remove('drop-before', 'drop-after');
    marker = null;
    if (!drag) return;
    const { handle, id, row, preview } = drag;
    drag = null;
    if (preview) { suppressClick = true; preview.remove(); row.classList.remove('dragging'); }
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
  }
  function inside(r) {
    return drag.x >= r.left && drag.x <= r.right && drag.y >= r.top && drag.y <= r.bottom;
  }
  function target(bounds) {
    if (!inside(bounds)) {
      marker?.classList.remove('drop-before', 'drop-after'); marker = null;
      return null;
    }
    const rows = [...list.children].filter(row => row !== drag.row && !row.classList.contains('empty'));
    const next = rows.find(row => {
      const r = row.getBoundingClientRect();
      return drag.y < r.top + r.height / 2;
    });
    const hit = next ?? rows.at(-1), edge = next ? 'drop-before' : 'drop-after';
    if (hit !== marker || !marker?.classList.contains(edge)) {
      marker?.classList.remove('drop-before', 'drop-after'); marker = hit;
      marker?.classList.add(edge);
    }
    return next ?? null;
  }
  function scroll() {
    if (!drag?.preview || locked()) { cleanup(); return; }
    const r = scroller.getBoundingClientRect();
    const dy = drag.y < r.top + 16 ? -5 : drag.y > r.bottom - 16 ? 5 : 0;
    if (dy && inside(r)) {
      const start = scroller.scrollTop;
      scroller.scrollTop += dy;
      if (start !== scroller.scrollTop) target(r);
    }
    frame = requestAnimationFrame(scroll);
  }
  list.addEventListener('pointerdown', e => {
    if (drag || !e.isPrimary || e.button !== 0 || locked()) return;
    suppressClick = false;
    const handle = e.target.closest('.block-handle'), row = handle?.closest('.line');
    if (!row) return;
    e.preventDefault(); // A press on the grip should not blur the editor or move its caret.
    if (row.classList.contains('empty')) return;
    const rect = row.getBoundingClientRect();
    drag = { row, handle, id: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, width: rect.width, preview: null };
    handle.setPointerCapture(e.pointerId);
  });
  list.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId || locked()) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.preview) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
      drag.preview = makePreview(drag.row, drag.width);
      drag.row.classList.add('dragging');
      frame = requestAnimationFrame(scroll);
    }
    drag.preview.style.transform = `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0)`;
    target(scroller.getBoundingClientRect());
  });
  list.addEventListener('pointerup', e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.preview && !locked()) {
      drag.x = e.clientX; drag.y = e.clientY;
      const row = drag.row, bounds = scroller.getBoundingClientRect(), accept = inside(bounds), before = target(bounds);
      cleanup();
      if (accept) commit(row, before);
    } else cleanup();
  });
  const cancelPointer = e => { if (drag?.id === e.pointerId) cleanup(); };
  list.addEventListener('lostpointercapture', cancelPointer);
  list.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', cleanup);
  window.addEventListener('pagehide', cleanup);
  list.addEventListener('click', e => {
    if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopPropagation(); }
  }, true);
  return cleanup;
}
