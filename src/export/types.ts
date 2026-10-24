import type { ComponentDef, PropDef, PropType } from '../reconstruct/ir.js';

/** TypeScript type for a prop. */
function tsType(type: PropType): string {
  switch (type.kind) {
    case 'string':
      return 'string';
    case 'style':
      return 'CSSProperties';
    case 'component':
      return 'ComponentType<SVGProps<SVGSVGElement>>';
    case 'list':
      return type.item === 'string' ? 'string[]' : `{ ${type.item.map(field).join('; ')} }[]`;
  }
}

const field = (p: PropDef) => `${p.name}: ${tsType(p.type)}`;

/** React type names a component's props need. */
export function reactTypesFor(props: PropDef[]): Set<string> {
  const out = new Set<string>();
  const walk = (t: PropType) => {
    if (t.kind === 'style') out.add('CSSProperties');
    if (t.kind === 'component') out.add('ComponentType').add('SVGProps');
    if (t.kind === 'list' && t.item !== 'string') t.item.forEach((p) => walk(p.type));
  };
  props.forEach((p) => walk(p.type));
  return out;
}

export function propsInterface(def: ComponentDef): string {
  if (!def.props.length) return '';
  return `export interface ${def.name}Props {\n${def.props.map((p) => `  ${field(p)};`).join('\n')}\n}\n`;
}

/** `{ title, icon: Icon }` — component-typed props get a capitalized alias usable as a JSX tag. */
export function destructure(def: ComponentDef): { pattern: string; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const parts = def.props.map((p) => {
    if (p.type.kind !== 'component') return p.name;
    const alias = p.name[0].toUpperCase() + p.name.slice(1);
    aliases.set(p.name, alias);
    return `${p.name}: ${alias}`;
  });
  return { pattern: `{ ${parts.join(', ')} }`, aliases };
}
