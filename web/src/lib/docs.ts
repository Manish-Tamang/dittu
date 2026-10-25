import { getCollection, type CollectionEntry } from 'astro:content';

export type Doc = CollectionEntry<'docs'>;

export async function getDocs() {
  return (await getCollection('docs')).sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

/** Docs grouped by sidebar section, in order. */
export async function getSections() {
  const sections = new Map<string, Doc[]>();
  for (const doc of await getDocs()) sections.set(doc.data.section, [...(sections.get(doc.data.section) ?? []), doc]);
  return [...sections].map(([title, docs]) => ({ title, docs }));
}
