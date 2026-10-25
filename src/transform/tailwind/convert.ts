import type { Element, Root } from 'hast';
import { atRule, type AtRule, type ChildNode, type Container, type Root as CssRoot } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { declCandidates, STATE_PSEUDOS, variantPrefixes } from './candidates.js';
import { cssModel, family, overlaps, specificity, type Decl, type StyleRule } from './cascade.js';
import { normMedia, verify, verifyRule, type TailwindCompiler, type Verified } from './compiler.js';
import { matcher, pageTree, type Matcher, type Tree } from './match.js';

export interface TailwindPageInput {
  body: Root;
  css: string;
  htmlAttrs: [string, string][];
  bodyAttrs: [string, string][];
  /** Classes the motion runtime adds or removes: their rules must stay CSS. */
  toggled: Set<string>;
}

export interface TailwindPageResult {
  /** The CSS that stays CSS, with the site's layers renamed and unlayered rules wrapped (no layer statement yet). */
  css: CssRoot;
  /** The site's cascade layers, renamed, in order (lowest first). */
  layers: string[];
  /** Tailwind classes now used in the markup. */
  classes: Set<string>;
  /** Kept class names that Tailwind would also generate CSS for, renamed. */
  renames: Map<string, string>;
  htmlAttrs: [string, string][];
  bodyAttrs: [string, string][];
  stats: { rules: number; converted: number; declarations: number; elements: number };
}

/** Prefix for the site's cascade layers, which all sit below Tailwind's utilities. */
const LAYER_PREFIX = 'dittu-';
const UNLAYERED = `${LAYER_PREFIX}unlayered`;

interface Compound {
  tag: string | null;
  classes: string[];
  states: string[];
}

/** `.a.b:hover`, `a.btn`: one compound of classes (optionally a tag and state pseudo-classes). */
function compound(selector: string): Compound | null {
  let result: Compound | null = null;
  try {
    selectorParser((root) => {
      if (root.nodes.length !== 1) return;
      const c: Compound = { tag: null, classes: [], states: [] };
      let ok = true;
      root.nodes[0].each((node) => {
        if (node.type === 'class') c.classes.push(node.value);
        else if (node.type === 'tag' && c.tag === null && !c.classes.length && !c.states.length)
          c.tag = node.value.toLowerCase();
        else if (node.type === 'pseudo' && !node.nodes.length && STATE_PSEUDOS.has(node.value.toLowerCase()))
          c.states.push(node.value.toLowerCase());
        else ok = false;
      });
      if (ok && c.classes.length && c.tag !== 'html' && c.tag !== 'body') result = c;
    }).processSync(selector);
  } catch {
    return null;
  }
  return result;
}

const classesOf = (el: Element): string[] => {
  const c = el.properties.className;
  if (Array.isArray(c)) return c.map(String);
  return c ? String(c).split(/\s+/).filter(Boolean) : [];
};

const matches = (c: Compound, el: Element, classes: string[]) =>
  (!c.tag || el.tagName.toLowerCase() === c.tag) && c.classes.every((cls) => classes.includes(cls));

/** Original cascade position of a declaration. */
interface Prec {
  important: boolean;
  layer: string | null;
  spec: number | null;
  index: number;
  decl: number;
}

/** > 0 when `a` wins in the original stylesheet, null when it can't be told safely. */
function compareOrig(a: Prec, b: Prec, layers: string[]): number | null {
  if (a.important !== b.important) return a.important ? 1 : -1;
  if (a.layer !== b.layer) {
    if (a.layer === null || b.layer === null) {
      const unlayeredWins = a.layer === null ? 1 : -1;
      return a.important ? -unlayeredWins : unlayeredWins;
    }
    if (a.layer.includes('.') || b.layer.includes('.')) return null;
    const d = layers.indexOf(a.layer) - layers.indexOf(b.layer);
    return a.important ? -d : d;
  }
  if (a.spec === null || b.spec === null) return null;
  if (a.spec !== b.spec) return a.spec - b.spec;
  if (a.index !== b.index) return a.index - b.index;
  return a.decl - b.decl;
}

interface Plan {
  rule: StyleRule;
  compounds: Compound[];
  /** Chosen utility per `${selectorIndex}:${declIndex}`. */
  chosen: Map<string, Verified>;
  /** Set when one of the rule's own classes regenerates it exactly (sites built with Tailwind): the class stays. */
  own?: { cls: string; utility: Verified };
}

