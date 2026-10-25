import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { githubDocsLoader } from './lib/github-docs';

export const sections = [
  { title: 'Getting started', docs: ['installation', 'cli', 'mcp'] },
  { title: 'Concepts', docs: ['architecture', 'fidelity', 'tailwind'] },
  { title: 'Project', docs: ['testing', 'roadmap'] },
];

const docs = defineCollection({
  loader: githubDocsLoader({ repo: 'Manish-Tamang/dittu', dir: 'docs', branch: 'main', sections }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    section: z.string(),
    editUrl: z.string(),
  }),
});

export const collections = { docs };
