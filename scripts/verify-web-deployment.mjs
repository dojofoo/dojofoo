import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Test the deployable function without access to workspace dependencies/assets.
const source = resolve(process.argv[2] ?? 'apps/web/.vercel/output/functions/__server.func');
const directory = await mkdtemp(join(tmpdir(), 'dojo-web-deployment-'));
const previousDirectory = process.cwd();
try {
  await cp(source, directory, { recursive: true });
  process.chdir(directory);
  process.env.NODE_ENV = 'production';
  process.env.DOJO_API_ORIGIN ??= 'https://dojo.foo';
  const { default: server } = await import(pathToFileURL(join(directory, 'index.mjs')).href);
  for (const path of ['/', '/dojos', '/docs', '/og.webp', '/og/docs/installation/image.webp']) {
    const response = await server.fetch(new Request(`https://dojo.foo${path}`));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${path}: ${bytes.toString().slice(0, 500)}`);
    if (path.endsWith('.webp')) {
      assert.match(response.headers.get('content-type') ?? '', /image\/webp/);
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    } else {
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.ok(bytes.includes(Buffer.from('dojo')), `${path}: missing page content`);
    }
    console.log(`PASS ${path} (${bytes.length} bytes)`);
  }
} finally {
  process.chdir(previousDirectory);
  await rm(directory, { recursive: true, force: true });
}