interface Entry {
  plan: Plan;
  decl: Decl;
  utility: Verified;
  prec: Prec;
  family: string;
  /** Conditions + states: entries with equal keys apply in exactly the same situations. */
  variantKey: string;
}

interface ResidualSelector {
  rule: StyleRule;
  match: Matcher;
  spec: number | null;
}

/** Key of a selector's rightmost compound, used to find candidate residual rules for an element. */
function rightmostKey(selector: string): string {
  let key = '*';
  try {
    selectorParser((root) => {
      const sel = root.nodes[0];
      if (!sel) return;
      const nodes = sel.nodes;
      let i = nodes.length - 1;
      while (i > 0 && nodes[i - 1].type !== 'combinator') i--;
      for (const n of nodes.slice(i)) {
        if (n.type === 'id') key = `#${n.value}`;
        else if (n.type === 'class' && !key.startsWith('#')) key = `.${n.value}`;
        else if (n.type === 'tag' && key === '*') key = n.value.toLowerCase();
      }
      if (root.nodes.length > 1) key = '*';
    }).processSync(selector);
  } catch {
    return '*';
  }
  return key;
}

/** Classes in a selector's rightmost compound (the element it styles). */
function rightmostClasses(selector: string): string[] {
  const out: string[] = [];
  try {
    selectorParser((root) => {
      const nodes = root.nodes[0]?.nodes ?? [];
      let i = nodes.length - 1;
      while (i > 0 && nodes[i - 1].type !== 'combinator') i--;
      for (const n of nodes.slice(i)) if (n.type === 'class') out.push(n.value);
    }).processSync(selector);
  } catch {}
  return out;
}

