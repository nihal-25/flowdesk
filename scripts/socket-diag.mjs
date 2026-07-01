// Direct backend real-time diagnostic (no browser). Connects a socket.io-client
// to the chat service, joins a ticket room, then triggers a message and an
// assignment via the API and reports which socket events actually arrive.
import axios from '../node_modules/axios/index.js';
import { io } from '../node_modules/socket.io-client/build/esm/index.js';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const CHAT = 'https://chat-production-6818.up.railway.app';
const ts = Date.now();
const log = (...a) => console.log(...a);
const api = (path, method = 'get', body, token) =>
  axios({ url: `${GW}${path}`, method, data: body, headers: token ? { Authorization: `Bearer ${token}` } : undefined });

async function main() {
  const reg = await api('/auth/register', 'post', { tenantName: `SD ${ts}`, firstName: 'S', lastName: 'D', email: `sd+${ts}@flowdesk.test`, password: 'Diag!123' });
  const token = reg.data.data.accessToken;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const userId = payload.sub, tenantId = payload.tid;
  const ticket = (await api('/tickets', 'post', { title: `SD ticket ${ts}`, description: 'd', priority: 'high', tags: [] }, token)).data.data;
  log(`user=${userId.slice(0,8)} tenant=${tenantId.slice(0,8)} ticket=${ticket.id.slice(0,8)}`);

  const events = [];
  const socket = io(CHAT, { auth: { token }, transports: ['websocket', 'polling'] });
  socket.onAny((name, data) => { events.push(name); log(`  << EVENT: ${name} ${JSON.stringify(data).slice(0, 80)}`); });

  await new Promise((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', (e) => rej(new Error('connect_error: ' + e.message)));
    setTimeout(() => rej(new Error('connect timeout')), 10000);
  });
  log('socket connected:', socket.id);

  socket.emit('join:ticket', { ticketId: ticket.id });
  await new Promise((r) => setTimeout(r, 1500));

  // 1) presence: is the connected user reported online?
  const pres = (await axios.get(`${CHAT}/presence/${tenantId}`)).data;
  log(`presence /presence/${tenantId.slice(0,8)}: ${JSON.stringify(pres.data)}  (contains me: ${pres.data?.includes(userId)})`);
  const ov = (await api('/analytics/overview?fresh=true', 'get', undefined, token)).data;
  log(`analytics activeAgents: ${ov.data.stats.activeAgents}`);

  // 2) message:new — post a message, expect a socket event
  log('posting a message...');
  await api(`/tickets/${ticket.id}/messages`, 'post', { body: 'diag message', messageType: 'text' }, token);
  await new Promise((r) => setTimeout(r, 3000));

  log(`\nEvents received: [${[...new Set(events)].join(', ') || 'NONE'}]`);
  log(`message:new received: ${events.includes('message:new')}`);
  log(`presence:update received: ${events.includes('presence:update')}`);
  socket.close();
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
