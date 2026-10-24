// Injected before any site script runs (page.addInitScript).
// Records which elements the site animates so dittu can replay reveals later:
//   - style/class attribute mutations (first old value, count, timing)
//   - Element.prototype.animate calls (Framer Motion, Motion One, GSAP WAAPI)
(() => {
  if (window.top !== window || window.__dittu) return;

  const t0 = performance.now();
  const rec = new Map();
  const anims = [];
  const MAX_ELEMENTS = 20000;
  const MAX_ANIMS = 5000;

  const mo = new MutationObserver((list) => {
    const now = performance.now() - t0;
    for (const m of list) {
      const el = m.target;
      let r = rec.get(el);
      if (!r) {
        if (rec.size >= MAX_ELEMENTS) continue;
        r = { s0: undefined, c0: undefined, n: 0, first: now, last: now };
        rec.set(el, r);
      }
      if (m.attributeName === 'style' && r.s0 === undefined) r.s0 = m.oldValue ?? '';
      if (m.attributeName === 'class' && r.c0 === undefined) r.c0 = m.oldValue ?? '';
      r.n++;
      r.last = now;
    }
  });

  // Observe the document node itself: it exists before <html> is parsed, so
  // nothing the site does on a cold load is missed.
  mo.observe(document, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['style', 'class'],
  });

  const plain = (o) => {
    if (typeof o === 'number') return { duration: o };
    const out = {};
    if (o && typeof o === 'object') {
      for (const k of [
        'duration',
        'delay',
        'endDelay',
        'easing',
        'iterations',
        'direction',
        'fill',
        'iterationStart',
      ]) {
        const v = o[k];
        if (typeof v === 'number' || typeof v === 'string') out[k] = v;
      }
    }
    return out;
  };

  const plainKeyframes = (kf) => {
    try {
      return JSON.parse(JSON.stringify(kf, (_k, v) => (typeof v === 'number' && !isFinite(v) ? null : v)));
    } catch {
      return null;
    }
  };

  const origAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    try {
      if (anims.length < MAX_ANIMS) {
        anims.push({
          el: this,
          keyframes: plainKeyframes(keyframes),
          options: plain(options),
          infinite: typeof options === 'object' && options && options.iterations === Infinity,
          t: performance.now() - t0,
        });
      }
    } catch {}
    return origAnimate.apply(this, arguments);
  };

  window.__dittu = { rec, anims, t0, mo };
})();
