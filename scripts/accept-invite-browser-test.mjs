// End-to-end proof of the accept-invite flow:
//  1. API: register admin A, send invite, capture inviteUrl/token
//  2. BROWSER (clean context, NOT logged in): open accept URL, confirm it shows
//     workspace + role, set password, submit
//  3. API: GET /agents as admin A -> invited user is an active agent in A's tenant
//  4. API: invited user can log in with the password they set
import axios from '../node_modules/axios/index.js';
import { chromium } from 'playwright';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const ADMIN = `admin+${ts}@flowdesk.test`;
const INVITEE = `invitee+${ts}@example.com`;
const WORKSPACE = `Acme ${ts}`;
const INVITEE_PW = 'Invitee!Pass123';

const log = (...a) => console.log(...a);

async function main() {
  // 1) admin A registers + invites
  const reg = await axios.post(`${GW}/auth/register`, {
    tenantName: WORKSPACE, firstName: 'Adam', lastName: 'Admin',
    email: ADMIN, password: 'Admin!Pass123',
  });
  const adminToken = reg.data.data.accessToken;
  const adminTenantId = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString()).tid;
  log('1) admin A registered:', ADMIN, '| workspace:', WORKSPACE);

  const inv = await axios.post(`${GW}/auth/invite`,
    { email: INVITEE, firstName: 'Ivy', lastName: 'Invitee', role: 'agent' },
    { headers: { Authorization: `Bearer ${adminToken}` } });
  const inviteUrl = inv.data.data.inviteUrl;
  log('2) invite sent to', INVITEE, '\n   url:', inviteUrl);

  // 2) BROWSER — accept in a clean, logged-out context
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();          // fresh = NOT logged in
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log('   [console.error]', m.text()); });

  log('3) open accept-invite URL in clean browser context');
  await page.goto(inviteUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const showsWorkspace = bodyText.includes(WORKSPACE);
  const showsRole = /Agent/i.test(bodyText);
  const showsInvitee = bodyText.includes(INVITEE);
  log('   page shows workspace name:', showsWorkspace);
  log('   page shows role "Agent": ', showsRole);
  log('   page shows invitee email:', showsInvitee);
  await page.screenshot({ path: 'scripts/accept-invite-page.png', fullPage: true });

  log('4) set password + submit');
  await page.getByLabel('Set a password').fill(INVITEE_PW);
  await page.getByRole('button', { name: /Accept invitation/i }).click();

  log('5) expect redirect to dashboard (logged in as invited agent)');
  let landedDashboard = false;
  try {
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    landedDashboard = true;
  } catch { /* will report below */ }
  await page.waitForTimeout(1500);
  log('   landed on dashboard:', landedDashboard, '| url:', page.url());
  await page.screenshot({ path: 'scripts/accept-invite-after.png', fullPage: true });
  await browser.close();

  // 3) admin A sees the invitee as an active agent in A's workspace
  const agentsRes = await axios.get(`${GW}/agents`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const agents = agentsRes.data.data;
  const found = agents.find((a) => a.email === INVITEE);
  log('\n6) GET /agents as admin A — members:');
  agents.forEach((a) => log(`   - ${a.firstName} ${a.lastName} <${a.email}> role=${a.role} active=${a.isActive} tenant=${a.tenantId}`));
  const inviteeOk = !!found && found.role === 'agent' && found.isActive === true && found.tenantId === adminTenantId;
  log('   invitee is active agent in A\'s tenant:', inviteeOk);

  // 4) invited user can log in with the password they set
  let loginOk = false;
  try {
    const login = await axios.post(`${GW}/auth/login`, { email: INVITEE, password: INVITEE_PW });
    const tid = JSON.parse(Buffer.from(login.data.data.accessToken.split('.')[1], 'base64').toString()).tid;
    loginOk = login.data.success && tid === adminTenantId;
    log('7) invitee login works, same tenant as A:', loginOk);
  } catch (e) { log('7) invitee login FAILED:', e.response?.status, e.response?.data?.error?.message); }

  const pass = showsWorkspace && showsRole && landedDashboard && inviteeOk && loginOk;
  log(`\nRESULT: ${pass ? 'PASS ✅ accept-invite works end to end' : 'FAIL ❌'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e.response?.status, e.response?.data || e.message); process.exit(2); });
