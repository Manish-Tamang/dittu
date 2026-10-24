import type { Element, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toEstree } from 'hast-util-to-estree';
import { jsx, toJs } from 'estree-util-to-js';
import type * as ESTree from 'estree-jsx';
import { format } from 'prettier';
import { find, html, svg } from 'property-information';
import styleToJs from 'style-to-js';
import {
  EACH,
  IR_TAGS,
  LOOP,
  MAP,
  SLOT,
  SLOT_RE,
  STYLE_SLOT,
  USE,
  isComponentRef,
  type ComponentDef,
  type PropDef,
  type PropType,
  type PropValue,
} from '../reconstruct/ir.js';
import { collectionNames } from '../reconstruct/naming.js';

/** What a converted tree needs from the file it lands in. */
export interface JsxContext {
  components: Map<string, ComponentDef>;
  /** Components referenced (to import). */
  used: Set<string>;
  /** Data arrays rendered with .map(), declared at the top of the file (typed by `component`'s props, or by `type` for inline loops). */
  consts: { name: string; component?: string; type?: PropType; items: PropValue[] }[];
  /** The `css()` helper (typed style objects with custom properties) is used. */
  needsCss: boolean;
  /** Wrap style objects with custom properties in css() (TSX only; Astro takes plain objects). */
  cssHelper: boolean;
  constNames: Set<string>;
}

export const newJsxContext = (components: Map<string, ComponentDef>, cssHelper = true): JsxContext => ({
  components,
  used: new Set(),
  consts: [],
  needsCss: false,
  cssHelper,
  constNames: new Set(),
});

type Expr = ESTree.Expression;
type Child = ESTree.JSXElement['children'][number];

/** Props React's types declare as numbers (HTML has them as strings). */
const NUMERIC_PROPS = new Set([
  'tabIndex',
  'colSpan',
  'rowSpan',
  'span',
  'cols',
  'rows',
  'size',
  'maxLength',
  'minLength',
  'marginHeight',
  'marginWidth',
  'start',
  'high',
  'low',
  'optimum',
]);

