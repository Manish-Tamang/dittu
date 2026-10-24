import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pkgRoot } from './util/paths.js';

export const VERSION: string = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;
