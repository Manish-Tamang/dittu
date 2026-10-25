import { NPM, REPO, SITE } from '../data';
import { getSections, type Doc } from './docs';

/** A doc as standalone markdown, with links to other docs pointing at their .md versions. */
export function docMarkdown(doc: Doc, site: URL) {
  const body = (doc.body ?? '').replace(/\]\(\/docs\/([\w-]+)(#[^)]*)?\)/g, (_, slug) => `](${new URL(`/docs/${slug}.md`, site)})`);
  return `# ${doc.data.title}\n\n${body.trim()}\n`;
}

/** https://llmstxt.org: a short overview plus links to every doc. */
export async function llmsTxt(site: URL) {
  const sections = await getSections();
  const link = (doc: Doc) => `- [${doc.data.title}](${new URL(`/docs/${doc.id}.md`, site)}): ${doc.data.description}`;
  return `# ${SITE.name}

> Clone any website's frontend (layout, CSS, fonts, images, scroll animations) into an editable Next.js or Astro project, verified by pixel diff. Ships as a CLI, an MCP server and agent skills. npm package: \`@manishtamang/dittu\`.

dittu copies what the browser rendered (live DOM, original CSS, downloaded assets) instead of asking an LLM to redraw a screenshot. It exports a static preview, a Next.js App Router project and an Astro project, then scores the clone against the original at 1440px and 390px. It does not copy backends: data fetching, auth, APIs and forms are left to you.

- Set up agents: \`npx @manishtamang/dittu setup\` (Claude Code, Cursor, Gemini CLI, Codex)
- Clone from a terminal: \`npx @manishtamang/dittu clone <url>\`
- MCP server: \`npx -y @manishtamang/dittu mcp\`, tools \`clone_website\`, \`verify_clone\`, \`read_report\`

${sections.map((section) => `## ${section.title}\n\n${section.docs.map(link).join('\n')}`).join('\n\n')}

## Optional

- [All docs in one file](${new URL('/llms-full.txt', site)}): every page above, concatenated
- [Source code](${REPO}): GitHub repository
- [npm package](${NPM}): install and version history
- [Changelog](${REPO}/blob/main/CHANGELOG.md): what changed in each release
`;
}

export async function llmsFullTxt(site: URL) {
  const sections = await getSections();
  const docs = sections.flatMap((section) => section.docs);
  return `# ${SITE.name} docs\n\n> ${SITE.description}\n\n${docs
    .map((doc) => `${docMarkdown(doc, site).replace(/^# /, '## ')}`)
    .join('\n---\n\n')}`;
}