const SAFE_TEXT = /^[^\s{}<>&"'`\\]([^{}<>&\n\\]*[^\s{}<>&\\])?$/;
const LOOP_INDEX = ['i', 'j', 'k', 'l'];

// ------------------------------------------------------------ estree helpers
const id = (name: string): ESTree.Identifier => ({ type: 'Identifier', name });
const lit = (value: string): ESTree.Literal => ({ type: 'Literal', value });

function pathExpr(path: string): Expr {
  const [head, ...rest] = path.split('.');
  return rest.reduce<Expr>(
    (object, prop) => ({ type: 'MemberExpression', object, property: id(prop), computed: false, optional: false }),
    id(head),
  );
}

function jsxName(name: string): ESTree.JSXIdentifier | ESTree.JSXMemberExpression {
  const [head, ...rest] = name.split('.');
  return rest.reduce<ESTree.JSXIdentifier | ESTree.JSXMemberExpression>(
    (object, prop) => ({ type: 'JSXMemberExpression', object, property: { type: 'JSXIdentifier', name: prop } }),
    { type: 'JSXIdentifier', name: head },
  );
}

const container = (expression: Expr): ESTree.JSXExpressionContainer => ({ type: 'JSXExpressionContainer', expression });

function attr(name: string, value: Expr | string | null): ESTree.JSXAttribute {
  let v: ESTree.JSXAttribute['value'] = null;
  if (typeof value === 'string') {
    // JSX attribute strings can't hold quotes/backslashes and decode entities: use an expression then.
    v = /["\\\n&{}]/.test(value)
      ? container(lit(value))
      : ({ type: 'Literal', value, raw: JSON.stringify(value) } as ESTree.Literal);
  } else if (value) v = container(value);
  return { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name }, value: v };
}

const spread = (argument: Expr): ESTree.JSXSpreadAttribute => ({ type: 'JSXSpreadAttribute', argument });

function element(
  name: string,
  attributes: ESTree.JSXElement['openingElement']['attributes'],
  children: Child[] = [],
): ESTree.JSXElement {
  const n = jsxName(name);
  return {
    type: 'JSXElement',
    openingElement: { type: 'JSXOpeningElement', name: n, attributes, selfClosing: !children.length },
    closingElement: children.length ? { type: 'JSXClosingElement', name: n } : null,
    children,
  };
}

function arrow(params: string[], body: Expr): ESTree.ArrowFunctionExpression {
  return {
    type: 'ArrowFunctionExpression',
    params: params.map(id),
    body,
    expression: true,
    async: false,
    generator: false,
  } as ESTree.ArrowFunctionExpression;
}

function mapCall(list: Expr, params: string[], body: Expr): Expr {
  return {
    type: 'CallExpression',
    callee: { type: 'MemberExpression', object: list, property: id('map'), computed: false, optional: false },
    arguments: [arrow(params, body)],
    optional: false,
  };
}

const objectKey = (k: string): ESTree.Identifier | ESTree.Literal => (/^[A-Za-z_$][\w$]*$/.test(k) ? id(k) : lit(k));

function objectExpr(entries: [string, Expr][]): ESTree.ObjectExpression {
  return {
    type: 'ObjectExpression',
    properties: entries.map(([k, value]) => ({
      type: 'Property',
      key: objectKey(k),
      value,
      kind: 'init',
      computed: false,
      method: false,
      shorthand: false,
    })),
  };
}

/** `{ "--x": "1", color: "red" }` — wrapped in css() when it has custom properties (React's types reject those). */
function styleExpr(cssText: string, ctx: JsxContext): Expr {
  const obj = styleToJs(cssText, { reactCompat: true }) as Record<string, string>;
  const expr = objectExpr(Object.entries(obj).map(([k, v]) => [k, lit(String(v))]));
  if (!ctx.cssHelper || !Object.keys(obj).some((k) => k.startsWith('--'))) return expr;
  ctx.needsCss = true;
  return { type: 'CallExpression', callee: id('css'), arguments: [expr], optional: false };
}

/** A prop value as an expression, typed by its prop definition (style strings → objects, component refs → identifiers). */
export function valueExpr(value: PropValue, type: PropType | undefined, ctx: JsxContext): Expr {
  if (isComponentRef(value)) {
    ctx.used.add(value.$component);
    return id(value.$component);
  }
  if (typeof value === 'string') return type?.kind === 'style' ? styleExpr(value, ctx) : lit(value);
  if (Array.isArray(value)) {
    const itemType: PropType | undefined =
      type?.kind === 'list'
        ? type.item === 'string'
          ? { kind: 'string' }
          : { kind: 'list', item: type.item }
        : undefined;
    return {
      type: 'ArrayExpression',
      elements: value.map((v) =>
        itemType?.kind === 'list' && !Array.isArray(v)
          ? objectValue(v as Record<string, PropValue>, itemType.item as PropDef[], ctx)
          : valueExpr(v, itemType, ctx),
      ),
    };
  }
  return objectValue(value, undefined, ctx);
}

function objectValue(value: Record<string, PropValue>, defs: PropDef[] | undefined, ctx: JsxContext): Expr {
  return objectExpr(
    Object.entries(value).map(([k, v]) => [k, valueExpr(v, defs?.find((d) => d.name === k)?.type, ctx)]),
  );
}

/** Print an expression as source. */
export function printExpr(expr: Expr): string {
  const program: ESTree.Program = {
    type: 'Program',
    sourceType: 'module',
    body: [{ type: 'ExpressionStatement', expression: expr }],
  };
  return toJs(program, { handlers: jsx }).value.replace(/;\s*$/, '');
}

// ------------------------------------------------------------ hast preparation

/**
 * Attributes React/TypeScript don't know (e.g. `jsaction`) are collected into
 * `dataDittuRaw` and emitted as `{...{ "jsaction": "…" }}`, which TypeScript accepts.
 */
function prepare(node: Root | Element, inSvg = false) {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (!IR_TAGS.has(c.tagName)) {
      const schema = inSvg || c.tagName === 'svg' ? svg : html;
      const raw: Record<string, string> = {};
      for (const [key, value] of Object.entries(c.properties)) {
        if (key === STYLE_SLOT || key.startsWith('data') || key.startsWith('aria')) continue;
        const info = find(schema, key);
        if (info.defined) continue;
        raw[info.attribute] = Array.isArray(value) ? value.join(' ') : String(value);
        delete c.properties[key];
      }
      if (Object.keys(raw).length) c.properties.dataDittuRaw = JSON.stringify(raw);
    }
    prepare(c, inSvg || c.tagName === 'svg');
  }
}

// ------------------------------------------------------------ IR → JSX

const attrNameOf = (a: ESTree.JSXAttribute | ESTree.JSXSpreadAttribute) =>
  a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' ? a.name.name : null;

const attrValue = (a: ESTree.JSXAttribute | ESTree.JSXSpreadAttribute): string =>
  a.type === 'JSXAttribute' && a.value?.type === 'Literal' ? String(a.value.value) : '';

function elementName(el: ESTree.JSXElement): string | null {
  const n = el.openingElement.name;
  return n.type === 'JSXIdentifier' ? n.name : null;
}

