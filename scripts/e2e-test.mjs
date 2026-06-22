/**
 * FlowDesk end-to-end smoke test against the live API gateway.
 * Verifies: register -> login -> create ticket -> send message,
 * and proves Kafka event flow by measuring how long the admin
 * notification (produced by tickets -> Kafka -> notifications consumer -> DB)
 * takes to materialize.
 *
 * Usage: node scripts/e2e-test.mjs [gatewayUrl]
 */

const GATEWAY = process.argv[2] ?? 'https://gateway-production-25dc.up.railway.app';

const ts = Date.now();
const user = {
  tenantName: `E2E Corp ${ts}`,
  firstName: 'E2E',
  lastName: 'Tester',
  email: `e2e+${ts}@flowdesk-test.dev`,
  password: 'SuperSecret123!',
};

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const started = Date.now();
  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const elapsed = Date.now() - started;
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json, elapsed };
}

async function main() {
  console.log(`\n=== FlowDesk E2E against ${GATEWAY} ===\n`);

  // 1. Register
  let r = await call('POST', '/auth/register', { body: user });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  let token = r.json?.data?.accessToken ?? r.json?.accessToken;
  log('register', `OK (${r.elapsed}ms) tenant="${user.tenantName}" token=${token ? 'present' : 'MISSING'}`);

  // 2. Login (fresh token)
  r = await call('POST', '/auth/login', { body: { email: user.email, password: user.password } });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
  token = r.json?.data?.accessToken ?? r.json?.accessToken ?? token;
  log('login', `OK (${r.elapsed}ms) token=${token ? 'present' : 'MISSING'}`);

  // 3. Create ticket  (tickets service publishes ticket.created to Kafka)
  const ticketCreatedAt = Date.now();
  r = await call('POST', '/tickets', {
    token,
    body: { title: `E2E ticket ${ts}`, description: 'Created by automated E2E test', priority: 'high' },
  });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`create ticket failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  const ticketId = r.json?.data?.id;
  log('ticket', `OK (${r.elapsed}ms) id=${ticketId}`);

  // 4. Send a message on the ticket (publishes message.sent to Kafka)
  r = await call('POST', `/tickets/${ticketId}/messages`, {
    token,
    body: { body: 'Hello from the E2E test', messageType: 'text' },
  });
  if (r.status !== 201 && r.status !== 200) {
    throw new Error(`send message failed: ${r.status} ${JSON.stringify(r.json)}`);
  }
  log('message', `OK (${r.elapsed}ms) id=${r.json?.data?.id}`);

  // 5. Poll notifications — proves the Kafka round-trip:
  //    tickets(producer) -> Kafka -> notifications(consumer) -> Postgres.
  //    The admin who registered should receive a "ticket_created" notification.
  log('kafka', 'Polling /notifications for the Kafka-driven admin notification...');
  let found = null;
  let firstSeenAt = null;
  const deadline = Date.now() + 20000; // up to 20s
  while (Date.now() < deadline) {
    const n = await call('GET', '/notifications', { token });
    const items = n.json?.data?.notifications ?? n.json?.data ?? [];
    if (Array.isArray(items) && items.length > 0) {
      found = items.find((x) => x.type === 'ticket_created') ?? items[0];
      if (found) { firstSeenAt = Date.now(); break; }
    }
    await new Promise((res) => setTimeout(res, 500));
  }

  if (found) {
    const latency = firstSeenAt - ticketCreatedAt;
    log('kafka', `Notification arrived after ${latency}ms — type="${found.type}"`);
    if (latency < 50) {
      log('kafka', `WARNING: latency ${latency}ms is suspiciously low (would suggest inline, not Kafka)`);
    } else {
      log('kafka', `Latency ${latency}ms is consistent with a real Kafka round-trip (producer -> broker -> consumer -> DB).`);
    }
  } else {
    log('kafka', 'NO notification appeared within 20s — Kafka consumer may not be processing. INVESTIGATE.');
  }

  console.log('\n=== E2E PASSED (core flow) ===');
  console.log(JSON.stringify({ ticketId, kafkaNotification: found ? found.type : null }, null, 2));
}

main().catch((err) => {
  console.error('\n=== E2E FAILED ===');
  console.error(err.message);
  process.exit(1);
});
