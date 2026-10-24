// Serializes the live, rendered page: markup that survives HTML parsing and
// React hydration unchanged, every stylesheet in cascade order, and the
// motion recorded by recorder.js. Evaluated as `(source)(options)`.
(opts) => {
  const warnings = new Set();
  const doc = document;
  const removeSel = (opts && opts.remove) || [];

  // ---------------------------------------------------------------- motion
  const motionIds = new Map();
  const motion = analyzeMotion();

  function analyzeMotion() {
    const D = window.__dittu;
    if (!D) return [];
    try {
      D.mo.disconnect();
    } catch {}
    const items = [];
    const now = performance.now() - D.t0;
    const PROPS = ['opacity', 'transform', 'translate', 'scale', 'rotate', 'filter', 'clip-path', 'visibility'];
    const tmp = doc.createElement('div');
    const pick = (styleText) => {
      tmp.setAttribute('style', styleText || '');
      const o = {};
      for (const p of PROPS) {
        const v = tmp.style.getPropertyValue(p);
        if (v) o[p] = v;
      }
      return o;
    };
    const computed = (el) => {
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of PROPS) o[p] = cs.getPropertyValue(p);
      return o;
    };
    const identity = (v) => {
      if (!v || v === 'none') return true;
      try {
        return new DOMMatrix(v).isIdentity;
      } catch {}
      return /^(translate(3d|x|y)?\(\s*0(px|%)?\s*(,\s*0(px|%)?\s*)*\)\s*|scale\(\s*1\s*\)\s*)+$/i.test(v.trim());
    };
    const num = (v, d) => (v === undefined || v === '' ? d : parseFloat(v));
    const isReveal = (a, b) => {
      if (num(a.opacity, 1) < num(b.opacity, 1) - 0.05) return true;
      if (!identity(a.transform) && identity(b.transform)) return true;
      for (const p of ['translate', 'scale', 'rotate']) {
        const idv = p === 'scale' ? '1' : p === 'rotate' ? '0deg' : '0px';
        if (a[p] && a[p] !== 'none' && a[p] !== idv && (!b[p] || b[p] === 'none' || b[p] === idv)) return true;
      }
      if (
        a.filter &&
        /blur\(\s*[1-9]/.test(a.filter) &&
        (!b.filter || b.filter === 'none' || !/blur\(\s*[1-9]/.test(b.filter))
      )
        return true;
      if (
        a['clip-path'] &&
        a['clip-path'] !== 'none' &&
        a['clip-path'] !== b['clip-path'] &&
        (!b['clip-path'] || b['clip-path'] === 'none' || /inset\(\s*0(px|%)?\s*\)/.test(b['clip-path']))
      )
        return true;
      if (a.visibility === 'hidden' && b.visibility !== 'hidden') return true;
      return false;
    };
    const add = (el, item) => {
      if (motionIds.has(el) || items.length >= 400) return;
      const id = String(items.length + 1);
      motionIds.set(el, id);
      items.push({ id, ...item, parent: el.parentElement });
    };

    // 1. WAAPI animations (Framer Motion & friends call element.animate)
    const byEl = new Map();
    for (const a of D.anims) {
      if (!a.el.isConnected || !a.keyframes) continue;
      if (!byEl.has(a.el)) byEl.set(a.el, []);
      byEl.get(a.el).push(a);
    }
    for (const [el, list] of byEl) {
      const loop = list.find((a) => a.infinite);
      if (loop) {
        add(el, {
          type: 'loop',
          keyframes: loop.keyframes,
          options: { ...loop.options, iterations: Infinity },
          t: loop.t,
        });
        continue;
      }
      // Merge first/last frame per property over all calls on this element.
      const from = {},
        to = {};
      let duration = 0,
        delay = 0,
        easing = 'ease-out',
        t = Infinity;
      for (const a of list) {
        const frames = Array.isArray(a.keyframes)
          ? a.keyframes
          : (() => {
              const out = [];
              for (const [k, v] of Object.entries(a.keyframes)) {
                if (k === 'offset' || k === 'easing' || k === 'composite') continue;
                const arr = Array.isArray(v) ? v : [v];
                arr.forEach((val, i) => {
                  out[i] = out[i] || {};
                  out[i][k] = val;
                });
                if (arr.length === 1) out.unshift({});
              }
              return out;
            })();
        if (!frames.length) continue;
        const first = frames[0] || {},
          last = frames[frames.length - 1] || {};
        for (const [k, v] of Object.entries(first)) {
          if (k === 'offset' || k === 'easing' || k === 'composite' || v == null) continue;
          const prop = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
          if (!(prop in from)) from[prop] = String(v);
        }
        for (const [k, v] of Object.entries(last)) {
          if (k === 'offset' || k === 'easing' || k === 'composite' || v == null) continue;
          to[k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = String(v);
        }
        duration = Math.max(duration, num(a.options.duration, 300));
        delay = Math.max(delay, num(a.options.delay, 0));
        if (typeof a.options.easing === 'string') easing = a.options.easing;
        t = Math.min(t, a.t);
      }
      if (Object.keys(from).length && isReveal(from, to))
        add(el, { type: 'style', from, to, duration, delay, easing, t });
    }

    // 2. Inline-style and class mutations
    for (const [el, r] of D.rec) {
      if (!el.isConnected || motionIds.has(el) || el === doc.documentElement || el === doc.body) continue;
      // still changing right up to the snapshot: a continuous loop, not a reveal
      if (r.n > 40 && now - r.last < 400) continue;
      if (r.s0 !== undefined) {
        const cur = el.getAttribute('style') || '';
        if (cur !== r.s0) {
          const from = pick(r.s0),
            to = pick(cur);
          if (isReveal(from, to)) {
            const duration = r.n > 3 ? Math.min(2000, Math.max(250, r.last - r.first)) : 600;
            add(el, {
              type: 'style',
              from,
              to,
              duration,
              delay: 0,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              t: r.first,
            });
            continue;
          }
        }
      }
      if (r.c0 !== undefined) {
        const cur = el.getAttribute('class') || '';
        if (cur === r.c0) continue;
        const style = el.getAttribute('style');
        el.style.setProperty('transition', 'none', 'important');
        const to = computed(el);
        el.setAttribute('class', r.c0);
        const from = computed(el);
        el.setAttribute('class', cur);
        if (style === null) el.removeAttribute('style');
        else el.setAttribute('style', style);
        if (!isReveal(from, to)) continue;
        const before = new Set(r.c0.split(/\s+/).filter(Boolean));
        const after = new Set(cur.split(/\s+/).filter(Boolean));
        add(el, {
          type: 'class',
          add: [...after].filter((c) => !before.has(c)),
          remove: [...before].filter((c) => !after.has(c)),
          delay: 0,
          t: r.first,
        });
      }
    }

    // Stagger: siblings revealed together keep their relative delays.
    const groups = new Map();
    for (const it of items) {
      if (it.type === 'loop') continue;
      if (!groups.has(it.parent)) groups.set(it.parent, []);
      groups.get(it.parent).push(it);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const min = Math.min(...g.map((i) => i.t));
      for (const it of g) if (!it.delay) it.delay = Math.min(1500, Math.round(it.t - min));
    }
    return items.map(({ parent: _parent, t: _t, ...rest }) => rest);
  }

  // ------------------------------------------------------- nesting repairs
  // Markup produced by DOM APIs can nest elements in ways the HTML parser
  // would restructure on reload (and React would then fail to hydrate).
  const rename = new Map();
  const P_CLOSERS =
    'address,article,aside,blockquote,details,dialog,div,dl,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,main,menu,nav,ol,p,pre,section,table,ul,search,center,dir,listing,xmp';
  const SCOPE = new Set(['BUTTON', 'TABLE', 'TD', 'TH', 'CAPTION', 'OBJECT', 'MARQUEE', 'TEMPLATE', 'svg', 'math']);
  for (const p of doc.body.querySelectorAll('p')) {
    for (const c of p.querySelectorAll(P_CLOSERS)) {
      let n = c.parentElement,
        scoped = false;
      while (n && n !== p) {
        if (SCOPE.has(n.tagName) || SCOPE.has(n.localName)) {
          scoped = true;
          break;
        }
        n = n.parentElement;
      }
      if (!scoped) {
        const cs = getComputedStyle(p);
        rename.set(p, { tag: 'div', style: `margin-top:${cs.marginTop};margin-bottom:${cs.marginBottom}` });
        warnings.add('Renamed <p> containing block elements to <div> (HTML parser would split it).');
        break;
      }
    }
  }
  const renameInner = (sel, tag, copy) => {
    for (const el of doc.body.querySelectorAll(sel)) {
      if (rename.has(el)) continue;
      let style = '';
      if (copy) {
        const cs = getComputedStyle(el);
        style = copy.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';');
      }
      rename.set(el, { tag, style });
    }
  };
  renameInner('a a', 'span', ['color', 'text-decoration-line', 'cursor']);
  renameInner('button button', 'span', ['display', 'padding', 'border', 'background-color', 'cursor']);
  renameInner('form form', 'div');
  renameInner(':is(h1,h2,h3,h4,h5,h6) > :is(h1,h2,h3,h4,h5,h6)', 'div', [
    'display',
    'font-size',
    'font-weight',
    'margin-top',
    'margin-bottom',
  ]);
  renameInner('li > li', 'div', ['display']);

  // ------------------------------------------------------------ serializer
  const VOID = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
  ]);
  const DROP = new Set([
    'script',
    'noscript',
    'template',
    'style',
    'link',
    'base',
    'meta',
    'title',
    'next-route-announcer',
    'nextjs-portal',
    'vercel-live-feedback',
    'grammarly-desktop-integration',
  ]);
  const TABLE_PARENTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup']);
  const ATTR_OK = /^[a-zA-Z_][\w\-.]*(:[a-zA-Z_][\w\-.]*)?$/;
  const removed = new Set();
  for (const sel of removeSel) {
    try {
      doc.querySelectorAll(sel).forEach((e) => removed.add(e));
    } catch {
      warnings.add(`Invalid --remove selector: ${sel}`);
    }
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const wsCache = new WeakMap();
  const preserveWs = (el) => {
    if (!el) return false;
    if (wsCache.has(el)) return wsCache.get(el);
    const ws = getComputedStyle(el).whiteSpace;
    const v = !(ws === 'normal' || ws === 'nowrap' || ws === '');
    wsCache.set(el, v);
    return v;
  };

  // Whitespace-only text that cannot affect layout: inside flex/grid
  // containers, between block-level boxes, or at the edge of a block container
  // (CSS removes spaces at the start and end of a line).
  const displayCache = new WeakMap();
  const display = (el) => {
    let d = displayCache.get(el);
    if (d === undefined) {
      d = getComputedStyle(el).display;
      displayCache.set(el, d);
    }
    return d;
  };
  const BLOCKY = new Set([
    'block',
    'flex',
    'grid',
    'table',
    'list-item',
    'flow-root',
    'table-row',
    'table-row-group',
    'table-header-group',
    'table-footer-group',
    'table-caption',
    'table-cell',
  ]);
  const CONTAINER = new Set(['block', 'list-item', 'table-cell', 'flow-root', 'inline-block', 'table-caption']);
  const neighbour = (node, dir) => {
    let n = node[dir];
    while (n && (n.nodeType === 8 || (n.nodeType === 1 && DROP.has(n.localName)))) n = n[dir];
    return n;
  };
  function insignificantWs(node) {
    const parent = node.parentElement;
    if (!parent || preserveWs(parent)) return false;
    const pd = display(parent);
    if (/flex|grid/.test(pd)) return true;
    const side = (n) => (n ? n.nodeType === 1 && BLOCKY.has(display(n)) : CONTAINER.has(pd));
    return side(neighbour(node, 'previousSibling')) && side(neighbour(node, 'nextSibling'));
  }

  // Elements whose inline style / class differ at mobile width (JS-computed layout).
  const mobile = (opts && opts.mobile) || null;
  const responsive = [];
  let structuralDiffs = 0;
  const styleMap = (text) => {
    tmpStyle.setAttribute('style', text || '');
    const m = new Map();
    for (let i = 0; i < tmpStyle.style.length; i++) {
      const k = tmpStyle.style[i];
      m.set(k, tmpStyle.style.getPropertyValue(k) + (tmpStyle.style.getPropertyPriority(k) ? ' !important' : ''));
    }
    return m;
  };
  const tmpStyle = doc.createElement('div');
  const sig = (el) => {
    const p = el.querySelector('path');
    return `${el.childElementCount}|${(el.textContent || '').trim().slice(0, 32)}|${(p && (p.getAttribute('d') || '').slice(0, 24)) || ''}`;
  };
  // Elements the site's JS changed repeatedly over time (carousels, logo
  // flippers): a difference on the mobile render is a different moment, not a
  // different viewport.
  const volatile = new Set();
  if (window.__dittu) for (const [el, r] of window.__dittu.rec) if (r.n >= 2) volatile.add(el);
  function responsiveFor(el, path) {
    if (!mobile) return null;
    const m = mobile[path];
    if (!m) {
      // Rendered on desktop only: hide it below the breakpoint when the parent
      // exists on mobile too (e.g. fewer grid items via useMediaQuery).
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const pm = parent ? mobile[parent] : ['body'];
      structuralDiffs++;
      if (!pm || pm[0] !== (el.parentElement && el.parentElement.localName)) return null;
      const id = String(responsive.length + 1);
      responsive.push({ id, path, props: ['display'], add: [], remove: [], values: { display: 'none' } });
      return id;
    }
    if (m[0] !== el.localName || m[3] !== sig(el)) {
      structuralDiffs++;
      return null;
    }
    if (volatile.has(el) || motionIds.has(el)) return null;
    const style = el.getAttribute('style') || '';
    const cls = el.getAttribute('class') || '';
    if (m[1] === style && m[2] === cls) return null;
    const props = [];
    if (m[1] !== style) {
      const a = styleMap(style),
        b = styleMap(m[1]);
      for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) props.push(k);
    }
    let add = [],
      remove = [];
    if (m[2] !== cls) {
      const d = new Set(cls.split(/\s+/).filter(Boolean)),
        mo = new Set(m[2].split(/\s+/).filter(Boolean));
      add = [...mo].filter((c) => !d.has(c));
      remove = [...d].filter((c) => !mo.has(c));
    }
    if (!props.length && !add.length && !remove.length) return null;
    const id = String(responsive.length + 1);
    responsive.push({ id, path, props, add, remove });
    return id;
  }

  // Identical animations share one id so repeated elements carry identical
  // markup (and can become one component); per-element delays are stored in
  // document order instead.
  const sharedMotion = new Map();
  const sharedItems = [];
  {
    const byKey = new Map();
    for (const item of motion) {
      const { id, delay, ...config } = item;
      const key = JSON.stringify(config);
      let shared = byKey.get(key);
      if (!shared) {
        shared = { id: 'm' + (byKey.size + 1), config, delays: [], byItem: new Map() };
        shared.delayOf = (itemId) => shared.byItem.get(itemId) || 0;
        byKey.set(key, shared);
        sharedItems.push(shared);
      }
      shared.byItem.set(id, delay || 0);
      sharedMotion.set(id, shared);
    }
  }

  const canvases = [];
  let canvasN = 0;
  let shadowWarned = false;

  function attrs(el, extra) {
    let s = '';
    const seen = new Set();
    for (const a of el.attributes) {
      const name = a.name;
      const lower = name.toLowerCase();
      if (!ATTR_OK.test(name)) continue;
      if (name.includes(':') && !/^(xlink|xml|xmlns):/.test(lower)) continue;
      if (
        lower.startsWith('on') ||
        lower === 'nonce' ||
        lower === 'integrity' ||
        lower === 'autofocus' ||
        lower === 'data-dittu-playing' ||
        lower === 'action' ||
        lower === 'formaction' ||
        lower === 'ping'
      )
        continue;
      let v = a.value;
      if (extra && lower in extra) {
        v = extra[lower];
        delete extra[lower];
        if (v === null) continue;
      }
      if (lower === 'href' && /^\s*javascript:/i.test(v)) v = '#';
      seen.add(lower);
      s += v === '' ? ` ${name}` : ` ${name}="${escAttr(v)}"`;
    }
    if (extra)
      for (const [k, v] of Object.entries(extra))
        if (v !== null && !seen.has(k)) s += v === '' ? ` ${k}` : ` ${k}="${escAttr(v)}"`;
    return s;
  }

  function extraFor(el, tag, path) {
    const extra = {};
    const rid = responsiveFor(el, path);
    if (rid) extra['data-dittu-r'] = rid;
    const r = rename.get(el);
    if (r && r.style) {
      const cur = el.getAttribute('style');
      extra.style = cur ? `${cur.replace(/;?\s*$/, ';')}${r.style}` : r.style;
    }
    const mid = motionIds.get(el);
    if (mid) {
      const shared = sharedMotion.get(mid);
      extra['data-dittu-m'] = shared.id;
      shared.delays.push(shared.delayOf(mid));
    }
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') extra.checked = el.checked ? '' : null;
      else if (type !== 'password' && type !== 'file' && el.value !== (el.getAttribute('value') || ''))
        extra.value = el.value;
    } else if (tag === 'option') {
      extra.selected = el.selected ? '' : null;
    } else if (tag === 'video') {
      if (el.hasAttribute('data-dittu-playing')) {
        extra.autoplay = '';
        extra.playsinline = '';
        if (el.loop) extra.loop = '';
      }
      if (el.muted || el.hasAttribute('data-dittu-playing')) extra.muted = '';
    }
    return extra;
  }

  function serialize(node, out, parentTag, path) {
    if (node.nodeType === 3) {
      let t = node.data;
      if (TABLE_PARENTS.has(parentTag)) {
        if (t.trim()) warnings.add('Dropped stray text inside a table (HTML parser would move it).');
        return;
      }
      if (!preserveWs(node.parentElement)) t = t.replace(/[\t\n\r\f ]+/g, ' ');
      if (!t || (t === ' ' && insignificantWs(node))) return;
      out.push(esc(t));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    let tag = el.localName;
    if ((DROP.has(tag) && !(tag === 'title' && el.namespaceURI !== 'http://www.w3.org/1999/xhtml')) || removed.has(el))
      return;
    if (el.hasAttribute('hidden') && /^S:\d+$/.test(el.id)) return; // Next.js streaming leftovers
    if (el.shadowRoot && !shadowWarned) {
      shadowWarned = true;
      warnings.add('Page uses Shadow DOM; only light-DOM content was captured.');
    }

    if (tag === 'canvas') {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // The image's natural size equals the canvas buffer (2D) or its CSS box
      // (screenshot), like the canvas's intrinsic size. Width/height attributes
      // would act as CSS sizes on <img> (not on <canvas>), so drop them.
      const extra = { width: null, height: null };
      let src = null;
      try {
        if (el.getContext('2d')) src = el.toDataURL('image/png');
      } catch {}
      const cid = String(++canvasN);
      if (src) extra['data-dittu-canvas'] = cid;
      else {
        el.setAttribute('data-dittu-cid', cid);
        extra['data-dittu-cid'] = cid;
        canvases.push({ cid, x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height });
      }
      extra.src = src || '';
      out.push(`<img${attrs(el, extra)}>`);
      return;
    }

    const r = rename.get(el);
    if (r) tag = r.tag;
    out.push(`<${tag}${attrs(el, extraFor(el, el.localName, path))}>`);
    if (VOID.has(tag)) return;

    if (tag === 'textarea') {
      out.push(esc(el.value));
    } else if (tag === 'table') {
      let inBody = false,
        i = 0;
      for (const c of el.childNodes) {
        const isTr = c.nodeType === 1 && c.localName === 'tr';
        if (isTr && !inBody) {
          out.push('<tbody>');
          inBody = true;
        }
        if (!isTr && inBody && c.nodeType === 1) {
          out.push('</tbody>');
          inBody = false;
        }
        serialize(c, out, 'table', c.nodeType === 1 ? `${path}/${i++}` : path);
      }
      if (inBody) out.push('</tbody>');
    } else {
      let i = 0;
      for (const c of el.childNodes) serialize(c, out, tag, c.nodeType === 1 ? `${path}/${i++}` : path);
    }
    out.push(`</${tag}>`);
  }

  const bodyOut = [];
  let bi = 0;
  for (const c of doc.body.childNodes) serialize(c, bodyOut, 'body', c.nodeType === 1 ? String(bi++) : '');
  if (mobile && structuralDiffs > 20)
    warnings.add(
      `Mobile DOM differs structurally from desktop in ${structuralDiffs} places; those parts keep desktop markup.`,
    );

  const rootAttrs = (el) => {
    const list = [];
    for (const a of el.attributes) {
      const n = a.name.toLowerCase();
      if (!ATTR_OK.test(a.name) || n.startsWith('on') || n === 'xmlns' || n.includes(':')) continue;
      list.push([a.name, a.value]);
    }
    return list;
  };

  // ------------------------------------------------------------- head
  const metas = [];
  for (const m of doc.head.querySelectorAll('meta[name],meta[property]')) {
    const name = m.getAttribute('name') || m.getAttribute('property');
    if (/^(description|theme-color|color-scheme)$/i.test(name)) metas.push([name, m.getAttribute('content') || '']);
  }
  const icons = [...doc.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].map((l) => ({
    rel: l.getAttribute('rel'),
    href: l.getAttribute('href'),
    type: l.getAttribute('type'),
    sizes: l.getAttribute('sizes'),
  }));

  // ------------------------------------------------------------- stylesheets
  const sheets = [];
  const ruleText = (sheet) => Array.from(sheet.cssRules, (r) => r.cssText).join('\n');
  const all = [...doc.styleSheets, ...(doc.adoptedStyleSheets || [])];
  for (const sheet of all) {
    if (sheet.disabled) continue;
    const owner = sheet.ownerNode;
    if (owner && removed.has(owner)) continue;
    const media = sheet.media ? sheet.media.mediaText : '';
    if (owner && owner.localName === 'link') {
      let cssom = null;
      try {
        cssom = ruleText(sheet);
      } catch {}
      sheets.push({ kind: 'link', href: sheet.href, media, cssom });
    } else if (owner) {
      const text = owner.textContent || '';
      let rules = -1;
      try {
        rules = sheet.cssRules.length;
      } catch {}
      let textRules = -1;
      try {
        const probe = new CSSStyleSheet();
        probe.replaceSync(text);
        textRules = probe.cssRules.length;
      } catch {}
      const importCount = (text.match(/@import\s/g) || []).length;
      // CSS-in-JS (styled-components, emotion) injects rules via insertRule:
      // they live in the CSSOM only, so serialize that instead of the text.
      const useCssom = rules >= 0 && textRules >= 0 && rules !== textRules + importCount;
      sheets.push({ kind: 'style', text: useCssom ? ruleText(sheet) : text, media, fromCssom: useCssom });
    } else {
      try {
        sheets.push({ kind: 'adopted', text: ruleText(sheet), media });
      } catch {}
    }
  }

  return {
    url: location.href,
    baseURI: doc.baseURI,
    title: doc.title,
    htmlAttrs: rootAttrs(doc.documentElement),
    bodyAttrs: rootAttrs(doc.body),
    metas,
    icons,
    bodyHtml: bodyOut.join(''),
    sheets,
    canvases,
    motion: sharedItems
      .filter((m) => m.delays.length)
      .map((m) => ({ id: m.id, ...m.config, delays: m.delays.some(Boolean) ? m.delays : undefined })),
    responsive,
    warnings: [...warnings],
    docHeight: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight),
  };
};
