import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
writeFileSync(resolve(packageDir, 'src', '_version.ts'), `export const VERSION = ${JSON.stringify(pkg.version)};\n`);