class Converter {
  constructor(
    private ctx: JsxContext,
    /** Top-level component-kind props are destructured with a capitalized alias (`icon: Icon`). */
    private componentAliases: Map<string, string>,
  ) {}

  child(c: Child, depth: number): Child {
    if (c.type === 'JSXElement') return this.element(c, depth);
    if (c.type === 'JSXFragment') {
      c.children = c.children.map((x) => this.child(x, depth));
      return c;
    }
    if (
      c.type === 'JSXExpressionContainer' &&
      c.expression.type === 'Literal' &&
      typeof c.expression.value === 'string'
    ) {
      const v = c.expression.value;
      if (SAFE_TEXT.test(v)) return { type: 'JSXText', value: v, raw: v };
    }
    return c;
  }

  element(el: ESTree.JSXElement, depth: number): Child {
    const name = elementName(el);
    const attrs = el.openingElement.attributes;
    const get = (n: string) => {
      const a = attrs.find((x) => attrNameOf(x) === n);
      return a ? attrValue(a) : undefined;
    };

    if (name === SLOT) return container(pathExpr(get('data-path')!));

    if (name === EACH) {
      const index = LOOP_INDEX[depth] ?? `i${depth}`;
      const item = get('data-item')!;
      const inner = el.children.find((c) => c.type === 'JSXElement') as ESTree.JSXElement;
      const body = this.element(inner, depth + 1) as ESTree.JSXElement;
      if (body.type === 'JSXElement') body.openingElement.attributes.unshift(attr('key', id(index)));
      return container(mapCall(pathExpr(get('data-path')!), [item, index], body));
    }

    if (name === LOOP) {
      const constName = this.constName(get('data-var')!);
      this.ctx.consts.push({
        name: constName,
        type: JSON.parse(get('data-type')!) as PropType,
        items: JSON.parse(get('data-items')!) as PropValue[],
      });
      const index = LOOP_INDEX[depth] ?? `i${depth}`;
      const inner = el.children.find((c) => c.type === 'JSXElement') as ESTree.JSXElement;
      const body = this.element(inner, depth + 1) as ESTree.JSXElement;
      if (body.type === 'JSXElement') body.openingElement.attributes.unshift(attr('key', id(index)));
      return container(mapCall(id(constName), [get('data-item')!, index], body));
    }

    if (name === MAP) {
      const component = get('data-component')!;
      this.ctx.used.add(component);
      const constName = this.constName(get('data-var')!);
      this.ctx.consts.push({ name: constName, component, items: JSON.parse(get('data-items')!) as PropValue[] });
      const index = LOOP_INDEX[depth] ?? `i${depth}`;
      const item = collectionNames(component).item;
      const use = element(component, [attr('key', id(index)), spread(id(item))]);
      return container(mapCall(id(constName), [item, index], use));
    }

    if (name === USE) {
      const slot = get('data-slot');
      const component = slot ? (this.componentAliases.get(slot) ?? slot) : get('data-component')!;
      if (!slot) this.ctx.used.add(component);
      const def = slot ? undefined : this.ctx.components.get(component);
      const props = JSON.parse(get('data-props') ?? '{}') as Record<string, PropValue>;
      const out: ESTree.JSXElement['openingElement']['attributes'] = [];
      for (const a of attrs) {
        const n = attrNameOf(a);
        if (n === 'data-slot' || n === 'data-component' || n === 'data-props') continue;
        out.push(...this.attribute(a));
      }
      for (const [k, v] of Object.entries(props)) {
        const type = def?.props.find((p) => p.name === k)?.type;
        out.push(typeof v === 'string' && type?.kind !== 'style' ? attr(k, v) : attr(k, valueExpr(v, type, this.ctx)));
      }
      return element(component, out);
    }

    el.openingElement.attributes = attrs.flatMap((a) => this.attribute(a));
    // Static markup: uncontrolled form fields, otherwise React warns and locks them.
    if (name === 'input' || name === 'select' || name === 'textarea') {
      for (const a of el.openingElement.attributes) {
        if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') continue;
        if (a.name.name === 'value') a.name.name = 'defaultValue';
        if (a.name.name === 'checked') a.name.name = 'defaultChecked';
      }
    }
    if (name === 'textarea' && el.children.length) {
      const text = el.children
        .map((c) =>
          c.type === 'JSXExpressionContainer' && c.expression.type === 'Literal' ? String(c.expression.value) : '',
        )
        .join('');
      el.openingElement.attributes.push(attr('defaultValue', lit(text)));
      el.children = [];
      el.openingElement.selfClosing = true;
      el.closingElement = null;
    }
    el.children = el.children.map((c) => this.child(c, depth));
    return el;
  }

