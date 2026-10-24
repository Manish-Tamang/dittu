import type { Element, ElementContent, Root, Text } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { stringify as commas } from 'comma-separated-tokens';
import { find, html } from 'property-information';
import { stringify as spaces } from 'space-separated-tokens';
import { EACH, MARK, SLOT, SLOT_RE, STYLE_SLOT, USE, type PropDef, type PropValue, isComponentRef } from './ir.js';
import { slotName } from './naming.js';
import { CONTENT_ATTRS, signature } from './signature.js';

/** Instances can't share one template (thrown during merge). */
class NotMergeable extends Error {}

export interface Built {
  root: Element;
  props: PropDef[];
  /** Prop values per instance, in input order (keyed by loop variable when built for a loop). */
  values: Record<string, PropValue>[];
  /** Built for a loop with a single string prop: each item is that string. */
  primitive?: boolean;
}

interface Ctx {
  props: PropDef[];
  values: Record<string, PropValue>[];
  names: Set<string>;
  /** Called once the final path of each slot is known (`title`, `tag.name`, `tag`). */
  fixes: ((prefix: string | null, primitive: boolean) => void)[];
}

const newCtx = (n: number): Ctx => ({
  props: [],
  values: Array.from({ length: n }, () => ({})),
  names: new Set(),
  fixes: [],
});

/** Attribute value as it appears in HTML (same stringification hast-util-to-html uses). */
function attrText(key: string, value: unknown): string {
  if (Array.isArray(value))
    return find(html, key).commaSeparated ? commas(value.map(String)) : spaces(value.map(String));
  if (value === true) return '';
  return String(value ?? '');
}

const same = (vals: unknown[]) => vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0]));

function addProp(ctx: Ctx, hint: string, type: PropDef['type'], vals: PropValue[]): string {
  let name = hint;
  for (let n = 2; ctx.names.has(name); n++) name = `${hint}${n}`;
  ctx.names.add(name);
  ctx.props.push({ name, type });
  vals.forEach((v, i) => (ctx.values[i][name] = v));
  return name;
}

const pathOf = (name: string, prefix: string | null, primitive: boolean) =>
  prefix === null ? name : primitive ? prefix : `${prefix}.${name}`;

/** Group children into runs of consecutive nodes with the same signature. */
function runs(children: ElementContent[]): ElementContent[][] {
  const out: ElementContent[][] = [];
  let prev = '';
  for (const c of children) {
    const s = signature(c);
    if (!s) continue;
    if (out.length && s === prev) out[out.length - 1].push(c);
    else out.push([c]);
    prev = s;
  }
  return out;
}

function mergeText(nodes: Text[], ctx: Ctx, path: Element[]): ElementContent {
  const vals = nodes.map((n) => n.value);
  if (same(vals)) return { type: 'text', value: vals[0] };
  const name = addProp(ctx, slotName(path, null), { kind: 'string' }, vals);
  const node: Element = { type: 'element', tagName: SLOT, properties: { dataPath: name }, children: [] };
  ctx.fixes.push((prefix, primitive) => (node.properties.dataPath = pathOf(name, prefix, primitive)));
  return node;
}

