/**
 * Verifies FlowDesk real-time chat: simulates two browser tabs by opening two
 * Socket.IO connections, joining the same ticket room, then posting a message
 * via the REST API. Both sockets must receive the `message:new` event in real
 * time — proving the path: tickets(API) -> Redis pub/sub -> chat(WS) -> clients.
 *
 * Usage: node scripts/ws-test.mjs
 */

import { io } from 'socket.io-client';

const GATEWAY = 'https://gateway-production-25dc.up.railway.app';
const CHAT = 'https://chat-production-6818.up.railway.app';

const ts = Date.now();
const user = {
  tenantName: `WS Corp ${ts}`,
  firstName: 'WS',
  lastName: 'Tester',
  email: `ws+${ts}@flowdesk-test.dev`,
  password: 'SuperSecret123!',
};

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${GATEWAY}${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function connectTab(label, token, ticketId) {
  return new Promise((resolve, reject) => {
    const socket = io(CHAT, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 10000,
    });
    const received = [];
    socket.on('connect', () => {
      console.log(`[${label}] connected (${socket.id})`);
      socket.emit('join:ticket', { ticketId });
      setTimeout(() => resolve({ socket, received }), 500); // give join time to register
    });
    socket.on('message:new', (data) => {
      console.log(`[${label}] received message:new id=${data?.id}`);
      received.push(data);
    });
    socket.on('connect_error', (err) => reject(new Error(`[${label}] connect_error: ${err.message}`)));
    setTimeout(() => reject(new Error(`[${label}] connect timeout`)), 12000);
  });
}

async function main() {
  console.log(`\n=== FlowDesk real-time WS test ===\n`);

  let r = await api('POST', '/auth/register', { body: user });
  if (r.status !== 201 && r.status !== 200) throw new Error(`register: ${r.status} ${JSON.stringify(r.json)}`);
  const token = r.json?.data?.accessToken ?? r.json?.accessToken;
  console.log('[setup] registered + token acquired');

  r = await api('POST', '/tickets', { token, body: { title: `WS ticket ${ts}`, priority: 'medium' } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`create ticket: ${r.status} ${JSON.stringify(r.json)}`);
  const ticketId = r.json?.data?.id;
  console.log(`[setup] ticket created id=${ticketId}`);

  // Open two "tabs"
  const tabA = await connectTab('tabA', token, ticketId);
  const tabB = await connectTab('tabB', token, ticketId);
  console.log('[setup] both tabs connected and joined ticket room\n');

  // Post a message via REST — should fan out to both sockets
  const sentAt = Date.now();
  r = await api('POST', `/tickets/${ticketId}/messages`, { token, body: { body: 'real-time hello', messageType: 'text' } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`send message: ${r.status} ${JSON.stringify(r.json)}`);
  const messageId = r.json?.data?.id;
  console.log(`[action] posted message id=${messageId} via REST\n`);

  // Wait up to 8s for both tabs to receive it
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (tabA.received.some((m) => m.id === messageId) && tabB.received.some((m) => m.id === messageId)) break;
    await new Promise((res) => setTimeout(res, 200));
  }

  const gotA = tabA.received.some((m) => m.id === messageId);
  const gotB = tabB.received.some((m) => m.id === messageId);
  const latency = Date.now() - sentAt;

  tabA.socket.close();
  tabB.socket.close();

  console.log(`\n=== Result ===`);
  console.log(`tabA received: ${gotA}`);
  console.log(`tabB received: ${gotB}`);
  console.log(`fanout latency: ~${latency}ms`);

  if (gotA && gotB) {
    console.log('\n=== REAL-TIME CHAT WORKS — both tabs got the message ===');
    process.exit(0);
  } else {
    console.log('\n=== REAL-TIME FAILED — message did not reach both tabs ===');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n=== WS TEST ERROR ===');
  console.error(err.message);
  process.exit(1);
});
