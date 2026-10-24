// What the browser-side serializer (bridge/browser/snapshot.js) returns.

export interface Viewport {
  width: number;
  height: number;
}

export interface SheetEntry {
  kind: 'link' | 'style' | 'adopted';
  href?: string;
  media: string;
  text?: string;
  cssom?: string | null;
  fromCssom?: boolean;
}

/** Elements with identical animations share one id; `delays[i]` is the i-th element's (document order) stagger. */
export type MotionItem =
  | {
      id: string;
      type: 'style';
      from: Record<string, string>;
      to: Record<string, string>;
      duration: number;
      easing: string;
      delays?: number[];
    }
  | { id: string; type: 'class'; add: string[]; remove: string[]; delays?: number[] }
  | { id: string; type: 'loop'; keyframes: unknown; options: Record<string, unknown> }
  | { id: string; type: 'resp'; mq: string; add: string[]; remove: string[] };

/** An element whose JS-set inline style/classes differ at mobile width. */
export interface ResponsiveItem {
  id: string;
  path: string;
  props: string[];
  add: string[];
  remove: string[];
  /** Computed values of `props` on the mobile render. */
  values?: Record<string, string> | null;
}

export interface CanvasBox {
  cid: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Snapshot {
  url: string;
  baseURI: string;
  title: string;
  htmlAttrs: [string, string][];
  bodyAttrs: [string, string][];
  metas: [string, string][];
  icons: { rel: string; href: string | null; type: string | null; sizes: string | null }[];
  bodyHtml: string;
  sheets: SheetEntry[];
  canvases: CanvasBox[];
  motion: MotionItem[];
  responsive: ResponsiveItem[];
  warnings: string[];
  docHeight: number;
}

export interface CaptureResult {
  snapshot: Snapshot;
  canvasShots: Map<string, Buffer>;
  links: string[];
}