function mergeElements(nodes: Element[], ctx: Ctx, path: Element[]): Element {
  const first = nodes[0];
  if (nodes.some((n) => n.tagName !== first.tagName)) throw new NotMergeable();

  if (first.tagName === USE) {
    // Icons: same pass-through attributes (signature), maybe different icon → component prop.
    if (!same(nodes.map((n) => n.properties.dataProps))) throw new NotMergeable();
    const comps = nodes.map((n) => String(n.properties.dataComponent));
    if (same(comps)) return structuredClone(first);
    const name = addProp(
      ctx,
      'icon',
      { kind: 'component' },
      comps.map((c) => ({ $component: c })),
    );
    const { dataComponent: _c, ...rest } = first.properties;
    const node: Element = {
      type: 'element',
      tagName: USE,
      properties: { ...structuredClone(rest), dataSlot: name },
      children: [],
    };
    ctx.fixes.push((prefix, primitive) => (node.properties.dataSlot = pathOf(name, prefix, primitive)));
    return node;
  }

  const here = [...path, first];
  const properties: Element['properties'] = {};
  const keys = Object.keys(first.properties);
  if (nodes.some((n) => Object.keys(n.properties).length !== keys.length || keys.some((k) => !(k in n.properties)))) {
    throw new NotMergeable();
  }
  for (const key of keys) {
    const vals = nodes.map((n) => n.properties[key]);
    if (same(vals)) {
      properties[key] = structuredClone(vals[0]);
      continue;
    }
    // Only content (text, links, media, labels) may differ; classes and the rest are structure.
    if (!CONTENT_ATTRS.has(key)) throw new NotMergeable();
    if (key === 'style') {
      const name = addProp(
        ctx,
        'style',
        { kind: 'style' },
        vals.map((v) => attrText(key, v)),
      );
      ctx.fixes.push((prefix, primitive) => (properties[STYLE_SLOT] = pathOf(name, prefix, primitive)));
      continue;
    }
    const name = addProp(
      ctx,
      slotName(here, key),
      { kind: 'string' },
      vals.map((v) => attrText(key, v)),
    );
    ctx.fixes.push((prefix, primitive) => (properties[key] = `${MARK}${pathOf(name, prefix, primitive)}${MARK}`));
  }

  const perInstance = nodes.map((n) => runs(n.children));
  if (perInstance.some((r) => r.length !== perInstance[0].length)) throw new NotMergeable();
  const children: ElementContent[] = [];
  for (let r = 0; r < perInstance[0].length; r++) {
    const group = perInstance.map((runsOf) => runsOf[r]);
    if (group.every((g) => g.length === 1)) {
      children.push(
        mergeNodes(
          group.map((g) => g[0]),
          ctx,
          here,
        ),
      );
      continue;
    }
    // A run whose length varies (or repeats) → list prop rendered with .map().
    const items = group.flat();
    if (items[0].type !== 'element') throw new NotMergeable();
    const sub = newCtx(items.length);
    const itemTemplate = mergeNodes(items, sub, here) as Element;
    const primitive = sub.props.length === 1 && sub.props[0].type.kind === 'string';
    const itemValues: PropValue[] = sub.values.map((v) => (primitive ? v[sub.props[0].name] : v));
    let offset = 0;
    const lists = group.map((g) => {
      const slice = itemValues.slice(offset, offset + g.length);
      offset += g.length;
      return slice;
    });
    const hint = listHint(itemTemplate, primitive ? sub.props[0].name : null);
    const name = addProp(ctx, hint, { kind: 'list', item: primitive ? 'string' : sub.props }, lists);
    const itemVar = singular(name);
    for (const fix of sub.fixes) fix(itemVar, primitive);
    const each: Element = {
      type: 'element',
      tagName: EACH,
      properties: { dataItem: itemVar },
      children: [itemTemplate],
    };
    ctx.fixes.push((prefix, prim) => (each.properties.dataPath = pathOf(name, prefix, prim)));
    children.push(each);
  }
  return { type: 'element', tagName: first.tagName, properties, children };
}

function mergeNodes(nodes: ElementContent[], ctx: Ctx, path: Element[]): ElementContent {
  const kind = nodes[0].type;
  if (nodes.some((n) => n.type !== kind)) throw new NotMergeable();
  if (kind === 'text') return mergeText(nodes as Text[], ctx, path);
  if (kind === 'element') return mergeElements(nodes as Element[], ctx, path);
  throw new NotMergeable();
}

function listHint(item: Element, primitiveName: string | null): string {
  if (primitiveName === 'title' || primitiveName === 'label' || primitiveName === 'text') {
    if (item.tagName === 'li') return 'items';
    if (item.tagName === 'a') return 'links';
    return item.tagName === 'span' ? 'tags' : 'items';
  }
  if (primitiveName === 'image') return 'images';
  if (item.tagName === 'a') return 'links';
  return 'items';
}

/** "tags" → "tag", "entries" → "entry", "boxes" → "box", "items" → "item". */
export const singular = (list: string) =>
  list.endsWith('ies')
    ? list.slice(0, -3) + 'y'
    : /(s|x|z|ch|sh)es$/.test(list)
      ? list.slice(0, -2)
      : list.endsWith('s')
        ? list.slice(0, -1)
        : list + 'Item';

