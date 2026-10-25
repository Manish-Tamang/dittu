import type { APIRoute } from 'astro';
import { llmsFullTxt } from '../lib/markdown';

export const GET: APIRoute = async ({ site }) =>
  new Response(await llmsFullTxt(site!), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
