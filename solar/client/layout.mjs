// Machine-authored: Codex / OpenAI / gpt-6; claim 260924-104536-001/solar-system-flight-galaxy.
// Viewport custody and a shared controls drawer. No astronomical or preference state.

/** Header cap and a conservative intrinsic timeline size at the default font.
 * Timeline uses one desktop row or three narrow rows and a complete ruler.
 * Very short narrow windows retain playback and move exact clock/rate/span fields into Time options.
 * The clock strip has a bounded height and scrolls horizontally. The ruler retains
 * 10px bottom clearance. Secondary time options live in their own dialog. Actual regions may be shorter.
 * This is a structural size budget, not a claim about native browser rendering. */
export function fitFrame(width, height) {
  if (![width, height].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('Viewport dimensions must be finite and nonnegative.');
  const short = height <= 512, rows = width < 768 ? (height <= 320 ? 1 : 3) : 1;
  const header = Math.min(height * .24, short ? 52 : Infinity), footer = 0;
  const timeline = height === 0 ? 0 : rows * 44 + (rows - 1) * 4 + 28 + (short ? 36 : 60) + 22;
  const workspace = Math.max(0, height - header - timeline - footer);
  return { width, height, compact: width < 1100 || height < 640, header, timeline, footer, workspace, scene: workspace * .8 };
}

/** Bound the sidebar's scrollable box to what is actually visible. The dock
 * stops at the timeline; the modal drawer uses its own body and viewport. */
export function sidebarViewportHeight({ top, bottom, viewportHeight, timelineTop = null }) {
  if (![top, bottom, viewportHeight].every(Number.isFinite) || timelineTop !== null && !Number.isFinite(timelineTop)) return null;
  return Math.max(0, Math.min(bottom, viewportHeight, timelineTop ?? Infinity) - Math.max(0, top));
}

export function mountLayout({ onChange = () => {}, document: doc = globalThis.document, window: win = globalThis.window } = {}) {
  const $ = id => doc.getElementById(id);
  const app = $('app'), panels = $('instrument-panels'), dock = $('side-dock');
  const dialog = $('view-controls-dialog'), body = $('view-controls-body'), opener = $('view-controls-open'), closer = $('view-controls-close');
  const timeDialog = $('time-options-dialog'), timeOpener = $('time-options-open'), timeCloser = $('time-options-close');
  const tools = $('tools-panel');
  const timeCore = doc.querySelector('.time-core'), compactTimeFields = $('compact-time-fields');
  const timeFields = timeCore ? [...timeCore.children].filter(node => node.classList.contains('time-entry') || node.classList.contains('timeline-span-control') || node.localName === 'label') : [];
  const timeFieldHomes = timeFields.map(node => { const marker=doc.createComment('time control home'); timeCore.insertBefore(marker,node); return [node,marker]; });
  if (![app, panels, dock, dialog, body, opener, closer, tools, timeDialog, timeOpener, timeCloser].every(Boolean)) throw new Error('Viewport layout is missing its controls container.');
  let compact = null, destroyed = false, syncing = false, initializing = true, movingTimeControls = false, panelScrollTop = 0, viewportHeight = 0, lastSignature = null;
  const styleValue = (node, key, value) => { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); };
  const datasetValue = (node, key, value) => { if (node.dataset[key] !== value) node.dataset[key] = value; };
  // Browsers can restore native disclosure state on reload. Begin each app
  // mount closed, then retain the user's choices through ordinary sync/reparent.
  for (const section of panels.querySelectorAll('details')) section.removeAttribute('open');
  const cleanups = [];
  const listen = (target, name, handler, options) => {
    target?.addEventListener?.(name, handler, options);
    cleanups.push(() => target?.removeEventListener?.(name, handler, options));
  };
  // Moving a focused editor or opening its modal can emit a native change on
  // blur. Layout must preserve the unfinished edit instead of committing it.
  listen(doc, 'change', event => { if (movingTimeControls && timeFields.some(node => node.contains(event.target))) event.stopImmediatePropagation(); }, true);
  const chromeHidden = () => app.dataset.density === 'zen' && app.dataset.revealed !== 'true';
  const panelHidden = () => chromeHidden() || app.dataset.panelHidden === 'true';
  const hasContent = () => [...tools.children].some(child => !child.hidden) || !$('inspector-column').hidden || !$('mini-map-panel').hidden;
  const focus = element => element?.focus?.({ preventScroll: true });
  const sidebarOpener = () => !opener.hidden && !panelHidden() && app.dataset.topbarHidden !== 'true' ? opener : $('reveal-sidebar') && !$('reveal-sidebar').hidden ? $('reveal-sidebar') : $('scene');
  const announceChange = () => { if (!initializing && !destroyed) onChange(); };
  // Display:none and reparenting can report a zero offset. Keep the last visible
  // scroll position so opening a drawer does not lose a long panel's position.
  const rememberPanelScroll = () => { if (panels.clientHeight > 0) panelScrollTop = panels.scrollTop; };
  const restorePanelScroll = () => { panels.scrollTop = panelScrollTop; };
  const sizePanelViewport = () => {
    const host = panels.parentElement;
    if (host === body && !dialog.open || host === dock && dock.hidden) {
      panels.style.removeProperty('--panel-viewport-height');
      return;
    }
    const rect = host.getBoundingClientRect(), timeline = $('controls'), timelineRect = timeline.getBoundingClientRect();
    const timelineTop = host === dock && !timeline.hidden && !chromeHidden() && app.dataset.timelineHidden !== 'true' && timelineRect.height > 0 ? timelineRect.top : null;
    const height = sidebarViewportHeight({ top: rect.top, bottom: rect.bottom, viewportHeight, timelineTop });
    if (height !== null) styleValue(panels, '--panel-viewport-height', `${height}px`);
  };
  const visibleControl = node => {
    if (node.disabled || node.closest('[hidden]')) return false;
    for (let parent = node.parentElement; parent && parent !== panels; parent = parent.parentElement) {
      if (parent.localName === 'details' && !parent.hasAttribute('open') && !parent.firstElementChild?.contains(node)) return false;
    }
    return true;
  };
  // The sidebar has one disclosure level. Arrow navigation belongs to its
  // summaries only; numeric inputs, selects and scene controls keep their keys.
  function navigateSections(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || panelHidden()) return;
    const target = event.target;
    if (target?.closest?.('input,select,textarea,button,a,[contenteditable="true"]')) return;
    const summary = target?.closest?.('summary'), section = summary?.parentElement;
    if (section?.localName !== 'details' || section.firstElementChild !== summary || !panels.contains(section) || section.parentElement.closest('details') || !visibleControl(summary)) return;
    const summaries = [...panels.querySelectorAll('details > summary')].filter(node => !node.parentElement.parentElement.closest('details') && visibleControl(node));
    const index = summaries.indexOf(summary);
    let next;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      section.toggleAttribute('open', event.key === 'ArrowRight');
      next = summary;
    } else if (event.key === 'ArrowUp') next = summaries[Math.max(0, index - 1)];
    else if (event.key === 'ArrowDown') next = summaries[Math.min(summaries.length - 1, index + 1)];
    else if (event.key === 'Home') next = summaries[0];
    else if (event.key === 'End') next = summaries.at(-1);
    else return;
    event.preventDefault();
    event.stopPropagation();
    focus(next);
    next?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    rememberPanelScroll();
  }

  function closeView({ restoreFocus = true, notify = true } = {}) {
    if (!dialog.open) return;
    rememberPanelScroll();
    dialog.close();
    opener.setAttribute('aria-expanded', 'false');
    if (restoreFocus) focus(sidebarOpener());
    if (notify) announceChange();
  }

  function closeTime({ restoreFocus = true, notify = true } = {}) {
    if (!timeDialog.open) return;
    timeDialog.close();
    timeOpener.setAttribute('aria-expanded', 'false');
    if (restoreFocus) focus(!chromeHidden() && !$('controls').hidden ? timeOpener : $('scene'));
    if (notify) announceChange();
  }

  function close(options = {}) { closeView(options); closeTime(options); }

  function sync({ measure = true } = {}) {
    if (destroyed || syncing) return;
    syncing = true;
    let changed = false;
    try {
      const width = win?.innerWidth || doc.documentElement.clientWidth || 0;
      const height = win?.visualViewport?.height || win?.innerHeight || doc.documentElement.clientHeight || 0;
      const available = hasContent(), hidden = panelHidden();
      const signature = [width,height,app.dataset.density,app.dataset.revealed,app.dataset.panelHidden,app.dataset.topbarHidden,app.dataset.timelineHidden,available,hidden,dialog.open,timeDialog.open,$('controls').hidden].join(':');
      // Playback asks only for state synchronization. ResizeObserver and explicit
      // sync still measure real geometry, including font and panel-size changes.
      if (!measure && signature === lastSignature) return;
      const activeBeforeLayout = doc.activeElement;
      rememberPanelScroll();
      lastSignature = signature;
      const budget = fitFrame(Math.max(0, width), Math.max(0, height));
      viewportHeight = budget.height;
      styleValue(app, '--frame-height', `${budget.height}px`);
      styleValue(app, '--header-cap', `${budget.header}px`);
      styleValue(doc.documentElement, '--frame-height', `${budget.height}px`);
      // Dialogs are top-level elements and inherit the same keyboard/viewport bound.
      styleValue(dialog, '--frame-height', `${budget.height}px`);
      datasetValue(dialog, 'density', app.dataset.density || 'normal');
      datasetValue(dialog, 'revealed', String(app.dataset.revealed === 'true'));
      styleValue(timeDialog, '--frame-height', `${budget.height}px`);
      datasetValue(app, 'layout', budget.compact ? 'drawer' : 'dock');
      datasetValue(app, 'timelineRows', budget.width < 768 ? '2' : '1');
      datasetValue(app, 'frameShort', String(budget.height <= 512));
      datasetValue(app, 'frameTiny', String(budget.height <= 320));
      if (compactTimeFields) {
        movingTimeControls = true;
        const tiny = budget.width < 768 && budget.height <= 320;
        const editingTime = timeFields.some(node => node.contains(activeBeforeLayout));
        const edit = editingTime ? {node:activeBeforeLayout,value:activeBeforeLayout.value,start:activeBeforeLayout.selectionStart,end:activeBeforeLayout.selectionEnd,direction:activeBeforeLayout.selectionDirection} : null;
        // Keep an active edit in its modal through keyboard-height recovery.
        // A deliberate close returns the same nodes to the main timeline.
        const compactTime = tiny || timeDialog.open && editingTime && compactTimeFields.contains(activeBeforeLayout);
        const move = (parent,node,before=null) => { if(typeof parent.moveBefore==='function')parent.moveBefore(node,before);else parent.insertBefore(node,before); };
        for (const [node,marker] of timeFieldHomes) {
          if (compactTime && node.parentElement !== compactTimeFields) move(compactTimeFields,node);
          else if (!compactTime && node.parentElement === compactTimeFields) move(marker.parentNode,node,marker.nextSibling);
        }
        compactTimeFields.hidden = !compactTime;
        if (compactTime && editingTime && !chromeHidden() && !$('controls').hidden) {
          closeView({restoreFocus:false,notify:false});
          if (!timeDialog.open) { timeDialog.showModal(); changed=true; }
          timeOpener.setAttribute('aria-expanded','true');
          focus(activeBeforeLayout);
        }
        if(edit){edit.node.value=edit.value;try{if(edit.start!==null)edit.node.setSelectionRange?.(edit.start,edit.end,edit.direction);}catch{}}
        movingTimeControls = false;
      }
      const active = doc.activeElement, keepFocus = panels.contains(active);
      const closing = (hidden || !budget.compact || !available) && dialog.open;
      if (closing) { closeView({ restoreFocus: false, notify: false }); changed = true; }
      if ((chromeHidden() || $('controls').hidden) && timeDialog.open) { closeTime({ notify: false }); changed = true; }
      dock.hidden = budget.compact || hidden || !available;
      opener.hidden = !budget.compact || hidden || !available;
      const destination = budget.compact ? body : dock;
      if (panels.parentElement !== destination) {
        destination.append(panels);
        if (!budget.compact || dialog.open) restorePanelScroll();
        if (keepFocus) focus(!budget.compact && !hidden ? active : dialog.open ? active : hidden ? $('scene') : sidebarOpener());
        else if (closing) focus($('scene'));
        changed = true;
      } else if (closing) focus($('scene'));
      else if (hidden && keepFocus) focus(!chromeHidden() && app.dataset.topbarHidden !== 'true' ? $('quiet') : $('scene'));
      if (compact !== budget.compact) { compact = budget.compact; changed = true; }
      opener.setAttribute('aria-expanded', String(dialog.open));
      tools.hidden = ![...tools.children].some(child => !child.hidden);
      sizePanelViewport();
    } finally { syncing = false; movingTimeControls = false; }
    if (changed) announceChange();
  }

  function open() {
    sync();
    if (destroyed || panelHidden() || !hasContent()) return;
    closeTime({ restoreFocus: false, notify: false });
    if (!compact) {
      const first = [...panels.querySelectorAll('summary,button,select,input,textarea')].find(visibleControl);
      focus(first || panels);
      return;
    }
    if (!dialog.open) dialog.showModal();
    sizePanelViewport();
    restorePanelScroll();
    opener.setAttribute('aria-expanded', 'true');
    focus(closer);
    announceChange();
  }

  function openTime() {
    sync();
    if (destroyed || chromeHidden() || $('controls').hidden) return;
    closeView({ restoreFocus: false, notify: false });
    if (!timeDialog.open) timeDialog.showModal();
    timeOpener.setAttribute('aria-expanded', 'true');
    focus(timeCloser);
    announceChange();
  }

  listen(opener, 'click', open);
  listen(panels, 'scroll', rememberPanelScroll, { passive: true });
  listen(panels, 'keydown', navigateSections);
  listen(closer, 'click', () => closeView());
  listen(timeOpener, 'click', openTime);
  listen(timeCloser, 'click', () => closeTime());
  for (const [modal, dismiss] of [[dialog, closeView], [timeDialog, closeTime]]) {
    listen(modal, 'cancel', event => { event.preventDefault(); dismiss(); });
    let backdropPointer = null;
    const outside = event => {
      const rect = modal.getBoundingClientRect();
      return event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    listen(modal, 'pointerdown', event => { backdropPointer = event.button === 0 && outside(event) ? event.pointerId : null; });
    listen(modal, 'pointerup', event => { if (event.pointerId === backdropPointer && outside(event)) dismiss(); backdropPointer = null; });
    listen(modal, 'pointercancel', () => { backdropPointer = null; });
  }
  listen(win, 'resize', sync);
  listen(win?.visualViewport, 'resize', sync);
  const Observer = win?.ResizeObserver || globalThis.ResizeObserver;
  const observer = typeof Observer === 'function' ? new Observer(sync) : null;
  observer?.observe(app);
  // Region changes can move the timeline without changing the app's total box.
  for (const region of [dock, body, $('controls'), doc.querySelector('.topbar')]) if (region) observer?.observe(region);
  listen(win, 'pagehide', event => { if (!event.persisted) destroy(); });
  sync(); initializing = false;
  function destroy() {
    if (destroyed) return;
    close({ restoreFocus: false, notify: false });
    destroyed = true;
    observer?.disconnect();
    cleanups.forEach(dispose => dispose());
  }
  return { sync, open, openTime, close, destroy, get openState() { return dialog.open || timeDialog.open; }, get compact() { return compact; } };
}