  constName(base: string): string {
    let name = base;
    for (let n = 2; this.ctx.constNames.has(name); n++) name = `${base}${n}`;
    this.ctx.constNames.add(name);
    return name;
  }

  attribute(a: ESTree.JSXAttribute | ESTree.JSXSpreadAttribute): (ESTree.JSXAttribute | ESTree.JSXSpreadAttribute)[] {
    const n = attrNameOf(a);
    if (a.type !== 'JSXAttribute' || !n) return [a];
    if (n === 'data-dittu-raw') {
      const raw = JSON.parse(attrValue(a)) as Record<string, string>;
      return [spread(objectExpr(Object.entries(raw).map(([k, v]) => [k, lit(v)])))];
    }
    if (n === 'data-dittu-style-slot') return [attr('style', pathExpr(attrValue(a)))];
    if (n === 'data-dittu-spread-props') return [spread(id('props'))];
    if (a.value?.type === 'Literal' && typeof a.value.value === 'string') {
      const m = SLOT_RE.exec(a.value.value);
      if (m) return [attr(n, pathExpr(m[1]))];
      const num = Number(a.value.value);
      if (NUMERIC_PROPS.has(n) && a.value.value.trim() !== '' && Number.isFinite(num)) {
        return [attr(n, { type: 'Literal', value: num } as ESTree.Literal)];
      }
    }
    // style objects with custom properties → css({...})
    if (n === 'style' && a.value?.type === 'JSXExpressionContainer' && a.value.expression.type === 'ObjectExpression') {
      const keys = a.value.expression.properties.map((p) =>
        p.type === 'Property'
          ? p.key.type === 'Identifier'
            ? p.key.name
            : String((p.key as ESTree.Literal).value)
          : '',
      );
      if (keys.some((k) => k.startsWith('--'))) {
        this.ctx.needsCss = true;
        a.value.expression = {
          type: 'CallExpression',
          callee: id('css'),
          arguments: [a.value.expression],
          optional: false,
        };
      }
    }
    return [a];
  }
}

/** hast (with IR nodes) → JSX expression source. */
export function toJsx(tree: Root | Element, ctx: JsxContext, componentAliases = new Map<string, string>()): string {
  const copy = structuredClone(tree);
  const root: Root = copy.type === 'root' ? copy : { type: 'root', children: [copy] };
  prepare(root);
  const program = toEstree(root, { elementAttributeNameCase: 'react', stylePropertyNameCase: 'dom' });
  const stmt = program.body[0] as ESTree.ExpressionStatement | undefined;
  if (!stmt) return 'null';
  let expr = stmt.expression as ESTree.JSXFragment | ESTree.JSXElement;
  if (expr.type === 'JSXFragment') {
    const meaningful = expr.children.filter(
      (c) =>
        !(c.type === 'JSXExpressionContainer' && c.expression.type === 'Literal' && !String(c.expression.value).trim()),
    );
    if (meaningful.length === 1 && meaningful[0].type === 'JSXElement') expr = meaningful[0];
  }
  const converter = new Converter(ctx, componentAliases);
  const out = converter.child(expr, 0);
  // A top-level IR node (e.g. a lone .map()) still needs a JSX parent.
  const final: Expr =
    out.type === 'JSXExpressionContainer'
      ? ({
          type: 'JSXFragment',
          openingFragment: { type: 'JSXOpeningFragment' },
          closingFragment: { type: 'JSXClosingFragment' },
          children: [out],
        } as ESTree.JSXFragment as unknown as Expr)
      : (out as unknown as Expr);
  return printExpr(final);
}

export async function formatCode(code: string, parser: 'babel' | 'typescript' | 'html' | 'css'): Promise<string> {
  try {
    return await format(code, {
      parser,
      printWidth: 100,
      singleQuote: false,
      // Never add or remove whitespace that could change rendering.
      htmlWhitespaceSensitivity: 'strict',
    });
  } catch {
    return code;
  }
}

/** JSX attribute source for a list of [name, value] HTML attributes (e.g. on <html>/<body>). */
export function jsxAttributes(attrs: [string, string][]): string {
  if (!attrs.length) return '';
  // Round-trip through the HTML parser + estree conversion for correct React prop names.
  const htmlAttrs = attrs.map(([k, v]) => `${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join(' ');
  const parsed = fromHtml(`<div ${htmlAttrs}></div>`, { fragment: true });
  const code = toJsx(parsed, newJsxContext(new Map()));
  return code.replace(/^<div\s*/, ' ').replace(/\s*\/>$|\s*><\/div>$/, '');
}
