import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import type { PageModel, SiteModel } from '../domain/site.js';
import { reconstructSite } from './index.js';
import { MAP, USE } from './ir.js';

const header = `<header><nav><a href="/">Home</a><a href="/about">About</a><a href="/blog">Blog</a></nav>
<svg class="lucide lucide-github" viewBox="0 0 24 24" width="20"><path d="M1 1h22v22H1z"/></svg></header>`;
const card = (n: number, tags: string[]) =>
  `<article class="card"><img src="/p${n}.png" alt="Project ${n}"><h3>Project ${n}</h3><p>About project ${n}.</p>` +
  `<ul class="tags">${tags.map((t) => `<li>${t}</li>`).join('')}</ul><a href="/p/${n}">Open</a></article>`;
const body = (title: string, cards: string) =>
  fromHtml(
    `<div id="__next">${header}<main><section class="hero"><h1>${title}</h1><p>${'Intro text. '.repeat(10)}</p></section>` +
      `<section><h2>Projects</h2><div class="grid">${cards}</div></section></main>` +
      `<footer><p>${'Footer text. '.repeat(8)}</p><svg class="lucide lucide-github" viewBox="0 0 24 24" width="16"><path d="M1 1h22v22H1z"/></svg></footer></div>`,
    { fragment: true },
  );

const page = (route: string, title: string, cards: string): PageModel => ({
  route,
  url: `https://x.dev${route}`,
  title,
  icons: [],
  htmlAttrs: [],
  bodyAttrs: [],
  body: body(title, cards),
  css: '/assets/css/x.css',
  motion: [],
  warnings: [],
});

const site: SiteModel = {
  startUrl: 'https://x.dev',
  origin: 'https://x.dev',
  pages: [
    page('/', 'Welcome', card(1, ['ts', 'react']) + card(2, ['go']) + card(3, ['rust', 'wasm', 'cli'])),
    page('/work', 'Work', card(4, ['swift']) + card(5, ['kotlin', 'compose'])),
  ],
};

describe('reconstructSite', () => {
  const recon = reconstructSite(site);
  const byName = new Map(recon.components.map((c) => [c.name, c]));

  it('extracts one icon for identical SVGs, with size passed at the use site', () => {
    const icons = recon.components.filter((c) => c.kind === 'icon');
    expect(icons.map((c) => c.name)).toEqual(['GithubIcon']);
    expect(icons[0].root.properties.width).toBeUndefined();
  });

  it('turns the cards into one component with typed props, shared across pages', () => {
    const cardDef = recon.components.find((c) => c.kind === 'repeat')!;
    expect(cardDef.name).toBe('ProjectsCard');
    expect(cardDef.props.map((p) => p.name)).toEqual(['image', 'imageAlt', 'title', 'description', 'items', 'href']);
    expect(cardDef.scope).toBe('shared');
    const maps = recon.pages.map((p) => toHtml(p.root).includes(MAP) || JSON.stringify(recon.components).includes(MAP));
    expect(maps.every(Boolean)).toBe(true);
  });

  it('merges per-page variants of a section into one component with props', () => {
    const hero = byName.get('Hero')!;
    expect(hero.props.map((p) => p.name)).toEqual(['title']);
    expect(recon.components.filter((c) => c.name.startsWith('Hero'))).toHaveLength(1);
  });

  it('shares identical sections and splits pages into sections', () => {
    expect(byName.get('Header')?.scope).toBe('shared');
    expect(byName.get('Footer')?.scope).toBe('shared');
    for (const p of recon.pages) expect(toHtml(p.root)).toContain(USE);
  });

  it('keeps nav links as an inline loop inside the header', () => {
    expect(toHtml(byName.get('Header')!.root)).toContain('dittu-loop');
  });
});
