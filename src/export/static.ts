import { join } from 'node:path';
import { routeSegments, type SiteModel } from '../domain/site.js';
import { writeFile } from './files.js';
import { staticDocument } from './markup.js';

/** preview/<route>/index.html — plain HTML, served together with <out>/assets. */
export function exportStatic(site: SiteModel, outDir: string) {
  const dir = join(outDir, 'preview');
  for (const page of site.pages) {
    writeFile(join(dir, ...routeSegments(page.route), 'index.html'), staticDocument(page));
  }
  return dir;
}
