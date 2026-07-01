// Tests Socket.IO connection configs from a REAL browser (correct Origin) against
// the live chat service, to find the config that stays connected + gets events.
import axios from '../node_modules/axios/index.js';
import { chromium } from 'playwright';

const GW = 'https://gateway-production-25dc.up.railway.app';
const SITE = 'https://flowdesk-orpin.vercel.app';
const CHAT = 'https://chat-production-6818.up.railway.app';
const ts = Date.now();
const log = (...a) => console.log(...a);

async function main() {
  const reg = await axios.post(`${GW}/auth/register`, { tenantName: `CM ${ts}`, firstName: 'C', lastName: 'M', email: `cm+${ts}@flowdesk.test`, password: 'Conn!123' });
  const token = reg.data.data.accessToken;
  const ticket = (await axios.post(`${GW}/tickets`, { title: `cm ${ts}`, description: 'd', priority: 'high', tags: [] }, { headers: { Authorization: `Bearer ${token}` } })).data.data;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => log('  PAGE:', m.text()));
  await page.goto(SITE, { waitUntil: 'domcontentloaded' }); // correct Origin

  for (const cfg of [
    { name: 'ws-first + reconnection (ORIGINAL app)', transports: ['websocket', 'polling'], withCredentials: false },
    { name: 'polling+ws + withCredentials (CURRENT app)', transports: ['polling', 'websocket'], withCredentials: true },
    { name: 'polling+ws, no creds, reconnection', transports: ['polling', 'websocket'], withCredentials: false },
  ]) {
    log(`\n=== config: ${cfg.name} ===`);
    const res = await page.evaluate(async ({ CHAT, token, transports, withCredentials }) => {
      const { io } = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js');
      return await new Promise((resolve) => {
        const events = [];
        let connects = 0, disconnects = 0;
        const s = io(CHAT, { auth: { token }, transports, withCredentials, reconnection: true, reconnectionDelay: 500 });
        s.onAny((n) => events.push(n));
        s.on('connect', () => { connects++; });
        s.on('disconnect', (r) => { disconnects++; events.push('DISC:' + r); });
        s.on('connect_error', (e) => events.push('ERR:' + e.message));
        setTimeout(() => { const t = s.io?.engine?.transport?.name; s.close(); resolve({ connects, disconnects, transport: t, events }); }, 15000);
      });
    }, { CHAT, token, transports: cfg.transports, withCredentials: cfg.withCredentials });
    log(`  connects=${res.connects} disconnects=${res.disconnects} finalTransport=${res.transport} events=[${res.events.join(',')}]`);
  }

  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
