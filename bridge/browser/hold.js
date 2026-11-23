// Injected before any site script runs, in every context dittu screenshots.
// Full-page screenshots resize the viewport, which fires ResizeObserver
// callbacks even after freeze.js stopped the page's clock: sites redraw
// canvases or reflow widgets mid-screenshot. Observers created by the page are
// wrapped so their callbacks stop once the page is frozen.
(() => {
  const Native = window.ResizeObserver;
  if (!Native) return;
  window.ResizeObserver = class ResizeObserver extends Native {
    constructor(callback) {
      super((entries, observer) => {
        if (!window.__dittuFrozen) callback.call(observer, entries, observer);
      });
    }
  };
})();