/** Convert one page's class rules into Tailwind utilities wherever the result renders identically. */
export function convertPage(
  page: TailwindPageInput,
  compiler: TailwindCompiler,
  siteTwVars: Set<string>,
): TailwindPageResult {
  const model = cssModel(page.css);
  const tree = pageTree(page.body, page.htmlAttrs, page.bodyAttrs);
  const [htmlEl] = tree.root.children as Element[];
  const bodyEl = htmlEl.children[0] as Element;
  const rootClasses = new Set([...classesOf(htmlEl), ...classesOf(bodyEl)]);
  const elements = tree.elements.filter((el) => el !== htmlEl && el !== bodyEl);

  // ---------------------------------------------------- convertible rules
  const plans: Plan[] = [];
  const blockedClass = (cls: string) => page.toggled.has(cls) || rootClasses.has(cls);

  // Sites built with Tailwind: keep a class wherever Tailwind regenerates its rule exactly.
  const ownRules = new Set<StyleRule>();
  if (compiler.theme) {
    const tries = model.rules
      .filter((r) => !r.blocked && r.decls.length && !r.layer?.includes('.') && r.selectors.length === 1)
      .flatMap((rule) =>
        // Toggled classes are fine here: the class stays in the markup and its rule is regenerated as-is.
        rightmostClasses(rule.selectors[0])
          .filter((cls) => !rootClasses.has(cls))
          .map((cls) => ({ rule, cls })),
      );
    const names = [...new Set(tries.map((t) => t.cls))];
    const compiledOwn = compiler.css(names);
    const ownCss = new Map(names.map((c, i) => [c, compiledOwn[i]]));
    for (const { rule, cls } of tries) {
      if (ownRules.has(rule)) continue;
      const utility = verifyRule(cls, ownCss.get(cls) ?? null, {
        selector: rule.selectors[0],
        conditions: rule.conditions,
        decls: rule.decls,
      });
      if (!utility) continue;
      ownRules.add(rule);
      plans.push({ rule, compounds: [], chosen: new Map(), own: { cls, utility } });
    }
  }

  const pending: { plan: Plan; key: string; cands: string[]; exp: Parameters<typeof verify>[2] }[] = [];
  for (const rule of model.rules) {
    if (ownRules.has(rule) || rule.blocked || !rule.decls.length || rule.layer?.includes('.')) continue;
    if (new Set(rule.decls.map((d) => d.prop)).size !== rule.decls.length) continue;
    const compounds = rule.selectors.map(compound);
    if (compounds.some((c) => !c || c.classes.some(blockedClass))) continue;
    const plan: Plan = { rule, compounds: compounds as Compound[], chosen: new Map() };
    const mine: typeof pending = [];
    let ok = true;
    plan.compounds.forEach((c, si) => {
      const prefixes = variantPrefixes(rule.conditions, c.states);
      for (const d of rule.decls) {
        const bases = declCandidates(d.prop, d.value);
        if (!prefixes.length || !bases.length) ok = false;
        const cands = prefixes.flatMap((p) => bases.map((b) => `${p}${b}${d.important ? '!' : ''}`));
        mine.push({
          plan,
          key: `${si}:${d.index}`,
          cands,
          exp: { prop: d.prop, value: d.value, important: d.important, states: c.states, conditions: rule.conditions },
        });
      }
    });
    if (!ok) continue;
    plans.push(plan);
    pending.push(...mine);
  }

  const all = [...new Set(pending.flatMap((p) => p.cands))];
  const compiled = compiler.css(all);
  const css = new Map(all.map((c, i) => [c, compiled[i]]));
  for (const p of pending) {
    const pick = p.cands
      .map((c) => verify(c, css.get(c) ?? null, p.exp))
      .find((v) => v && !v.twVars.some((t) => siteTwVars.has(t)));
    if (pick) p.plan.chosen.set(p.key, pick);
  }
  const verified = plans.filter(
    (plan) => plan.own || pending.filter((p) => p.plan === plan).every((p) => plan.chosen.has(p.key)),
  );
  const order = compiler.order([
    ...new Set(verified.flatMap((p) => (p.own ? [p.own.cls] : [...p.chosen.values()].map((v) => v.candidate)))),
  ]);

  // ------------------------------------------------- entries per element
  const byClass = new Map<string, Plan[]>();
  for (const plan of verified) {
    if (plan.own) {
      byClass.set(plan.own.cls, [...(byClass.get(plan.own.cls) ?? []), plan]);
      continue;
    }
    for (const c of plan.compounds) {
      const list = byClass.get(c.classes[0]) ?? [];
      if (!list.includes(plan)) list.push(plan);
      byClass.set(c.classes[0], list);
    }
  }
  const entries = new Map<Element, Entry[]>();
  const ambiguous = new Set<Plan>();
  for (const el of elements) {
    const classes = classesOf(el);
    const seen = new Set<Plan>();
    const list: Entry[] = [];
    for (const cls of classes) {
      for (const plan of byClass.get(cls) ?? []) {
        if (seen.has(plan)) continue;
        seen.add(plan);
        if (plan.own) {
          // Same selector before and after, so it matches exactly the same elements.
          const sel = plan.rule.selectors[0];
          const variantKey = `own ${sel}|${plan.rule.conditions.map((c) => `${c.name} ${normMedia(c.params)}`).join('&')}`;
          for (const d of plan.rule.decls)
            list.push({
              plan,
              decl: d,
              utility: plan.own.utility,
              prec: {
                important: d.important,
                layer: plan.rule.layer,
                spec: specificity(sel),
                index: plan.rule.index,
                decl: d.index,
              },
              family: family(d.prop),
              variantKey,
            });
          continue;
        }
        const hits = plan.compounds.map((c, si) => ({ c, si })).filter(({ c }) => matches(c, el, classes));
        if (!hits.length) continue;
        if (new Set(hits.map(({ c }) => c.states.toSorted().join())).size > 1) {
          ambiguous.add(plan);
          continue;
        }
        const best = hits.reduce((a, b) =>
          (specificity(plan.rule.selectors[b.si]) ?? 0) > (specificity(plan.rule.selectors[a.si]) ?? 0) ? b : a,
        );
        const spec = specificity(plan.rule.selectors[best.si]);
        const variantKey = `${plan.rule.conditions.map((c) => `${c.name} ${normMedia(c.params)}`).join('&')}|${best.c.states.toSorted().join()}`;
        for (const d of plan.rule.decls) {
          list.push({
            plan,
            decl: d,
            utility: plan.chosen.get(`${best.si}:${d.index}`)!,
            prec: { important: d.important, layer: plan.rule.layer, spec, index: plan.rule.index, decl: d.index },
            family: family(d.prop),
            variantKey,
          });
        }
      }
    }
    if (list.length) entries.set(el, list);
  }

  // ------------------------------------- keep only cascade-safe conversions
  const converted = new Set(verified.filter((p) => !ambiguous.has(p)));
  const usedPlans = new Set([...entries.values()].flat().map((e) => e.plan));
  for (const p of converted) if (!usedPlans.has(p)) converted.delete(p);
  const matcherCache = new Map<string, Matcher | null>();

  for (;;) {
    const convertedRules = new Set([...converted].map((p) => p.rule));
    const index = residualIndex(
      model.rules.filter((r) => !convertedRules.has(r)),
      tree,
      matcherCache,
    );
    const contested = new Set<Plan>();
    for (const [el, list] of entries) {
      const live = list.filter((e) => converted.has(e.plan));
      if (!live.length) continue;
      const families = new Set(live.map((e) => e.family));
      // Against CSS that stays: our utilities sit in a later layer than every site rule.
      for (const r of residualFor(el, index)) {
        for (const d of r.rule.decls) {
          const fam = family(d.prop);
          if (!families.has(fam) && !families.has('all') && fam !== 'all') continue;
          const rp: Prec = {
            important: d.important,
            layer: r.rule.layer,
            spec: r.spec,
            index: r.rule.index,
            decl: d.index,
          };
          for (const e of live) {
            if (!overlaps(e.decl.prop, d.prop)) continue;
            const orig = compareOrig(e.prec, rp, model.layers);
            const out = e.decl.important === d.important ? (e.decl.important ? -1 : 1) : e.decl.important ? 1 : -1;
            if (orig === null || Math.sign(orig) !== out) contested.add(e.plan);
          }
        }
      }
      // Between utilities on the same element: Tailwind's order must agree with the original cascade.
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          // A rule regenerated as-is keeps its declarations in their original order.
          if (a.plan === b.plan && a.plan.own) continue;
          if (!overlaps(a.decl.prop, b.decl.prop)) continue;
          // Same property in the same situation: the loser is simply not emitted (own classes always are).
          if (a.decl.prop === b.decl.prop && a.variantKey === b.variantKey && !a.plan.own && !b.plan.own) continue;
          const orig = compareOrig(a.prec, b.prec, model.layers);
          const out = compareOut(a, b, order);
          if (orig === null || Math.sign(orig) !== Math.sign(out)) {
            contested.add(a.plan);
            contested.add(b.plan);
          }
        }
      }
    }
    if (!contested.size) break;
    for (const p of contested) converted.delete(p);
  }

  // ------------------------------------------------------------- apply
  const convertedRules = new Set([...converted].map((p) => p.rule));
  const residualRules = model.rules.filter((r) => !convertedRules.has(r));
  const referenced = new Set<string>();
  for (const r of residualRules) for (const s of r.selectors) classNames(s).forEach((c) => referenced.add(c));
  const ownClasses = new Set([...converted].flatMap((p) => (p.own ? [p.own.cls] : [])));
  // Regenerated rules keep their selectors, so every class they name (`group` in
  // `group-hover:…`) must stay as it is, even though no leftover CSS mentions it.
  const ownRefs = new Set([...converted].flatMap((p) => (p.own ? p.rule.selectors.flatMap(classNames) : [])));
  const keep = (cls: string) => ownClasses.has(cls) || ownRefs.has(cls) || referenced.has(cls) || page.toggled.has(cls);

  const renameCandidates = new Set(
    [...referenced, ...page.toggled, ...rootClasses].filter((c) => !ownClasses.has(c) && !ownRefs.has(c)),
  );
  const renames = renameMap(renameCandidates, compiler);
  const rename = (cls: string) => renames.get(cls) ?? cls;

  const used = new Set<string>();
  let declarations = 0;
  let touched = 0;
  for (const el of elements) {
    const live = (entries.get(el) ?? []).filter((e) => converted.has(e.plan));
    const original = classesOf(el);
    const winners = new Map<string, Entry>();
    for (const e of live) {
      if (e.plan.own) continue;
      const key = `${e.decl.prop}|${e.variantKey}`;
      const prev = winners.get(key);
      if (!prev || (compareOrig(e.prec, prev.prec, model.layers) ?? 0) > 0) winners.set(key, e);
    }
    const utilities = [...new Set([...winners.values()].map((e) => e.utility.candidate))].toSorted((a, b) =>
      cmpBig(order.get(a), order.get(b)),
    );
    const kept = original.filter(keep).map(rename);
    const next = [...kept, ...utilities.filter((u) => !kept.includes(u))];
    const owned = original.filter((c) => ownClasses.has(c));
    owned.forEach((c) => used.add(c));
    declarations += live.filter((e) => e.plan.own).length;
    if (next.join(' ') === original.join(' ')) {
      if (owned.length) touched++;
      continue;
    }
    if (live.length) touched++;
    declarations += winners.size;
    utilities.forEach((u) => used.add(u));
    if (next.length) el.properties.className = next;
    else delete el.properties.className;
  }

  for (const r of convertedRules) r.node.remove();
  pruneEmpty(model.root);
  if (renames.size) model.root.walkRules((rule) => void (rule.selector = renameSelector(rule.selector, renames)));
  const layers = layerize(model.root);

  const renameAttrs = (attrs: [string, string][]) =>
    attrs.map(([k, v]): [string, string] => [
      k,
      k === 'class' ? v.split(/\s+/).filter(Boolean).map(rename).join(' ') : v,
    ]);

  return {
    css: model.root,
    layers,
    classes: used,
    renames,
    htmlAttrs: renameAttrs(page.htmlAttrs),
    bodyAttrs: renameAttrs(page.bodyAttrs),
    stats: { rules: model.rules.length, converted: convertedRules.size, declarations, elements: touched },
  };
}

