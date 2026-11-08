import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run the Web/Site/Landing Artwork story first. cwebp/dwebp and avifenc encode
// the approved UIX composition; production needs only the checked-in images.
const origin = process.argv[2] ?? 'http://127.0.0.1:6010';
const only = process.argv[3];
const destination = fileURLToPath(new URL('../../../packages/uix/src/assets/learning/', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'dojo-learning-art-'));
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ['dark', 'light']) for (const mode of ['desktop', 'phone']) {
    const name = `${theme}-${mode}`;
    if (only && only !== name) continue;
    const page = await browser.newPage({
      viewport: { width: mode === 'desktop' ? 1240 : 390, height: 1100 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/iframe.html?id=web-site--landing-artwork&viewMode=story&globals=theme:${theme}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-learning-artwork-source] pre').waitFor({ timeout: 60_000 });
    if (mode === 'phone') await page.locator('.ui-web-app[data-phone]').waitFor();
    // The artwork is static HTML, so apply the shell's existing narrow layout
    // without mounting the editor, chat controls or their resize observers.
    await page.locator('[data-learning-artwork-source] .ui-as-app').evaluate(element => element.toggleAttribute('data-narrow', element.clientWidth <= 900));
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-learning-artwork-source] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const frame = page.locator('.ui-web-app__scale');
    const measured = await frame.evaluate(element => {
      return { width: element.clientWidth, height: element.clientHeight };
    });
    if (errors.length) throw new Error(errors.join('\n'));
    if (mode === 'desktop') await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-learning-artwork-source] .lj-course canvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    const png = join(scratch, `${name}.png`);
    await frame.screenshot({ path: png, animations: 'disabled', caret: 'hide' });
    for (const density of [1, 2]) {
      const target = join(destination, `${name}${density === 2 ? '@2x' : ''}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', '-resize', String(measured.width * density), String(measured.height * density), png, '-o', target]);
      const resizedWebp = join(scratch, `${name}-${density}x-lossless.webp`);
      const resizedPng = join(scratch, `${name}-${density}x.png`);
      execFileSync('cwebp', ['-quiet', '-lossless', '-resize', String(measured.width * density), String(measured.height * density), png, '-o', resizedWebp]);
      execFileSync('dwebp', ['-quiet', resizedWebp, '-o', resizedPng]);
      const avif = target.replace(/\.webp$/, '.avif');
      execFileSync('avifenc', ['-q', '65', '-s', '6', '-j', '2', '-y', '444', resizedPng, avif]);
      console.log(`${name} ${density}×: ${target}, ${avif}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
