// Manual minimize stays pinned. Pointer-driven hiding is temporary and never changes journal contents or saved window size.
export function bindVisibility(panel, native, preference, fit, initiallyHot, closeSettings) {
  const fold = panel.querySelector('#fold'), icon = panel.querySelector('#reveal-icon'), settings = panel.querySelector('#settings');
  let manual = false, auto = 'off', timer, held = false, dragging = false;
  let hot = native ? initiallyHot : panel.matches(':hover');
  function render() {
    const compact = manual || auto === 'compact';
    if ((compact || auto === 'icon') && !native && !panel.classList.contains('placed')) {
      const { left, top } = panel.getBoundingClientRect();
      panel.style.left = `${left}px`; panel.style.top = `${top}px`; panel.classList.add('placed');
    }
    panel.classList.toggle('folded', compact);
    panel.classList.toggle('icon-only', auto === 'icon');
    icon.hidden = auto !== 'icon';
    fold.title = compact ? 'Restore overlay' : 'Minimize to header and timer';
    fold.setAttribute('aria-label', fold.title); fold.setAttribute('aria-expanded', String(!compact));
    fold.querySelector('path').setAttribute('d', compact ? 'M5 5h14v14H5z' : 'M5 12h14');
    fit();
  }
  function eligible() {
    return !hot && !held && !manual && !dragging && settings.hidden && preference() !== 'off' &&
      !(document.hasFocus() && document.activeElement !== icon && panel.contains(document.activeElement) &&
        document.activeElement.matches('.rich, #timer-time, :focus-visible'));
  }
  function refresh() {
    clearTimeout(timer);
    if (!eligible()) {
      if (auto !== 'off') { auto = 'off'; render(); }
      return;
    }
    timer = setTimeout(() => {
      if (eligible() && auto !== preference()) { auto = preference(); render(); }
    }, 550);
  }
  function reveal() {
    clearTimeout(timer); manual = false; auto = 'off'; held = !hot;
    render(); refresh();
  }
  function hover(inside) {
    hot = inside; held = false; panel.classList.toggle('hot', inside); refresh();
  }
  icon.onclick = () => { reveal(); fold.focus({ preventScroll: true }); };
  fold.onclick = () => {
    if (document.documentElement.classList.contains('locked')) return;
    if (manual || auto === 'compact') { reveal(); return; }
    closeSettings(); manual = true; auto = 'off'; render(); refresh();
  };
  if (native) { native.onHover(hover); native.onReveal(reveal); }
  else {
    panel.addEventListener('pointerenter', () => hover(true));
    panel.addEventListener('pointerleave', () => hover(false));
  }
  panel.addEventListener('pointerdown', () => { dragging = true; refresh(); });
  const release = () => { dragging = false; refresh(); };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', () => { held = false; release(); });
  panel.addEventListener('focusin', refresh);
  panel.addEventListener('focusout', () => queueMicrotask(refresh));
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', refresh);
  refresh();
  return { reveal, refresh };
}
