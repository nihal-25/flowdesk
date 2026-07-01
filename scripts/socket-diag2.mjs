// Two-socket cross-client diagnostic: does a second client in a room receive
// events triggered by the first? Tests presence broadcast + message:new + notif.
import axios from '../node_modules/axios/index.js';
import { io } from '../node_modules/socket.io-client/build/esm/index.js';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const CHAT = 'https://chat-production-6818.up.railway.app';
const ts = Date.now();
const log = (...a) => console.log(...a);
const api = (path, method = 'get', body, token) =>
  axios({ url: `${GW}${path}`, method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
const connect = (token) => new Promise((res, rej) => {
  const s = io(CHAT, { auth: { token }, transports: ['websocket', 'polling'] });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => rej(new Error(e.message)));
  setTimeout(() => rej(new Error('timeout')), 10000);
});

async function main() {
  // admin A + agent B in same tenant
  const regA = await api('/auth/register', 'post', { tenantName: `SD2 ${ts}`, firstName: 'A', lastName: 'A', email: `sd2a+${ts}@flowdesk.test`, password: 'Diag!123' });
  const tokenA = regA.data.data.accessToken;
  const inv = await api('/auth/invite', 'post', { email: `sd2b+${ts}@flowdesk.test`, firstName: 'B', lastName: 'B', role: 'agent' }, tokenA);
  await api('/auth/accept-invite', 'post', { token: inv.data.data.inviteUrl.split('token=')[1], password: 'Diag!123', firstName: 'B', lastName: 'B' });
  const loginB = await api('/auth/login', 'post', { email: `sd2b+${ts}@flowdesk.test`, password: 'Diag!123' });
  const tokenB = loginB.data.data.accessToken;
  const bId = JSON.parse(Buffer.from(tokenB.split('.')[1], 'base64').toString()).sub;
  const ticket = (await api('/tickets', 'post', { title: `t ${ts}`, description: 'd', priority: 'high', tags: [] }, tokenA)).data.data;

  const sA = await connect(tokenA);
  const eventsA = [];
  sA.onAny((n) => { eventsA.push(n); log(`  A << ${n}`); });
  await new Promise((r) => setTimeout(r, 800));

  log('connecting B (A should get presence:update for B)...');
  const sB = await connect(tokenB);
  const eventsB = [];
  sB.onAny((n) => { eventsB.push(n); log(`  B << ${n}`); });
  sB.emit('join:ticket', { ticketId: ticket.id });
  await new Promise((r) => setTimeout(r, 2000));

  log('A posts a message (B, in the ticket room, should get message:new)...');
  await api(`/tickets/${ticket.id}/messages`, 'post', { body: 'x', messageType: 'text' }, tokenA);
  await new Promise((r) => setTimeout(r, 3000));

  log('A assigns ticket to B (B should get notification:new)...');
  await api(`/tickets/${ticket.id}`, 'patch', { assignedTo: bId }, tokenA);
  await new Promise((r) => setTimeout(r, 4000));

  log('\n─ RESULTS ─');
  log(`A got presence:update for B's connect: ${eventsA.filter((e) => e === 'presence:update').length >= 1}`);
  log(`B got message:new (cross-client, ticket room): ${eventsB.includes('message:new')}`);
  log(`B got notification:new (user room): ${eventsB.includes('notification:new')}`);
  log(`A events: [${eventsA.join(', ')}]`);
  log(`B events: [${eventsB.join(', ')}]`);
  sA.close(); sB.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
