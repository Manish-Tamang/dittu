import type { APIRoute, GetStaticPaths } from 'astro';
import { getDocs, type Doc } from '../../lib/docs';
import { docMarkdown } from '../../lib/markdown';

export const getStaticPaths = (async () =>
  (await getDocs()).map((doc) => ({ params: { slug: doc.id }, props: { doc } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props, site }) =>
  new Response(docMarkdown((props as { doc: Doc }).doc, site!), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
