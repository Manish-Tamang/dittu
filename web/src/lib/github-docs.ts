import { readdir, readFile } from 'node:fs/promises';
import type { Loader, LoaderContext } from 'astro/loaders';

/** Bump when parse/rewrite output changes, so cached docs are re-rendered. */
const PARSER_VERSION = 5;

interface Options {
  repo: string; // "owner/name"
  dir: string;
  branch: string;
  /** Sidebar sections in order; docs not listed go in a final "More" section. */
  sections: { title: string; docs: string[] }[];
}

interface GitHubFile {
  name: string;
  type: 'file' | 'dir';
  sha: string;
  path: string;
}

/**
 * Loads the markdown files in `dir` of a GitHub repo. Uses an ETag so unchanged
 * listings come back 304 (free against the rate limit), and only re-downloads
 * files whose SHA changed. Set GITHUB_TOKEN to raise the API limit. If GitHub
 * can't be reached and nothing is cached, it reads `dir` from the local checkout.
 */
export function githubDocsLoader({ repo, dir, branch, sections }: Options): Loader {
  const order = sections.flatMap((section) => section.docs);
  const sectionOf = (id: string) => sections.find((section) => section.docs.includes(id))?.title ?? 'More';
  const api = `https://api.github.com/repos/${repo}/contents/${dir}?ref=${branch}`;
  const raw = `https://raw.githubusercontent.com/${repo}/${branch}`;
  const web = `https://github.com/${repo}`;
  const editUrl = (path: string) => `${web}/edit/${branch}/${path}`;
  const link = (body: string, slugs: Set<string>) => rewriteLinks(body, { slugs, raw, web, branch, dir });
  const place = (id: string) => ({
    order: order.includes(id) ? order.indexOf(id) : order.length,
    section: sectionOf(id),
  });

  return {
    name: 'github-docs',
    load: async (context) => {
      const { store, meta, logger } = context;
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const etag = meta.get('etag');
      const fresh = meta.get('parser') === String(PARSER_VERSION) && store.keys().length > 0;
      if (etag && fresh) headers['If-None-Match'] = etag;

      let res: Response | undefined;
      try {
        res = await fetch(api, { headers });
      } catch (error) {
        logger.warn(`Could not reach GitHub: ${error}`);
      }
      if (res?.status === 304) return;
      if (!res?.ok) {
        if (res) logger.warn(`GitHub returned ${res.status} for ${api}`);
        if (store.keys().length) return logger.warn('Keeping cached docs');
        return loadLocal(context, { dir, place, link, editUrl });
      }
      meta.set('etag', res.headers.get('etag') ?? '');
      meta.set('parser', String(PARSER_VERSION));

      const files = ((await res.json()) as GitHubFile[]).filter((f) => f.type === 'file' && f.name.endsWith('.md'));
      const slugs = new Set(files.map((f) => f.name.replace(/\.md$/, '')));
      for (const id of store.keys()) if (!slugs.has(id)) store.delete(id);

      let updated = 0;
      for (const file of files) {
        const id = file.name.replace(/\.md$/, '');
        const digest = `${PARSER_VERSION}:${file.sha}`;
        if (store.get(id)?.digest === digest) continue;
        const source = await fetch(`${raw}/${file.path}`).then((r) => r.text());
        await storeDoc(context, { id, source, digest, slugs, place, link, editUrl: editUrl(file.path) });
        updated++;
      }
      if (updated) logger.info(`Synced ${updated} doc(s) from ${repo}/${dir}`);
    },
  };
}

type Link = (body: string, slugs: Set<string>) => string;
type Place = (id: string) => { order: number; section: string };

async function storeDoc(
  { store, parseData, renderMarkdown }: LoaderContext,
  doc: { id: string; source: string; digest: string; slugs: Set<string>; place: Place; link: Link; editUrl: string },
) {
  const { title, description, body } = parse(doc.source, doc.id);
  const data = await parseData({
    id: doc.id,
    data: { title, description, ...doc.place(doc.id), editUrl: doc.editUrl },
  });
  // `body` keeps the markdown (with rewritten links) for the .md endpoints and llms.txt
  const linked = doc.link(body, doc.slugs);
  store.set({ id: doc.id, data, body: linked, digest: doc.digest, rendered: await renderMarkdown(linked) });
}

/** Fallback: the same docs from the local checkout (web/ lives in the dittu repo). */
async function loadLocal(
  context: LoaderContext,
  opts: { dir: string; place: Place; link: Link; editUrl: (path: string) => string },
) {
  const root = new URL(`../${opts.dir}/`, context.config.root);
  let names: string[];
  try {
    names = (await readdir(root)).filter((name) => name.endsWith('.md'));
  } catch {
    return context.logger.error(`No cached docs and no local ${opts.dir}/ folder to fall back to`);
  }
  const slugs = new Set(names.map((name) => name.replace(/\.md$/, '')));
  for (const name of names) {
    const id = name.replace(/\.md$/, '');
    const source = await readFile(new URL(name, root), 'utf8');
    const digest = `local:${PARSER_VERSION}:${context.generateDigest(source)}`;
    await storeDoc(context, {
      id,
      source,
      digest,
      slugs,
      place: opts.place,
      link: opts.link,
      editUrl: opts.editUrl(`${opts.dir}/${name}`),
    });
  }
  context.logger.info(`Loaded ${names.length} doc(s) from the local ${opts.dir}/ folder`);
}

/** Pull the H1 out as the title and the first paragraph as the description. */
function parse(source: string, id: string) {
  const match = source.match(/^#\s+(.+)\n/m);
  const title = match?.[1].trim() ?? id;
  const body = match ? source.replace(match[0], '').trimStart() : source;
  const prose = body.replace(/```[\s\S]*?```/g, '');
  const blocks = prose.split(/\n\s*\n/).map((block) => block.trim());
  const paragraph =
    blocks.find((block) => /^[A-Za-z`*[]/.test(block)) ??
    blocks.find((block) => block.startsWith('- '))?.split('\n')[0].slice(2) ??
    '';
  const text = paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/:$/, '.')
    .trim();
  // First sentence, so cards and meta descriptions stay short
  const description = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  return { title, description, body };
}

/** Point relative links at the site's own doc pages, or at GitHub for anything else. */
function rewriteLinks(
  body: string,
  ctx: { slugs: Set<string>; raw: string; web: string; branch: string; dir: string },
) {
  return body.replace(/(!?)\]\(([^)\s]+)\)/g, (all, bang: string, href: string) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return all;
    const [path, hash = ''] = href.split('#');
    const doc = path.match(/^(?:\.\/)?([\w-]+)\.md$/);
    if (doc && ctx.slugs.has(doc[1])) return `${bang}](/docs/${doc[1]}${hash && `#${hash}`})`;
    const resolved = new URL(path, `https://x/${ctx.dir}/`).pathname.slice(1);
    return bang
      ? `${bang}](${ctx.raw}/${resolved})`
      : `${bang}](${ctx.web}/tree/${ctx.branch}/${resolved}${hash && `#${hash}`})`;
  });
}
