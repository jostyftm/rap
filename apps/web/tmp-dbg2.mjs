import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
await page.evaluate(() => document.documentElement.classList.add('light'));
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const cs = d ? getComputedStyle(d) : null;
  return {
    htmlClass: document.documentElement.className,
    htmlZoom: getComputedStyle(document.documentElement).zoom,
    bodyZoom: getComputedStyle(document.body).zoom,
    htmlTransform: getComputedStyle(document.documentElement).transform,
    bodyTransform: getComputedStyle(document.body).transform,
    dialogTransform: cs?.transform, dialogFilter: cs?.filter, dialogOpacity: cs?.opacity,
    dpr: window.devicePixelRatio, w: innerWidth,
    scrollW: document.documentElement.scrollWidth,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/opencode/dbg-light3.png' });
await page.screenshot({ path: '/tmp/opencode/dbg-light4.png', animations: 'disabled' });
await browser.close();
