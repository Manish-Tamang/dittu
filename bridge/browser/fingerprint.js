// Run on the mobile-width render: every element's tag, inline style, class
// and a content signature by DOM path, so the desktop snapshot can see what
// JS changed per viewport (and only trust matches between the same element).
() => {
  const sig = (el) => {
    const path = el.querySelector('path');
    return `${el.childElementCount}|${(el.textContent || '').trim().slice(0, 32)}|${(path && (path.getAttribute('d') || '').slice(0, 24)) || ''}`;
  };
  const entries = {};
  const walk = (el, path) => {
    let i = 0;
    for (const c of el.children) {
      const p = path ? `${path}/${i}` : String(i);
      entries[p] = [c.localName, c.getAttribute('style') || '', c.getAttribute('class') || '', sig(c)];
      walk(c, p);
      i++;
    }
  };
  walk(document.body, '');
  return entries;
};
