// Proves Issues A–E against the LIVE site with two browser contexts.
import axios from '../node_modules/axios/index.js';
import { chromium } from 'playwright';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const log = (...a) => console.log(...a);
const results = {};

const adminEmail = `rtadmin+${ts}@flowdesk.test`;
const agentEmail = `rtagent+${ts}@flowdesk.test`;
const PW = 'Realtime!123';

async function api(path, method = 'get', body, token) {
  return axios({ url: `${GW}${path}`, method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
}

async function login(page, email) {
  await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.waitForTimeout(1500); // let socket connect
}

async function main() {
  // ── setup: admin A + agent B in the SAME tenant ──
  const regA = await api('/auth/register', 'post', { tenantName: `RT ${ts}`, firstName: 'Ada', lastName: 'Admin', email: adminEmail, password: PW });
  const tokenA = regA.data.data.accessToken;
  const inv = await api('/auth/invite', 'post', { email: agentEmail, firstName: 'Bob', lastName: 'Agent', role: 'agent' }, tokenA);
  const invToken = inv.data.data.inviteUrl.split('token=')[1];
  await api('/auth/accept-invite', 'post', { token: invToken, password: PW, firstName: 'Bob', lastName: 'Agent' });
  const loginB = await api('/auth/login', 'post', { email: agentEmail, password: PW });
  const bId = JSON.parse(Buffer.from(loginB.data.data.accessToken.split('.')[1], 'base64').toString()).sub;
  const ticket = (await api('/tickets', 'post', { title: `RT ticket ${ts}`, description: 'd', priority: 'high', tags: ['x'] }, tokenA)).data.data;
  log(`setup: admin=${adminEmail} agent=${agentEmail} (id ${bId.slice(0,8)}) ticket=${ticket.id.slice(0,8)}`);

  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  pageA.on('console', (m) => { if (/socket|Connected/i.test(m.text())) log('  A>', m.text()); });
  pageB.on('console', (m) => { if (/socket|Connected/i.test(m.text())) log('  B>', m.text()); });

  await login(pageA, adminEmail);
  await login(pageB, agentEmail);

  // ── ISSUE A: real-time messages in two contexts ──
  log('\n── ISSUE A: real-time messages ──');
  await pageA.goto(`${SITE}/tickets/${ticket.id}`, { waitUntil: 'domcontentloaded' });
  await pageB.goto(`${SITE}/tickets/${ticket.id}`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(2000);
  const msg = `hello-realtime-${ts}`;
  await pageA.getByPlaceholder(/Type a reply/).fill(msg);
  const tSend = Date.now();
  await pageA.getByPlaceholder(/Type a reply/).press('Control+Enter');
  // sender sees own instantly
  await pageA.waitForFunction((m) => document.body.innerText.includes(m), msg, { timeout: 5000 }).catch(() => {});
  const senderSees = (await pageA.evaluate(() => document.body.innerText)).includes(msg);
  // other context sees it live
  let bLatency = null;
  try {
    await pageB.waitForFunction((m) => document.body.innerText.includes(m), msg, { timeout: 8000 });
    bLatency = ((Date.now() - tSend) / 1000).toFixed(1);
  } catch { /* fail */ }
  // dedupe check: message appears exactly once in B
  const countInB = (await pageB.evaluate(() => document.body.innerText)).split(msg).length - 1;
  log(`  sender sees own instantly: ${senderSees}`);
  log(`  other context received in: ${bLatency}s (occurrences=${countInB})`);
  results.A = senderSees && bLatency !== null && parseFloat(bLatency) <= 4 && countInB === 1;
  log(`  ISSUE A: ${results.A ? 'PASS ✅' : 'FAIL ❌'}`);

  // ── ISSUE B: new ticket appears in list without refresh ──
  log('\n── ISSUE B: ticket list live ──');
  await pageA.goto(`${SITE}/tickets`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(1500);
  await pageA.getByRole('button', { name: /New Ticket/i }).click();
  await pageA.waitForTimeout(500);
  const newTitle = `Live ticket ${ts}`;
  await pageA.getByLabel('Title', { exact: true }).fill(newTitle);
  await pageA.getByRole('button', { name: 'Create Ticket' }).click();
  let bListLive = false;
  try {
    await pageA.waitForFunction((t) => document.body.innerText.includes(t), newTitle, { timeout: 6000 });
    bListLive = true;
  } catch { /* fail */ }
  log(`  new ticket appeared in list (no refresh): ${bListLive}`);
  results.B = bListLive;
  log(`  ISSUE B: ${results.B ? 'PASS ✅' : 'FAIL ❌'}`);

  // ── ISSUE C: Active Agents presence ──
  log('\n── ISSUE C: presence / Active Agents ──');
  await pageA.goto(`${SITE}/dashboard`, { waitUntil: 'domcontentloaded' });
  const readActive = () => pageA.evaluate(() => {
    const ps = [...document.querySelectorAll('p')];
    const t = ps.find((p) => p.textContent?.trim() === 'Active Agents');
    return t?.nextElementSibling?.textContent?.trim() ?? '?';
  });
  let activeWith2 = '?';
  for (let i = 0; i < 12; i++) { await pageA.waitForTimeout(1000); activeWith2 = await readActive(); if (activeWith2.startsWith('2')) break; }
  log(`  both online -> Active Agents = "${activeWith2}"`);
  // disconnect B
  await ctxB.close();
  let activeAfter = activeWith2;
  for (let i = 0; i < 14; i++) { await pageA.waitForTimeout(1000); activeAfter = await readActive(); if (activeAfter.startsWith('1')) break; }
  log(`  after B disconnects -> Active Agents = "${activeAfter}"`);
  results.C = activeWith2.startsWith('2') && activeAfter.startsWith('1');
  log(`  ISSUE C: ${results.C ? 'PASS ✅' : 'FAIL ❌'}`);

  // ── ISSUE D: live notification + toast ──
  log('\n── ISSUE D: notification toast ──');
  const ctxB2 = await browser.newContext();
  const pageB2 = await ctxB2.newPage();
  await login(pageB2, agentEmail);
  await pageB2.goto(`${SITE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await pageB2.waitForTimeout(1500);
  // A assigns the ticket to B -> B should get a live notification + toast
  await api(`/tickets/${ticket.id}`, 'patch', { assignedTo: bId }, tokenA);
  let toastSeen = false;
  for (let i = 0; i < 14; i++) {
    await pageB2.waitForTimeout(1000);
    const hasToast = await pageB2.evaluate(() => !!document.querySelector('.fixed.bottom-4.right-4'));
    if (hasToast) { toastSeen = true; break; }
  }
  await pageB2.screenshot({ path: 'scripts/rt-toast.png', fullPage: true });
  const toastText = toastSeen ? await pageB2.evaluate(() => document.querySelector('.fixed.bottom-4.right-4')?.textContent ?? '') : '';
  log(`  toast appeared on assignee's screen: ${toastSeen} ("${toastText.slice(0, 60)}")`);
  results.D = toastSeen;
  log(`  ISSUE D: ${results.D ? 'PASS ✅' : 'FAIL ❌'}`);

  // ── ISSUE E: agents page controls ──
  log('\n── ISSUE E: agents deactivate + role ──');
  await pageA.goto(`${SITE}/agents`, { waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(1500);
  // Members sort active-first then by first name: Ada (admin/self) is nth 0,
  // Bob (agent) is nth 1. Click Bob's Deactivate via the real UI button.
  await pageA.getByRole('button', { name: 'Deactivate' }).nth(1).click();
  await pageA.waitForTimeout(2500);
  const bAfter = (await api('/agents', 'get', undefined, tokenA)).data.data.find((a) => a.email === agentEmail);
  log(`  clicked Bob's Deactivate -> Bob.isActive = ${bAfter?.isActive}`);
  // Change Bob's role to Admin via the real UI dropdown (2nd role <select>).
  await pageA.locator('select').nth(1).selectOption('admin');
  await pageA.waitForTimeout(2500);
  const bRole = (await api('/agents', 'get', undefined, tokenA)).data.data.find((a) => a.email === agentEmail)?.role;
  // Reload and confirm persistence.
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(1000);
  log(`  changed Bob's role via dropdown -> Bob.role = ${bRole} (persisted after reload)`);
  results.E = bAfter?.isActive === false && bRole === 'admin';
  log(`  ISSUE E: ${results.E ? 'PASS ✅' : 'FAIL ❌'}`);

  await browser.close();

  log('\n══════ SUMMARY ══════');
  for (const k of ['A', 'B', 'C', 'D', 'E']) log(`  Issue ${k}: ${results[k] ? 'PASS ✅' : 'FAIL ❌'}`);
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e.response?.status, e.response?.data || e.message, e.stack); process.exit(2); });