const cmpBig = (a: bigint | undefined, b: bigint | undefined) => (a === b ? 0 : (a ?? -1n) < (b ?? -1n) ? -1 : 1);

/** > 0 when utility `a` wins over utility `b` in the generated CSS. */
function compareOut(a: Entry, b: Entry, order: Map<string, bigint>): number {
  if (a.decl.important !== b.decl.important) return a.decl.important ? 1 : -1;
  if (a.utility.specificity !== b.utility.specificity) return a.utility.specificity - b.utility.specificity;
  return cmpBig(order.get(a.utility.candidate), order.get(b.utility.candidate));
}

function residualIndex(rules: StyleRule[], tree: Tree, cache: Map<string, Matcher | null>) {
  const index = new Map<string, ResidualSelector[]>();
  for (const rule of rules) {
    if (!rule.decls.length) continue;
    for (const sel of rule.selectors) {
      let m = cache.get(sel);
      if (m === undefined) {
        m = matcher(sel, tree);
        cache.set(sel, m);
      }
      if (!m) continue;
      // Nested rules: their selector is relative, so assume it can match anything.
      const key = rule.blocked === 'nested rule' ? '*' : rightmostKey(sel);
      const match = rule.blocked === 'nested rule' ? () => true : m;
      const list = index.get(key) ?? [];
      list.push({ rule, match, spec: rule.blocked === 'nested rule' ? null : specificity(sel) });
      index.set(key, list);
    }
  }
  return index;
}

