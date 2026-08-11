import { chromium } from 'playwright';

const URL = 'https://dojofoo.td/';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const consoleMessages = [];
const pageErrors = [];

page.on('console', (msg) => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  pageErrors.push(String(err));
});
page.on('dialog', async (dialog) => {
  console.log('DIALOG fired:', dialog.type(), dialog.message());
  await dialog.dismiss();
});

console.log('--- navigating to', URL);
await page.goto(URL, { waitUntil: 'networkidle' });

// Give react time to hydrate.
await page.waitForTimeout(500);

console.log('--- console messages ---');
consoleMessages.forEach((m) => console.log(m));

console.log('--- page errors ---');
pageErrors.forEach((e) => console.log(e));

const beforeText = await page.textContent('span.text-fd-foreground');
console.log('--- before click, displayed cmd:', beforeText);

const btns = await page.locator('button:has-text("bun")').all();
console.log('--- found bun buttons:', btns.length);

if (btns.length) {
  await btns[0].click();
  await page.waitForTimeout(300);
}

const afterText = await page.textContent('span.text-fd-foreground');
console.log('--- after click bun, displayed cmd:', afterText);

console.log('--- console after click ---');
consoleMessages.slice().forEach((m, i) => console.log(i, m));

await browser.close();
