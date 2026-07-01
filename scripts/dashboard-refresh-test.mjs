// Proves the dashboard updates within a couple seconds of Load Demo Data
// FINISHING (not from the click — the seed itself makes ~28 sequential calls).
// Registers a fresh account in a real browser, clicks the button, and measures
// the latency between demo completion and the dashboard reflecting the data.
import { chromium } from 'playwright';

const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const email = `dashrefresh+${ts}@flowdesk.test`;
const password = 'Dash!Pass123';
const log = (...a) => console.log(...a);

// Reads dashboard state. Card value = the <p> immediately after the title <p>.
const readState = () => {
  const valueByTitle = (title) => {
    const ps = [...document.querySelectorAll('p')];
    const t = ps.find((p) => p.textContent?.trim() === title);
    return t?.nextElementSibling?.textContent?.trim() ?? '?';
  };
  const msgMatch = document.body.innerText.match(/Created \d+ tickets, \d+ agents, and \d+ assignments\./);
  return {
    openTickets: valueByTitle('Open Tickets'),
    activeAgents: valueByTitle('Active Agents'),
    chartHasData: !/No data yet/.test(document.body.innerText),
    recentTicketsRows: document.querySelectorAll('table tbody tr').length,
    hasNoTicketsEmpty: /No tickets yet/.test(document.body.innerText),
    seedMessage: msgMatch ? msgMatch[0] : null,
  };
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  log('1) register fresh account:', email);
  await page.goto(`${SITE}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel('Company / workspace name').fill(`DashRefresh ${ts}`);
  await page.getByLabel('First name', { exact: true }).fill('Dash');
  await page.getByLabel('Last name', { exact: true }).fill('Refresh');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const before = await page.evaluate(readState);
  log('2) BEFORE demo:', JSON.stringify(before));
  await page.screenshot({ path: 'scripts/dash-before.png', fullPage: true });

  const demoBtn = page.getByRole('button', { name: /Load Demo Data/i });
  log('3) click Load Demo Data (seed makes ~28 sequential calls, ~15-18s)');
  await demoBtn.click();

  const tClick = Date.now();
  let tComplete = null;   // when the seed finished (button re-enabled)
  let tUpdated = null;    // when the dashboard reflected the data
  let seedSeconds = null;
  let last = before;

  for (let i = 0; i < 120; i++) {         // up to ~36s
    await page.waitForTimeout(300);
    const disabled = await demoBtn.isDisabled().catch(() => false);
    const s = await page.evaluate(readState);
    last = s;

    if (tComplete === null && !disabled && i > 1) {
      tComplete = Date.now();
      seedSeconds = ((tComplete - tClick) / 1000).toFixed(1);
      log(`   >>> SEED COMPLETED in ${seedSeconds}s (was ~16s before parallelizing)`);
    }
    const cardsUpdated = !['—', '0', '?'].includes(s.openTickets);
    const ticketsUpdated = s.recentTicketsRows > 0 && !s.hasNoTicketsEmpty;
    const chartUpdated = s.chartHasData;
    if (tComplete !== null && cardsUpdated && ticketsUpdated && chartUpdated) {
      tUpdated = Date.now();
      break;
    }
  }

  await page.waitForTimeout(300);
  const after = await page.evaluate(readState);
  await page.screenshot({ path: 'scripts/dash-after.png', fullPage: true });
  log('4) AFTER:', JSON.stringify(after));
  await browser.close();

  const refreshLatency = (tComplete && tUpdated) ? ((tUpdated - tComplete) / 1000).toFixed(1) : null;
  log(`\n   demo->dashboard refresh latency: ${refreshLatency}s (no manual reload)`);

  const cardsOk = !['—', '0', '?'].includes(after.openTickets);
  const ticketsOk = after.recentTicketsRows > 0;
  const chartOk = after.chartHasData;
  const fast = refreshLatency !== null && parseFloat(refreshLatency) <= 5;
  const countsOk = after.seedMessage === 'Created 10 tickets, 3 agents, and 6 assignments.';
  const seedFast = seedSeconds !== null && parseFloat(seedSeconds) <= 7;
  const pass = cardsOk && ticketsOk && chartOk && fast && countsOk && seedFast;
  log(`\n   seed message: "${after.seedMessage}"`);
  log(`   seed time: ${seedSeconds}s | refresh latency: ${refreshLatency}s`);
  log(`RESULT: ${pass ? 'PASS ✅' : 'FAIL ❌'}  seed=${seedSeconds}s(≤7:${seedFast}) counts=${countsOk} refresh=${refreshLatency}s openTickets=${after.openTickets} activeAgents=${after.activeAgents} recentRows=${after.recentTicketsRows} chart=${chartOk}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
