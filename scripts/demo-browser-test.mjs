// Drives a REAL headless browser against the LIVE site to test the actual
// "Load Demo Data" button the way a user experiences it.
import { chromium } from 'playwright';

const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const email = `browser+${ts}@flowdesk.test`;
const password = 'Browser!Pass123';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Capture console + relevant network so nothing is hidden
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  const netLog = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/auth/demo-agents') || u.includes('/agents') || u.includes('/auth/register') || (u.includes('/tickets') && r.request().method() === 'POST')) {
      netLog.push(`${r.request().method()} ${u.replace(/https:\/\/[^/]+/, '')} -> ${r.status()}`);
    }
  });

  console.log('1) open register page');
  await page.goto(`${SITE}/register`, { waitUntil: 'networkidle' });

  console.log('2) fill + submit register form for', email);
  await page.getByLabel('Company / workspace name').fill(`Browser Co ${ts}`);
  await page.getByLabel('First name', { exact: true }).fill('Brow');
  await page.getByLabel('Last name', { exact: true }).fill('Ser');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();

  console.log('3) wait for dashboard');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.waitForLoadState('networkidle');

  console.log('4) click "Load Demo Data"');
  const demoBtn = page.getByRole('button', { name: /Load Demo Data/i });
  await demoBtn.click();

  console.log('5) wait for demo to finish (button re-enabled / message shown)');
  // The demo button shows isLoading while running; wait for it to settle, then a bit more
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Load Demo Data/i.test(x.textContent || ''));
    return b && !b.disabled;
  }, { timeout: 60000 }).catch(() => console.log('  (demo button still busy after 60s)'));
  await page.waitForTimeout(2000);

  console.log('6) navigate to Agents page');
  await page.goto(`${SITE}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Count team members by looking for the demo agent names + admin
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasSarah = /Sarah\s+Chen/i.test(bodyText);
  const hasMarcus = /Marcus\s+Johnson/i.test(bodyText);
  const hasPriya = /Priya\s+Patel/i.test(bodyText);

  console.log('\n=== NETWORK (key calls) ===');
  netLog.forEach((l) => console.log('  ' + l));

  console.log('\n=== AGENTS PAGE CONTENT CHECK ===');
  console.log('  Sarah Chen present: ', hasSarah);
  console.log('  Marcus Johnson present:', hasMarcus);
  console.log('  Priya Patel present: ', hasPriya);

  await page.screenshot({ path: 'scripts/agents-page.png', fullPage: true });
  console.log('  screenshot saved: scripts/agents-page.png');

  const teamCount = await page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+)\s+team members?/i);
    return m ? Number(m[1]) : null;
  });
  console.log('  "team members" count shown on page:', teamCount);

  console.log('7) navigate to Tickets page, check assignees');
  await page.goto(`${SITE}/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const ticketsText = await page.evaluate(() => document.body.innerText);
  const assigneeHits = ['Sarah Chen', 'Marcus Johnson', 'Priya Patel']
    .filter((n) => ticketsText.includes(n));
  const unassignedShown = /Unassigned/i.test(ticketsText);
  console.log('  assignee names visible on Tickets page:', assigneeHits.join(', ') || 'NONE');
  console.log('  some tickets still "Unassigned" (expected mix):', unassignedShown);
  await page.screenshot({ path: 'scripts/tickets-page.png', fullPage: true });
  console.log('  screenshot saved: scripts/tickets-page.png');

  await browser.close();

  const agentsOk = hasSarah && hasMarcus && hasPriya && teamCount === 4;
  const assigneesOk = assigneeHits.length > 0;
  const pass = agentsOk && assigneesOk;
  console.log(`\nBROWSER RESULT: ${pass ? 'PASS ✅' : 'FAIL ❌'}  (4 members: ${agentsOk}, assignees present: ${assigneesOk})`);
  process.exit(pass ? 0 : 1);
};

run().catch((e) => { console.error('FATAL', e); process.exit(2); });
