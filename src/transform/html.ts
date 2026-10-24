import { fromHtml } from 'hast-util-from-html';
import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type { CaptureResult } from '../domain/snapshot.js';
import type { AssetKind, AssetStore } from './assets.js';
import { hash } from '../util/hash.js';
import { formatSrcset, parseSrcset, resolveUrl } from '../util/url.js';

export interface LinkResolver {
  /** Local route for a same-site page that was cloned, or null to keep the original URL. */
  (absUrl: string): string | null;
}

interface Ref {
  url: string;
  kind: AssetKind;
}

const STYLE_URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

const toStr = (v: unknown): string | undefined =>
  v == null ? undefined : Array.isArray(v) ? v.join(v.length && String(v[0]).includes(' ') ? ', ' : ' ') : String(v);

const srcsetStr = (v: unknown): string | undefined =>
  v == null ? undefined : Array.isArray(v) ? v.join(', ') : String(v);

function kindFor(el: Element): AssetKind {
  return el.tagName === 'video' || el.tagName === 'audio' || el.tagName === 'source' || el.tagName === 'track'
    ? 'media'
    : 'image';
}

/**
 * Parse the serialized body and make it self-contained: assets → /assets,
 * internal links → local routes, canvas snapshots → image files.
 */
export async function transformBody(cap: CaptureResult, store: AssetStore, resolveLink: LinkResolver): Promise<Root> {
  const { snapshot } = cap;
  const base = snapshot.baseURI;
  const root = fromHtml(snapshot.bodyHtml, { fragment: true });

  const abs = (u: string) => (u.startsWith('data:') || u.startsWith('#') ? null : resolveUrl(u, base));
  const refs: Ref[] = [];
  const want = (u: string | undefined, kind: AssetKind) => {
    if (!u) return;
    const a = abs(u);
    if (a && /^https?:/.test(a)) refs.push({ url: a, kind });
  };

  visit(root, 'element', (el: Element) => {
    const p = el.properties;
    if (el.tagName === 'a' || el.tagName === 'area') return;
    if (typeof p.src === 'string' && el.tagName !== 'iframe') want(p.src, kindFor(el));
    if (p.srcSet != null) for (const c of parseSrcset(srcsetStr(p.srcSet)!)) want(c.url, 'image');
    if (typeof p.poster === 'string') want(p.poster, 'image');
    if (typeof p.data === 'string' && el.tagName === 'object') want(p.data, 'image');
    const href = toStr(p.href) ?? toStr(p.xLinkHref);
    if (href && (el.tagName === 'image' || el.tagName === 'use' || el.tagName === 'feImage')) {
      if (!href.startsWith('#')) want(href.split('#')[0], 'image');
    }
    if (typeof p.style === 'string') for (const m of p.style.matchAll(STYLE_URL_RE)) want(m[2], 'image');
  });
  await Promise.all(refs.map((r) => store.ensure(r.url, r.kind, snapshot.url)));

  const local = (u: string) => {
    const a = abs(u);
    if (!a) return u;
    if (!/^https?:/.test(a)) return u;
    return store.get(a) ?? a;
  };
  const localWithHash = (u: string) => {
    const i = u.indexOf('#');
    return i > 0 ? local(u.slice(0, i)) + u.slice(i) : local(u);
  };

  visit(root, 'element', (el: Element) => {
    const p = el.properties;
    if (el.tagName === 'a' || el.tagName === 'area') {
      const href = toStr(p.href);
      if (href && !href.startsWith('#') && !/^(mailto|tel|sms|javascript):/i.test(href)) {
        const a = resolveUrl(href, base);
        if (a) p.href = resolveLink(a) ?? a;
      }
      return;
    }
    if (p.dataDittuCanvas != null && typeof p.src === 'string' && p.src.startsWith('data:image/png;base64,')) {
      const buf = Buffer.from(p.src.slice('data:image/png;base64,'.length), 'base64');
      p.src = store.writeGenerated('image', `canvas-${hash(buf)}.png`, buf);
      delete p.dataDittuCanvas;
    } else if (p.dataDittuCid != null) {
      const shot = cap.canvasShots.get(String(p.dataDittuCid));
      if (shot) p.src = store.writeGenerated('image', `canvas-${hash(shot)}.png`, shot);
      // Element screenshots are taken at CSS size, so the image must be laid out at that size too.
      delete p.dataDittuCid;
    } else if (typeof p.src === 'string' && el.tagName !== 'iframe') {
      p.src = local(p.src);
    }
    if (p.srcSet != null)
      p.srcSet = formatSrcset(parseSrcset(srcsetStr(p.srcSet)!).map((c) => ({ ...c, url: local(c.url) })));
    if (typeof p.poster === 'string') p.poster = local(p.poster);
    if (typeof p.data === 'string' && el.tagName === 'object') p.data = local(p.data);
    for (const key of ['href', 'xLinkHref'] as const) {
      const v = toStr(p[key]);
      if (v && !v.startsWith('#') && (el.tagName === 'image' || el.tagName === 'use' || el.tagName === 'feImage'))
        p[key] = localWithHash(v);
    }
    if (typeof p.style === 'string' && p.style.includes('url(')) {
      p.style = p.style.replace(STYLE_URL_RE, (m, q, u) =>
        u.startsWith('data:') || u.startsWith('#') ? m : `url(${q}${local(u)}${q})`,
      );
    }
  });
  return root;
}

export async function localIcons(cap: CaptureResult, store: AssetStore) {
  const out: { rel: string; href: string; type?: string; sizes?: string }[] = [];
  for (const icon of cap.snapshot.icons) {
    if (!icon.href) continue;
    const a = resolveUrl(icon.href, cap.snapshot.baseURI);
    if (!a) continue;
    const href = a.startsWith('data:') ? a : ((await store.ensure(a, 'image', cap.snapshot.url)) ?? a);
    out.push({
      rel: icon.rel,
      href,
      ...(icon.type ? { type: icon.type } : {}),
      ...(icon.sizes ? { sizes: icon.sizes } : {}),
    });
  }
  return out;
}
