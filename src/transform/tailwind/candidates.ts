// Candidate Tailwind classes for one CSS declaration. Every candidate is later
// compiled and kept only if it produces exactly the original declaration, so a
// wrong guess here costs idiomatic output, never fidelity.
import type { Condition } from './cascade.js';

/** `url("/a.png")` → `url(/a.png)` when the URL needs no quotes (same value, cleaner class). */
export const unquoteUrls = (v: string) => v.replace(/url\(\s*(['"])([^'"()\s\\]*)\1\s*\)/gi, 'url($2)');

/** Encode a CSS value for use inside `[...]`: spaces become `_`, quotes become single. */
function encodeValue(value: string): string | null {
  let v = value.trim().replace(/\s+/g, ' ');
  if (!v || /[\\`]|revert-layer/i.test(v)) return null;
  v = unquoteUrls(v).replace(/"([^"']*)"/g, "'$1'");
  if (v.includes('"')) return null;
  // Underscores mean spaces in arbitrary values, except inside url().
  const parts = v.split(/(url\([^)]*\))/i);
  if (parts.some((p, i) => i % 2 === 1 && /\s/.test(p))) return null;
  return parts.map((p, i) => (i % 2 ? p : p.replace(/_/g, '\\_').replace(/ /g, '_'))).join('');
}

/** Arbitrary-value roots: CSS property → [utility, type hint for ambiguous roots]. */
const ROOTS: Record<string, [string, string?]> = {
  padding: ['p'],
  'padding-top': ['pt'],
  'padding-right': ['pr'],
  'padding-bottom': ['pb'],
  'padding-left': ['pl'],
  'padding-inline': ['px'],
  'padding-block': ['py'],
  'padding-inline-start': ['ps'],
  'padding-inline-end': ['pe'],
  margin: ['m'],
  'margin-top': ['mt'],
  'margin-right': ['mr'],
  'margin-bottom': ['mb'],
  'margin-left': ['ml'],
  'margin-inline': ['mx'],
  'margin-block': ['my'],
  'margin-inline-start': ['ms'],
  'margin-inline-end': ['me'],
  width: ['w'],
  height: ['h'],
  'min-width': ['min-w'],
  'max-width': ['max-w'],
  'min-height': ['min-h'],
  'max-height': ['max-h'],
  top: ['top'],
  right: ['right'],
  bottom: ['bottom'],
  left: ['left'],
  inset: ['inset'],
  gap: ['gap'],
  'row-gap': ['gap-y'],
  'column-gap': ['gap-x'],
  'z-index': ['z'],
  order: ['order'],
  opacity: ['opacity'],
  'font-size': ['text', 'length'],
  color: ['text', 'color'],
  'background-color': ['bg', 'color'],
  'background-image': ['bg', 'image'],
  'border-color': ['border', 'color'],
  'border-radius': ['rounded'],
  'border-top-left-radius': ['rounded-tl'],
  'border-top-right-radius': ['rounded-tr'],
  'border-bottom-right-radius': ['rounded-br'],
  'border-bottom-left-radius': ['rounded-bl'],
  'line-height': ['leading'],
  'letter-spacing': ['tracking'],
  'font-weight': ['font', 'number'],
  'font-family': ['font', 'family-name'],
  'grid-template-columns': ['grid-cols'],
  'grid-template-rows': ['grid-rows'],
  'grid-column': ['col'],
  'grid-row': ['row'],
  'flex-basis': ['basis'],
  flex: ['flex'],
  'flex-grow': ['grow'],
  'flex-shrink': ['shrink'],
  'aspect-ratio': ['aspect'],
  'text-indent': ['indent'],
  'outline-color': ['outline', 'color'],
  fill: ['fill'],
  stroke: ['stroke', 'color'],
  'transition-duration': ['duration'],
  'transition-delay': ['delay'],
  'transition-timing-function': ['ease'],
  'object-position': ['object'],
};

/** Keyword values with a named utility (verified at compile time like everything else). */
const KEYWORDS: Record<string, Record<string, string>> = {
  display: {
    block: 'block',
    'inline-block': 'inline-block',
    inline: 'inline',
    flex: 'flex',
    'inline-flex': 'inline-flex',
    grid: 'grid',
    'inline-grid': 'inline-grid',
    none: 'hidden',
    contents: 'contents',
    table: 'table',
    'table-row': 'table-row',
    'table-cell': 'table-cell',
    'flow-root': 'flow-root',
    'list-item': 'list-item',
  },
  position: { static: 'static', fixed: 'fixed', absolute: 'absolute', relative: 'relative', sticky: 'sticky' },
  'flex-direction': {
    row: 'flex-row',
    column: 'flex-col',
    'row-reverse': 'flex-row-reverse',
    'column-reverse': 'flex-col-reverse',
  },
  'flex-wrap': { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' },
  'text-align': {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
    justify: 'text-justify',
    start: 'text-start',
    end: 'text-end',
  },
  visibility: { visible: 'visible', hidden: 'invisible', collapse: 'collapse' },
  'text-transform': { uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  'text-decoration-line': { underline: 'underline', 'line-through': 'line-through', none: 'no-underline' },
  'pointer-events': { none: 'pointer-events-none', auto: 'pointer-events-auto' },
  'user-select': { none: 'select-none', text: 'select-text', all: 'select-all', auto: 'select-auto' },
  'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
  'list-style-type': { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' },
  'font-weight': {
    '100': 'font-thin',
    '200': 'font-extralight',
    '300': 'font-light',
    '400': 'font-normal',
    '500': 'font-medium',
    '600': 'font-semibold',
    '700': 'font-bold',
    '800': 'font-extrabold',
    '900': 'font-black',
  },
  'border-radius': {
    '0': 'rounded-none',
    '0.125rem': 'rounded-xs',
    '0.25rem': 'rounded-sm',
    '0.375rem': 'rounded-md',
    '0.5rem': 'rounded-lg',
    '0.75rem': 'rounded-xl',
    '1rem': 'rounded-2xl',
    '1.5rem': 'rounded-3xl',
    '2rem': 'rounded-4xl',
  },
  'flex-grow': { '1': 'grow', '0': 'grow-0' },
  'flex-shrink': { '1': 'shrink', '0': 'shrink-0' },
};

/** Roots whose keyword values become `${root}-${value}` (e.g. cursor-pointer, overflow-hidden). */
const PASSTHROUGH: Record<string, string> = {
  cursor: 'cursor',
  overflow: 'overflow',
  'overflow-x': 'overflow-x',
  'overflow-y': 'overflow-y',
  'white-space': 'whitespace',
  'object-fit': 'object',
  'word-break': 'break',
  'align-items': 'items',
  'align-self': 'self',
  'align-content': 'content',
  'justify-content': 'justify',
  'justify-items': 'justify-items',
  'justify-self': 'justify-self',
  'place-items': 'place-items',
  'place-content': 'place-content',
  'place-self': 'place-self',
  float: 'float',
  clear: 'clear',
  isolation: 'isolation',
  'mix-blend-mode': 'mix-blend',
  'table-layout': 'table',
  'border-collapse': 'border',
  resize: 'resize',
  appearance: 'appearance',
};

const ALIGN_ALIASES: Record<string, string> = {
  'flex-start': 'start',
  'flex-end': 'end',
  'space-between': 'between',
  'space-around': 'around',
  'space-evenly': 'evenly',
};

/** Properties whose rem values map onto the spacing scale (`1rem` → `p-4`). */
const SPACING = new Set([
  'p',
  'pt',
  'pr',
  'pb',
  'pl',
  'px',
  'py',
  'ps',
  'pe',
  'm',
  'mt',
  'mr',
  'mb',
  'ml',
  'mx',
  'my',
  'ms',
  'me',
  'w',
  'h',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'gap',
  'gap-x',
  'gap-y',
  'basis',
  'indent',
]);

function spacingName(root: string, value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v === '0' || v === '0px' || v === '0rem') return `${root}-0`;
  if (v === 'auto') return `${root}-auto`;
  if (v === '1px') return `${root}-px`;
  if (v === '100%') return `${root}-full`;
  const m = /^(-?)(\d*\.?\d+)rem$/.exec(v);
  if (!m) return null;
  const n = Number(m[2]) * 4;
  if (!Number.isFinite(n) || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return null;
  return `${m[1] ? '-' : ''}${root}-${Number(n.toFixed(2))}`;
}

const COLORS: Record<string, string> = {
  transparent: 'transparent',
  currentcolor: 'current',
  white: 'white',
  '#fff': 'white',
  '#ffffff': 'white',
  black: 'black',
  '#000': 'black',
  '#000000': 'black',
};

/** Base utilities (no variants) that could express `prop: value`, best first. */
export function declCandidates(prop: string, value: string): string[] {
  const out: string[] = [];
  const v = value.trim().toLowerCase();
  const kw = KEYWORDS[prop]?.[v];
  if (kw) out.push(kw);
  const pass = PASSTHROUGH[prop];
  if (pass && /^[a-z-]+$/.test(v)) out.push(`${pass}-${ALIGN_ALIASES[v] ?? v}`);
  const [root, hint] = ROOTS[prop] ?? [];
  if (root && SPACING.has(root)) {
    const name = spacingName(root, value);
    if (name) out.push(name);
  }
  if (root && hint === 'color' && COLORS[v]) out.push(`${root}-${COLORS[v]}`);
  if (prop === 'z-index' && /^-?\d+$/.test(v)) out.push(v.startsWith('-') ? `-z-${v.slice(1)}` : `z-${v}`);
  const enc = encodeValue(value);
  if (enc === null) return out;
  if (root) {
    out.push(`${root}-[${enc}]`);
    if (hint) out.push(`${root}-[${hint}:${enc}]`);
  }
  if (/^(--)?[a-z][a-z0-9-]*$/i.test(prop)) out.push(`[${prop}:${enc}]`);
  return out;
}

const NAMED_STATES: Record<string, string> = {
  ':hover': 'hover',
  ':focus': 'focus',
  ':focus-visible': 'focus-visible',
  ':focus-within': 'focus-within',
  ':active': 'active',
  ':visited': 'visited',
  ':disabled': 'disabled',
  ':enabled': 'enabled',
  ':checked': 'checked',
  ':first-child': 'first',
  ':last-child': 'last',
  ':only-child': 'only',
  ':first-of-type': 'first-of-type',
  ':last-of-type': 'last-of-type',
  ':empty': 'empty',
  ':target': 'target',
  ':required': 'required',
  ':invalid': 'invalid',
  ':valid': 'valid',
  ':read-only': 'read-only',
  ':placeholder-shown': 'placeholder-shown',
};

/** Pseudo-classes a converted rule may carry (as variants). */
export const STATE_PSEUDOS = new Set(Object.keys(NAMED_STATES));

const MIN_WIDTH = /^\(\s*min-width\s*:\s*(\d*\.?\d+(?:px|rem|em))\s*\)$/i;
const NAMED_MEDIA: Record<string, string> = {
  print: 'print',
  '(prefers-color-scheme:dark)': 'dark',
  '(prefers-reduced-motion:reduce)': 'motion-reduce',
  '(prefers-reduced-motion:no-preference)': 'motion-safe',
};

const arbitraryAtRule = (c: Condition) => {
  const enc = encodeValue(c.params);
  return enc === null ? null : `[@${c.name}_${enc}]:`;
};

/**
 * Variant prefixes for the enclosing conditions and pseudo-class states, as
 * alternatives (idiomatic first, then fully arbitrary). Empty when unsupported.
 */
export function variantPrefixes(conditions: Condition[], states: string[]): string[] {
  const idiomatic: string[] = [];
  const arbitrary: string[] = [];
  for (const c of conditions) {
    const arb = arbitraryAtRule(c);
    if (!arb) return [];
    arbitrary.push(arb);
    const params = c.params.trim().toLowerCase().replace(/\s+/g, '');
    const min = c.name === 'media' ? MIN_WIDTH.exec(c.params.trim()) : null;
    idiomatic.push(
      min ? `min-[${min[1]}]:` : c.name === 'media' && NAMED_MEDIA[params] ? `${NAMED_MEDIA[params]}:` : arb,
    );
  }
  for (const s of states) {
    const named = NAMED_STATES[s];
    if (!named) return [];
    idiomatic.push(`${named}:`);
    arbitrary.push(`[&${s}]:`);
  }
  const a = idiomatic.join('');
  const b = arbitrary.join('');
  return a === b ? [a] : [a, b];
}
