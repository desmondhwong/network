// Codex/OpenAI: touch and keyboard activation of the existing flight operations.
export function mountTouchFlight({ document: doc = globalThis.document, window: win = globalThis.window, begin, end, step, action, fine = () => false } = {}) {
  const root = doc.getElementById('touch-flight-controls'), held = new Map(), cleanups = [];
  if (!root) return { release() {}, destroy() {} };
  const keyOf = button => button.dataset.flightKey.replace(/^Key/, '').toLowerCase();
  const listen = (node, type, handler) => { node?.addEventListener(type, handler); cleanups.push(() => node?.removeEventListener(type, handler)); };
  function release(id) {
    for (const [pointer, button] of [...held]) {
      if (id !== undefined && pointer !== id) continue;
      held.delete(pointer);
      if (![...held.values()].some(other => keyOf(other) === keyOf(button))) end(keyOf(button));
      button.setAttribute('aria-pressed', String([...held.values()].includes(button)));
      // Release the native capture too when a hidden/closed control cancels a
      // hold. Its synchronous lost-capture event sees the already-cleared map.
      try { if (button.hasPointerCapture?.(pointer) ?? true) button.releasePointerCapture?.(pointer); } catch {}
    }
  }
  for (const button of root.querySelectorAll('[data-flight-key]')) {
    button.setAttribute('aria-pressed', 'false');
    listen(button, 'pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      release(event.pointerId);
      button.focus({ preventScroll: true });
      held.set(event.pointerId, button);
      button.setAttribute('aria-pressed', 'true');
      button.setPointerCapture?.(event.pointerId);
      begin(keyOf(button), fine());
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, type, event => release(event.pointerId));
    // Native keyboard and assistive activation take one precise short step.
    listen(button, 'click', event => { if (event.detail === 0) step(keyOf(button), fine()); });
  }
  for (const button of root.querySelectorAll('[data-flight-action]')) listen(button, 'click', () => action(button.dataset.flightAction));
  listen(doc.getElementById('touch-flight-fine'), 'change', () => { for (const key of new Set([...held.values()].map(keyOf))) begin(key, fine()); });
  listen(win, 'blur', () => release());
  listen(win, 'pagehide', () => release());
  listen(doc, 'visibilitychange', () => { if (doc.hidden) release(); });
  listen(doc.getElementById('view-controls-dialog'), 'close', () => release());
  const section = root.closest('details');
  listen(section, 'toggle', () => { if (!section.open) release(); });
  return { release, destroy() { release(); cleanups.forEach(dispose => dispose()); } };
}