/**
 * Build one template for structurally identical instances, or null if they
 * can't share one. With `itemVar`, slots read from a loop variable
 * (`item.title`, or `item` when there is a single string prop).
 */
export function buildTemplate(instances: Element[], itemVar?: string): Built | null {
  const ctx = newCtx(instances.length);
  try {
    const root = mergeElements(instances, ctx, []);
    const primitive = Boolean(itemVar) && ctx.props.length === 1 && ctx.props[0].type.kind === 'string';
    for (const fix of ctx.fixes) fix(itemVar ?? null, primitive);
    const values = primitive ? ctx.values.map((v) => ({ [itemVar!]: v[ctx.props[0].name] })) : ctx.values;
    return { root, props: ctx.props, values, primitive };
  } catch (err) {
    if (err instanceof NotMergeable) return null;
    throw err;
  }
}

type Scope = Record<string, PropValue>;

function resolve(path: string, scope: Scope): PropValue | undefined {
  let cur: PropValue | undefined = scope;
  for (const part of path.split('.')) {
    if (cur === undefined || typeof cur !== 'object' || Array.isArray(cur) || isComponentRef(cur)) return undefined;
    cur = (cur as Record<string, PropValue>)[part];
  }
  return cur;
}

/** Expand a template with prop values back into plain hast (used to prove extraction is lossless). */
function instantiate(node: ElementContent, scope: Scope): ElementContent[] {
  if (node.type !== 'element') return [structuredClone(node)];
  if (node.tagName === SLOT)
    return [{ type: 'text', value: String(resolve(String(node.properties.dataPath), scope) ?? '') }];
  if (node.tagName === EACH) {
    const list = resolve(String(node.properties.dataPath), scope);
    if (!Array.isArray(list)) return [];
    const item = String(node.properties.dataItem);
    return list.flatMap((value) => node.children.flatMap((c) => instantiate(c, { ...scope, [item]: value })));
  }
  const properties: Element['properties'] = {};
  for (const [key, value] of Object.entries(node.properties)) {
    if (key === STYLE_SLOT) {
      properties.style = String(resolve(String(value), scope) ?? '');
    } else if (key === 'dataSlot' && node.tagName === USE) {
      const ref = resolve(String(value), scope);
      properties.dataComponent = isComponentRef(ref) ? ref.$component : '';
    } else if (typeof value === 'string' && SLOT_RE.test(value)) {
      properties[key] = String(resolve(SLOT_RE.exec(value)![1], scope) ?? '');
    } else {
      properties[key] = structuredClone(value);
    }
  }
  return [
    {
      type: 'element',
      tagName: node.tagName,
      properties,
      children: node.children.flatMap((c) => instantiate(c, scope)),
    },
  ];
}

/** Serialized form used for lossless comparisons (attribute order normalized). */
export function canonical(node: ElementContent | Root): string {
  const norm = (n: ElementContent): ElementContent =>
    n.type === 'element'
      ? {
          ...n,
          properties: Object.fromEntries(
            Object.entries(n.properties)
              .filter(([k]) => k !== 'dataProps' || n.tagName === USE)
              .toSorted(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [
                k,
                typeof v === 'string' || Array.isArray(v) || typeof v === 'boolean' || typeof v === 'number'
                  ? attrText(k, v)
                  : v,
              ]),
          ) as Element['properties'],
          children: n.children.map(norm),
        }
      : n;
  return node.type === 'root'
    ? toHtml({ ...node, children: node.children.map((c) => norm(c as ElementContent)) })
    : toHtml(norm(node));
}

/** True if every instance is reproduced exactly by the template (`itemVar`: built for a loop). */
export function isLossless(built: Built, instances: Element[], itemVar?: string): boolean {
  return instances.every((inst, i) => {
    const scope = itemVar && !built.primitive ? { [itemVar]: built.values[i] } : built.values[i];
    const out = instantiate(built.root, scope);
    return out.length === 1 && canonical(out[0]) === canonical(inst);
  });
}
