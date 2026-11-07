import assert from 'node:assert/strict';
import { globSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const content = resolve(root, 'content');
const output = resolve(root, '.vercel/output/static');
const paths = new Set(['/', '/dojos', ...globSync('**/*.mdx', { cwd: content }).map(file => {
  const slug = file.replace(/(?:^|\/)index\.mdx$/, '').replace(/\.mdx$/, '');
  return `/${slug}`.replace(/\/+$/, '') || '/';
})]);
for (const path of paths) {
  const html = readFileSync(resolve(output, `.${path}`, 'index.html'), 'utf8');
  assert.equal([...html.matchAll(/<link\b[^>]*rel="canonical"/g)].length, 1, `${path}: one canonical URL`);
  assert.match(html, /<meta\b[^>]*name="description"[^>]*content="[^"]+"/, `${path}: server-rendered description`);
  assert.doesNotMatch(html, /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/, `${path}: indexable`);
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    if (src.startsWith('/assets/')) {
      assert(existsSync(resolve(output, `.${new URL(src, 'https://dojo.foo').pathname}`)), `${path}: missing image ${src}`);
    }
  }
}
const cache = resolve(output, '__tsr/staticServerFnCache');
const responses = globSync('*.json', { cwd: cache });
assert(responses.length >= paths.size - 2, 'Each documentation page must have static loader data');
for (const file of responses) JSON.parse(readFileSync(resolve(cache, file), 'utf8'));
for (const path of ['sign-in', 'sign-up', 'device', 'pricing']) {
  assert(!existsSync(resolve(output, path, 'index.html')), `${path}: auth and feature flags stay dynamic`);
}
console.log(`Static build verified: ${paths.size} public HTML pages, ${responses.length} cached docs responses; auth stays dynamic.`);
