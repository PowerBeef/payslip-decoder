// Is the published site (the repo root, what GitHub Pages serves) exactly what the source builds?
//   node build.mjs && node tools/compare_site.mjs
// Compares every file of dist/pages with its copy at the repo root, byte for byte. Exit code 1 on any difference.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(SRC, 'dist/pages'),
  SITE = path.resolve(SRC, '..');
if (!fs.existsSync(DIST)) {
  console.log('Build first: node build.mjs');
  process.exit(2);
}
const walk = (d, base = d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))]));
const diff = [];
const files = walk(DIST);
for (const f of files) {
  const a = fs.readFileSync(path.join(DIST, f)),
    p = path.join(SITE, f);
  if (!fs.existsSync(p)) diff.push(`missing from the site: ${f}`);
  else if (!a.equals(fs.readFileSync(p))) diff.push(`differs: ${f}`);
}
console.log(
  diff.length
    ? `FAIL the published site differs from the build:\n  ${diff.join('\n  ')}`
    : `PASS the published site is exactly the build (${files.length} files)`,
);
process.exit(diff.length ? 1 : 0);
