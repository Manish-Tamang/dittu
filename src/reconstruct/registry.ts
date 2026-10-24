import type { ComponentDef } from './ir.js';

/** All components extracted from a site, with site-wide unique names. */
export class Registry {
  readonly components: ComponentDef[] = [];
  private names = new Set<string>(['Page', 'Layout', 'Link', 'Image', 'Fragment', 'Component', 'React']);

  unique(base: string): string {
    const clean = /^[A-Z]/.test(base) ? base : 'X' + base;
    let name = clean;
    for (let n = 2; this.names.has(name); n++) name = `${clean}${n}`;
    this.names.add(name);
    return name;
  }

  remove(def: ComponentDef) {
    const i = this.components.indexOf(def);
    if (i >= 0) this.components.splice(i, 1);
  }

  add(def: Omit<ComponentDef, 'users' | 'scope'>): ComponentDef {
    const full: ComponentDef = { ...def, scope: '', users: new Set() };
    this.components.push(full);
    return full;
  }
}
