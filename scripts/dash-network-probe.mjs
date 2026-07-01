// Instruments a REAL browser through the Load Demo Data flow and logs every
// /analytics/overview request URL + response body, plus card values over time.
// Goal: see whether the post-demo requests carry ?fresh=true and what they return.
import { chromium } from 'playwright';

const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const email = `netprobe+${ts}@flowdesk.test`;
const password = 'Probe!Pass123';
const log = (...a) => console.log(...a);
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1);

const readCards = () => {
  const v = (title) => {
    const ps = [...document.querySelectorAll('p')];
    const t = ps.find((p) => p.textContent?.trim() === title);
    return t?.nextElementSibling?.textContent?.trim() ?? '?';
  };
  return `openTickets=${v('Open Tickets')} activeAgents=${v('Active Agents')}`;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  page.on('console', (m) => { if (m.type() === 'error') log(`[t+${el()}s console.error]`, m.text()); });
  page.on('requestfailed', (r) => { if (r.url().includes('/analytics/')) log(`[t+${el()}s REQ FAILED]`, r.url(), r.failure()?.errorText); });
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/analytics/overview')) {
      let body = '';
      try {
        const j = await r.json();
        body = `openTickets=${j?.data?.stats?.openTickets} totalAgents=${j?.data?.stats?.totalAgents}`;
      } catch { body = '(unreadable)'; }
      const hasFresh = u.includes('fresh=true');
      log(`[t+${el()}s] OVERVIEW ${r.status()} fresh=${hasFresh}  -> ${body}  url=${u.replace(/https:\/\/[^/]+/, '')}`);
    }
  });

  log(`[t+${el()}s] register`, email);
  await page.goto(`${SITE}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel('Company / workspace name').fill(`NetProbe ${ts}`);
  await page.getByLabel('First name', { exact: true }).fill('Net');
  await page.getByLabel('Last name', { exact: true }).fill('Probe');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  log(`[t+${el()}s] dashboard mounted, cards: ${await page.evaluate(readCards)}`);

  log(`[t+${el()}s] click Load Demo Data`);
  await page.getByRole('button', { name: /Load Demo Data/i }).click();

  // Watch cards for ~40s
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    if (i % 2 === 0) log(`[t+${el()}s] cards: ${await page.evaluate(readCards)}`);
  }

  log(`[t+${el()}s] FINAL cards: ${await page.evaluate(readCards)}`);
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
