import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = [
  ['src/browser/style/ide-ai.css', 'lib/browser/style/ide-ai.css'],
];

for (const [sourceRelative, targetRelative] of assets) {
  const source = resolve(packageRoot, sourceRelative);
  const target = resolve(packageRoot, targetRelative);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
