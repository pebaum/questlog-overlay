// Manual minimize stays pinned. Pointer-driven hiding is temporary and never changes journal contents or saved window size.
export function bindVisibility(panel, native, preference, fit, initiallyHot, closeSettings) {
  const fold = panel.querySelector('#fold'), icon = panel.querySelector('#reveal-icon'), settings = panel.querySelector('#settings');
  const writing = panel.querySelector('#writing'), header = panel.querySelector('#move'), countdown = panel.querySelector('#countdown');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let manual = false, auto = 'off', timer, held = false, dragging = false;
  let motion;
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
  function cancelMotion() {
    if (!motion) return;
    for (const animation of motion.animations) animation.cancel();
    motion = null;
  }
  function transitionTo(next) {
    if (next === (motion?.target ?? auto)) return;
    const kind = next === 'off' ? (motion?.kind ?? auto) : next;
    if (reduced.matches || manual) {
      cancelMotion(); auto = next; render(); return;
    }
    if (motion && motion.kind !== kind) cancelMotion();
    if (!motion) {
      // Grow the native hit area once, then animate only the visible surface. Shrink it after the exit.
      if (auto !== 'off') { auto = 'off'; render(); }
      const topHeight = Math.ceil(countdown.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + 4);
      const collapsed = kind === 'icon' ? 'inset(0 max(0px, 100% - 40px) max(0px, 100% - 40px) 0 round 6px)'
        : `inset(0 0 max(0px, 100% - ${topHeight}px) 0 round 6px)`;
      const timing = { duration: 420, easing: 'cubic-bezier(.34, 0, .22, 1)', fill: 'both' };
      const animations = [
        panel.animate([{ clipPath: collapsed }, { clipPath: 'inset(0 0 0 0 round 6px)' }], timing),
        writing.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }], timing)
      ];
      if (kind === 'icon') animations.push(header.animate([{ opacity: 0 }, { opacity: 1 }], timing));
      for (const a of animations) a.currentTime = next === 'off' ? 0 : timing.duration;
      motion = { kind, animations };
    }
    const run = motion;
    run.target = next;
    for (const a of run.animations) {
      a.playbackRate = next === 'off' ? 1 : -1;
      a.play();
    }
    run.animations[0].onfinish = () => {
      if (motion !== run || run.target !== next) return;
      auto = next; render(); cancelMotion();
    };
  }
  function eligible() {
    return !document.documentElement.classList.contains('locked') && !hot && !held && !manual && !dragging && settings.hidden && preference() !== 'off' &&
      !(document.hasFocus() && document.activeElement !== icon && panel.contains(document.activeElement) &&
        document.activeElement.matches('.rich, #timer-time, :focus-visible'));
  }
  function refresh() {
    clearTimeout(timer);
    if (!eligible()) {
      transitionTo('off');
      return;
    }
    timer = setTimeout(() => {
      if (eligible()) transitionTo(preference());
    }, 650);
  }
  function reveal() {
    clearTimeout(timer); cancelMotion(); manual = false; auto = 'off'; held = !hot;
    render(); refresh();
  }
  function hover(inside) {
    hot = inside; held = false; panel.classList.toggle('hot', inside); refresh();
  }
  icon.onclick = () => { reveal(); fold.focus({ preventScroll: true }); };
  function toggleCompact() {
    if (document.documentElement.classList.contains('locked')) return;
    if (manual || auto === 'compact') { reveal(); return; }
    closeSettings(); cancelMotion(); manual = true; auto = 'off'; render(); refresh();
  }
  fold.onclick = toggleCompact;
  header.addEventListener('dblclick', e => {
    if (e.button === 0 && !e.target.closest('button')) toggleCompact();
  });
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
  reduced.addEventListener('change', () => {
    if (motion && reduced.matches) { auto = motion.target; cancelMotion(); render(); }
  });
  window.addEventListener('pagehide', () => { clearTimeout(timer); cancelMotion(); });
  window.addEventListener('pageshow', refresh);
  refresh();
  return { reveal, refresh, syncLock() {
    clearTimeout(timer); cancelMotion(); auto = 'off'; render(); refresh();
  } };
}
