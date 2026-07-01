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
  const ticket = (await axios.post(`${GW}/tickets`, { title: `bsp ${ts}`, description: 'd', priority: 'high', tags: [] }, { headers: { Authorization: `Bearer ${token}` } })).data.data;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => { const t = m.text(); if (/socket|Connected|Disconnect|event|error|chat/i.test(t)) log('  console:', m.type(), t); });
  page.on('websocket', (ws) => { log('  WS opened:', ws.url()); ws.on('close', () => log('  WS closed:', ws.url())); ws.on('socketerror', (e) => log('  WS error:', e)); });

  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Probe!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  log('logged in; navigating to ticket');
  await page.goto(`${SITE}/tickets/${ticket.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  log('posting a message via API (browser is viewing this ticket, should receive message:new)');
  await axios.post(`${GW}/tickets/${ticket.id}/messages`, { body: `probe-msg-${ts}`, messageType: 'text' }, { headers: { Authorization: `Bearer ${token}` } });
  await page.waitForTimeout(4000);

  const gotMsg = (await page.evaluate(() => document.body.innerText)).includes(`probe-msg-${ts}`);
  log(`\nmessage appeared in browser DOM (via socket): ${gotMsg}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