/** Residual rules that can match `el`, with the highest specificity among their matching selectors. */
function residualFor(el: Element, index: Map<string, ResidualSelector[]>) {
  const keys = ['*', el.tagName.toLowerCase(), ...classesOf(el).map((c) => `.${c}`)];
  if (typeof el.properties.id === 'string') keys.push(`#${el.properties.id}`);
  const out = new Map<StyleRule, number | null>();
  for (const key of keys) {
    for (const r of index.get(key) ?? []) {
      if (!r.match(el)) continue;
      const prev = out.get(r.rule);
      out.set(r.rule, prev === undefined ? r.spec : prev === null || r.spec === null ? null : Math.max(prev, r.spec));
    }
  }
  return [...out].map(([rule, spec]) => ({ rule, spec }));
}

/** Class names a selector mentions. Unparseable selectors fall back to a scan of the raw text. */
function classNames(selector: string): string[] {
  const out: string[] = [];
  try {
    selectorParser((root) => root.walkClasses((c) => void out.push(c.value))).processSync(selector);
  } catch {
    for (const m of selector.matchAll(/\.((?:\\.|[\w-])+)/g)) out.push(m[1].replace(/\\(.)/g, '$1'));
  }
  return out;
}

/** Rename classes in a selector (raw-text replacement of the escaped class when it can't be parsed). */
function renameSelector(selector: string, renames: Map<string, string>): string {
  try {
    return selectorParser((root) =>
      root.walkClasses((c) => {
        const to = renames.get(c.value);
        if (to) c.value = to;
      }),
    ).processSync(selector);
  } catch {
    let out = selector;
    for (const [from, to] of renames) {
      const escaped = selectorParser.className({ value: from }).toString();
      out = out.replace(new RegExp(`${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), `.${to}`);
    }
    return out;
  }
}

/** Kept classes Tailwind would generate CSS for (`container`, `hidden`, `md:flex`) get a site- prefix. */
function renameMap(classes: Set<string>, compiler: TailwindCompiler): Map<string, string> {
  const list = [...classes];
  const css = compiler.css(list);
  const out = new Map<string, string>();
  const taken = new Set(classes);
  list.forEach((cls, i) => {
    if (css[i] === null) return;
    const base = `site-${cls.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '')}`;
    let name = base;
    for (let n = 2; taken.has(name) || compiler.isCandidate(name); n++) name = `${base}-${n}`;
    taken.add(name);
    out.set(cls, name);
  });
  return out;
}

function pruneEmpty(root: CssRoot) {
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules((at) => {
      if (at.nodes && at.nodes.length === 0) {
        at.remove();
        changed = true;
      }
    });
  }
}

const TOP_LEVEL_ONLY = /^(charset|import|namespace)$/i;
const NOT_CASCADED = /keyframes$|^(font-face|property|counter-style|page|font-feature-values|font-palette-values)$/i;

const hasLayer = (node: ChildNode): boolean =>
  node.type === 'atrule' && (node.name.toLowerCase() === 'layer' || !!node.nodes?.some(hasLayer));

/**
 * Put the whole stylesheet into cascade layers below Tailwind's: the site's
 * layers get a prefix (so they can't merge with Tailwind's `base` or
 * `utilities`), anonymous layers get names, and unlayered rules go into a last
 * site layer. Unlayered CSS behaves exactly like such a final layer, so the
 * site's own cascade is unchanged.
 */
function layerize(root: CssRoot): string[] {
  const order: string[] = [];
  const add = (name: string) => {
    if (!order.includes(name)) order.push(name);
  };
  let anon = 0;
  const visit = (node: Container, inLayer: boolean) => {
    node.each((child) => {
      if (child.type !== 'atrule') return;
      const name = child.name.toLowerCase();
      if (name === 'import' && !inLayer) {
        if (/\blayer\(/i.test(child.params))
          child.params = child.params.replace(
            /\blayer\(([^)]*)\)/i,
            (_, l: string) => `layer(${LAYER_PREFIX}${l.trim()})`,
          );
        else if (/\blayer\b/i.test(child.params))
          child.params = child.params.replace(/\blayer\b/i, `layer(${LAYER_PREFIX}anon${anon++})`);
        else child.params = `${child.params} layer(${UNLAYERED})`;
        const m = /layer\(([^).]*)/.exec(child.params);
        if (m) add(m[1]);
        return;
      }
      if (name === 'layer' && !inLayer) {
        const names = child.params
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const renamed = (names.length ? names : [`anon${anon++}`]).map((n) => `${LAYER_PREFIX}${n}`);
        child.params = renamed.join(', ');
        renamed.forEach((n) => add(n.split('.')[0]));
        if (child.nodes) visit(child, true);
        return;
      }
      if (child.nodes) visit(child, inLayer || name === 'layer');
    });
  };
  visit(root, false);

  const wrap = (container: Container) => {
    let group: AtRule | null = null;
    // A copy: wrapping moves nodes out of the container while iterating.
    for (const child of container.nodes?.slice() ?? []) {
      const isAt = child.type === 'atrule';
      const name = isAt ? (child as AtRule).name.toLowerCase() : '';
      if (
        child.type === 'comment' ||
        (isAt && (name === 'layer' || TOP_LEVEL_ONLY.test(name) || NOT_CASCADED.test(name)))
      ) {
        group = null;
        continue;
      }
      if (isAt && hasLayer(child)) {
        group = null;
        wrap(child as AtRule);
        continue;
      }
      if (!group) {
        group = atRule({ name: 'layer', params: UNLAYERED });
        child.before(group);
      }
      group.append(child);
    }
  };
  wrap(root);
  add(UNLAYERED);
  return order;
}
