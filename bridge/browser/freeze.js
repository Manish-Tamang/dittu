// Stops the page's JS clock so carousels, rAF loops and timers hold still,
// and parks videos on their first frame. Used on both original and clone
// before taking comparison screenshots.
(() => {
  if (window.__dittuFrozen) return;
  window.__dittuFrozen = true;
  const noop = () => 0;
  window.setTimeout = noop;
  window.setInterval = noop;
  window.requestAnimationFrame = noop;
  window.requestIdleCallback = noop;
  for (const v of document.querySelectorAll('video')) {
    if (!v.paused || v.autoplay) v.setAttribute('data-dittu-playing', '');
    try {
      v.pause();
      v.currentTime = 0;
    } catch {}
  }
})();
