import type { Root } from 'hast';
import type { MotionItem } from './snapshot.js';

export interface Icon {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
}

export interface PageModel {
  /** Route path on the clone: "/", "/about", "/blog/post". */
  route: string;
  url: string;
  title: string;
  description?: string;
  icons: Icon[];
  htmlAttrs: [string, string][];
  bodyAttrs: [string, string][];
  body: Root;
  /** Public path of this page's stylesheet. */
  css: string;
  /** Public path of the compiled Tailwind utilities (static preview only; projects build their own). */
  tailwindCss?: string;
  motion: MotionItem[];
  warnings: string[];
}

export interface SiteModel {
  startUrl: string;
  origin: string;
  pages: PageModel[];
  /** Set when styles were converted to Tailwind: the projects' entry stylesheet. */
  tailwind?: { input: string };
}

/** "/" → [], "/blog/post" → ["blog", "post"] with segments safe for Next/Astro file routing. */
export function routeSegments(route: string): string[] {
  return route
    .split('/')
    .filter(Boolean)
    .map((s) => {
      let seg =
        decodeURIComponent(s)
          .replace(/[^\w.-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'page';
      // Next treats _x, (x), [x], @x specially; Astro ignores _x.
      if (/^[_.]/.test(seg)) seg = 'p' + seg;
      return seg;
    });
}

export const routeScope = (route: string) => routeSegments(route).join('-') || 'home';
