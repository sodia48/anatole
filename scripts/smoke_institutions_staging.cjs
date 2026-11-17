/**
 * Read-only browser smoke test against a locally built web app explicitly
 * configured with ANATOLE_API_URL pointing to isolated staging PostgreSQL.
 *
 * Usage: set ANATOLE_API_URL to the isolated staging API for both the local
 * web server and this process, then pass http://127.0.0.1:3100.
 */
const { chromium, webkit, devices } = require('@playwright/test');

const base = process.argv[2];
if (process.env.ANATOLE_API_URL !== 'https://anatole-api-institutions-staging.onrender.com') {
  console.error('ANATOLE_API_URL must explicitly point at isolated Institutions staging');
  process.exit(2);
}
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) {
  console.error('Pass an explicit local web origin, e.g. http://127.0.0.1:3100');
  process.exit(2);
}

const targets = [
  ['desktop', chromium, devices['Desktop Chrome']],
  ['pixel-7', chromium, devices['Pixel 7']],
  ['iphone-14', webkit, devices['iPhone 14']],
];

(async () => {
  for (const [name, engine, device] of targets) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({
      ...device,
      locale: 'fr-CA',
      storageState: { cookies: [], origins: [{
        origin: base,
        localStorage: [{ name: 'anatole.appearance-choice.v1', value: '1' }],
      }] },
    });
    const page = await context.newPage();
    const failures = [];
    page.on('response', (response) => {
      if (response.status() >= 500 && response.url().includes('/api/anatole/')) {
        failures.push(response.status());
      }
    });

    try {
      const ready = await page.request.get(`${base}/api/anatole/ready`);
      if (ready.status() !== 200 || (await ready.json()).account_storage?.mode !== 'postgresql') {
        throw new Error('The local web proxy must target staging PostgreSQL');
      }
      await page.goto(`${base}/institutions`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Intelligence institutionnelle' }).waitFor();
      await page.goto(`${base}/institutions/0002012383`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'BlackRock, Inc.' }).waitFor();
      const next = page.getByRole('button', { name: 'Suivant' });
      await next.waitFor();
      await next.click();
      await page.getByText(/101.*200.*\//).waitFor();
      await page.getByLabel('Rechercher une position').fill('NVDA');
      await page.waitForTimeout(1200);
      if (!(await page.locator('body').innerText()).includes('NVDA') || (await next.count()) !== 0) {
        throw new Error('Position search did not filter the result');
      }
      await page.screenshot({ path: `test-results/stage-detail-${name}.png`, fullPage: true });
      await page.goto(`${base}/institutions/0002012383/history`, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').first().waitFor();
      await page.goto(`${base}/institutions/security/history?q=037833100`, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').first().waitFor();
      if (failures.length) throw new Error(`API 5xx: ${failures.join(',')}`);
      console.log(`${name}: directory, pages 1/2, filter, manager and CUSIP history OK`);
    } finally {
      await browser.close();
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
