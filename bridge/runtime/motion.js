// dittu motion runtime: replays the scroll reveals and WAAPI loops recorded
// from the original site. Markup ships in its final (revealed) state, so the
// page is complete without JS; this script rewinds elements and plays them
// as they scroll into view. Data: <script type="application/json" id="dittu-motion">.
(function () {
  var d = document;
  var data = d.getElementById('dittu-motion');
  var items = [];
  try {
    items = JSON.parse((data && data.textContent) || '[]');
  } catch {}

  // React does not render the `muted` attribute, so autoplay needs a nudge.
  var vids = d.querySelectorAll('video[autoplay]');
  for (var v = 0; v < vids.length; v++) {
    vids[v].muted = true;
    var p = vids[v].play && vids[v].play();
    if (p && p.catch) p.catch(function () {});
  }

  // Classes the site's JS sets differently at mobile width.
  function responsive(m) {
    var el = d.querySelector('[data-dittu-r="' + m.id + '"]');
    if (!el || !window.matchMedia) return;
    var mql = matchMedia(m.mq);
    var apply = function () {
      var on = mql.matches;
      m.add.forEach(function (c) {
        el.classList.toggle(c, on);
      });
      m.remove.forEach(function (c) {
        el.classList.toggle(c, !on);
      });
    };
    apply();
    if (mql.addEventListener) mql.addEventListener('change', apply);
  }
  items
    .filter(function (m) {
      return m.type === 'resp';
    })
    .forEach(responsive);
  items = items.filter(function (m) {
    return m.type !== 'resp';
  });

  if (!items.length || !Element.prototype.animate) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var camel = function (k) {
    return k.replace(/-([a-z])/g, function (_, c) {
      return c.toUpperCase();
    });
  };
  var frame = function (o) {
    var f = {};
    for (var k in o) f[camel(k)] = o[k];
    return f;
  };

  function rewind(el, m) {
    if (m.type === 'class') {
      m.add.forEach(function (c) {
        el.classList.remove(c);
      });
      m.remove.forEach(function (c) {
        el.classList.add(c);
      });
    } else {
      for (var k in m.from) el.style.setProperty(k, m.from[k]);
    }
  }

  function play(el, m, orig, delay) {
    if (m.type === 'class') {
      var go = function () {
        m.remove.forEach(function (c) {
          el.classList.remove(c);
        });
        m.add.forEach(function (c) {
          el.classList.add(c);
        });
      };
      if (delay) setTimeout(go, delay);
      else go();
      return;
    }
    if (orig === null) el.removeAttribute('style');
    else el.setAttribute('style', orig);
    var to = {},
      cs = getComputedStyle(el);
    for (var k in m.from) to[k] = m.to[k] || cs.getPropertyValue(k);
    el.animate([frame(m.from), frame(to)], {
      duration: m.duration || 600,
      delay: delay,
      easing: m.easing || 'ease-out',
      fill: 'backwards',
    });
  }

  var io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (!e.isIntersecting) return;
              io.unobserve(e.target);
              var s = e.target.__dittu;
              play(e.target, s.m, s.orig, s.delay);
            });
          },
          { threshold: 0.1, rootMargin: '0px 0px -5% 0px' },
        )
      : null;

  // Elements sharing an animation share its id; delays[i] is the i-th element's stagger.
  items.forEach(function (m) {
    var els = d.querySelectorAll('[data-dittu-m="' + m.id + '"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (m.type === 'loop') {
        try {
          el.animate(m.keyframes, m.options);
        } catch {}
        continue;
      }
      el.__dittu = { m: m, orig: el.getAttribute('style'), delay: (m.delays && m.delays[i]) || 0 };
      rewind(el, m);
      if (io) io.observe(el);
      else play(el, m, el.__dittu.orig, el.__dittu.delay);
    }
  });
})();
