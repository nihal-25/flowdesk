// Proves the register PAGE surfaces the duplicate-email 409 clearly in the UI.
import axios from '../node_modules/axios/index.js';
import { chromium } from 'playwright';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const SITE = process.env.SITE || 'https://flowdesk-orpin.vercel.app';
const ts = Date.now();
const email = `uidup+${ts}@flowdesk.test`;
const log = (...a) => console.log(...a);

async function main() {
  // Pre-create the account via API so the email is already taken.
  await axios.post(`${GW}/auth/register`, { tenantName: `UiDup ${ts}`, firstName: 'U', lastName: 'D', email, password: 'Verify!Pass123' });
  log('pre-created account for', email);

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${SITE}/register`, { waitUntil: 'networkidle' });

  await page.getByLabel('Company / workspace name').fill(`UiDup Second ${ts}`);
  await page.getByLabel('First name', { exact: true }).fill('U');
  await page.getByLabel('Last name', { exact: true }).fill('D');
  await page.getByLabel('Work email').fill(email);     // same, already-taken email
  await page.getByLabel('Password', { exact: true }).fill('Verify!Pass123');
  await page.getByRole('button', { name: 'Create workspace' }).click();

  await page.waitForTimeout(2500);
  const bodyText = await page.evaluate(() => document.body.innerText);
  const stillOnRegister = page.url().includes('/register');
  const showsError = /already exists/i.test(bodyText);
  await page.screenshot({ path: 'scripts/register-dup.png', fullPage: true });
  log('URL still /register (not logged in):', stillOnRegister);
  log('error banner shows "already exists":', showsError);
  await browser.close();

  const pass = stillOnRegister && showsError;
  log(`\nRESULT: ${pass ? 'PASS ✅ register page surfaces the duplicate-email error' : 'FAIL ❌'}`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
