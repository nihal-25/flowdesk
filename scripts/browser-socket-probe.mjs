import axios from '../node_modules/axios/index.js';
import { chromium } from 'playwright';

const GW = 'https://gateway-production-25dc.up.railway.app';
const SITE = 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const email = `bsp+${ts}@flowdesk.test`;
const log = (...a) => console.log(...a);

async function main() {
  const reg = await axios.post(`${GW}/auth/register`, { tenantName: `BSP ${ts}`, firstName: 'B', lastName: 'P', email, password: 'Probe!123' });
  const token = reg.data.data.accessToken;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => { const t = m.text(); if (/\[socket\]/.test(t)) log('  console:', t); });

  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Probe!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  log('logged in; now doing a FULL PAGE RELOAD (deep-link / refresh scenario)');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const diag = await page.evaluate(() => ({
    sc: window.__sc ?? 0,
    connected: !!(window.__socket && window.__socket.connected),
  }));
  log(`sockets created (window.__sc): ${diag.sc}, socket.connected: ${diag.connected}`);

  // Creating a ticket notifies the admin (this user) -> should get a live toast.
  log('creating a ticket via API (admin gets a notification)...');
  await axios.post(`${GW}/tickets`, { title: `notif ${ts}`, description: 'd', priority: 'high', tags: [] }, { headers: { Authorization: `Bearer ${token}` } });
  let toast = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    toast = await page.evaluate(() => !!document.querySelector('.fixed.bottom-4.right-4'));
    if (toast) break;
  }
  log(`toast appeared on dashboard (live notification): ${toast}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
