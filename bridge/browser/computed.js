// Resolve computed values for [{ path, props }] on the mobile render.
(items) => {
  const at = (path) => {
    let el = document.body;
    for (const i of path.split('/')) {
      el = el && el.children[Number(i)];
    }
    return el;
  };
  return items.map(({ path, props }) => {
    const el = at(path);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  });
};
