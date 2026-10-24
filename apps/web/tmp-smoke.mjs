import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0,200)));
await page.goto('http://localhost:3000/login');
await page.fill('input[type="email"], input[name="email"]', 'admin@rpa.studio');
await page.fill('input[type="password"]', 'secret123');
await page.click('button[type="submit"]');
await page.waitForURL(/\/recipes/);
await page.goto('http://localhost:3000/recipes/01a16acc-aa68-72a6-9c04-1c2d61c5b224/edit');
await page.waitForSelector('.react-flow', { timeout: 30000 });
await page.waitForTimeout(3000);
await page.locator('.react-flow__node').nth(1).dblclick();
await page.waitForSelector('[role="dialog"][aria-modal="true"]');
await page.waitForTimeout(1200);
const dialog = page.locator('[role="dialog"][aria-modal="true"]');
// copy JSON from Salida tab
await dialog.getByRole('tab', { name: 'Salida' }).click();
await page.waitForTimeout(700);
const copyBtn = dialog.locator('button[aria-label="Copiar JSON completo"]');
if (await copyBtn.count()) { await copyBtn.click(); await page.waitForTimeout(150); }
await page.screenshot({ path: '/tmp/opencode/copy-flash.png' });
// keyboard execute
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/opencode/exec.png' });
// escape closes
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const closed = await dialog.count() === 0 || !(await dialog.isVisible().catch(() => false));
console.log('closed on escape:', closed, 'errors:', errs.slice(0,3));
await browser.close();
