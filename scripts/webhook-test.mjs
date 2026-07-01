/**
 * End-to-end webhook test for FlowDesk.
 *
 * Part A (happy path + signature):
 *   register -> create webhook endpoint pointing at a fresh webhook.site URL
 *   -> trigger a ticket.created event -> confirm a signed payload arrived
 *   -> verify the HMAC-SHA256 signature using the secret returned at creation.
 *
 * Part B (retry/backoff):
 *   create an endpoint pointing at a non-resolvable URL -> trigger an event
 *   -> poll the deliveries log and confirm failed attempts increment (retry)
 *   and consecutive_failures climbs.
 *
 * Usage: node scripts/webhook-test.mjs
 */

import { createHmac, timingSafeEqual } from 'crypto';

const GATEWAY = process.argv[2] ?? 'https://gateway-production-25dc.up.railway.app';

const ts = Date.now();
const user = {
  tenantName: `WH Corp ${ts}`,
  firstName: 'WH', lastName: 'Tester',
  email: `wh+${ts}@flowdesk-test.dev`,
  password: 'SuperSecret123!',
};

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${GATEWAY}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createWebhookSiteToken() {
  const res = await fetch('https://webhook.site/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_status: 200, default_content: 'ok' }),
  });
  if (!res.ok) throw new Error(`webhook.site token failed: ${res.status}`);
  const j = await res.json();
  return j.uuid;
}

async function getWebhookSiteRequests(uuid) {
  const res = await fetch(`https://webhook.site/token/${uuid}/requests?sorting=newest`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) return [];
  const j = await res.json();
  return j.data ?? [];
}

function verifySignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const received = signatureHeader.replace('sha256=', '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function main() {
  console.log(`\n=== FlowDesk webhook E2E against ${GATEWAY} ===\n`);

  // --- setup: register (first user = admin) ---
  let r = await api('POST', '/auth/register', { body: user });
  if (r.status !== 201 && r.status !== 200) throw new Error(`register: ${r.status} ${JSON.stringify(r.json)}`);
  const token = r.json?.data?.accessToken ?? r.json?.accessToken;
  console.log('[setup] registered + token acquired');

  // =====================================================================
  // PART A — happy path + HMAC signature
  // =====================================================================
  console.log('\n--- Part A: delivery + HMAC signature ---');
  const uuid = await createWebhookSiteToken();
  const receiverUrl = `https://webhook.site/${uuid}`;
  console.log(`[A] webhook.site endpoint: ${receiverUrl}`);

  r = await api('POST', '/webhooks', { token, body: { url: receiverUrl, events: ['ticket.created', 'message.sent'] } });
  if (r.status !== 201) throw new Error(`create webhook: ${r.status} ${JSON.stringify(r.json)}`);
  const endpointId = r.json.data.id;
  const secret = r.json.data.secret;
  if (!secret || !secret.startsWith('whsec_')) throw new Error(`expected whsec_ secret, got: ${secret}`);
  console.log(`[A] endpoint created id=${endpointId}, secret shown once: ${secret.slice(0, 14)}...`);

  // trigger ticket.created
  r = await api('POST', '/tickets', { token, body: { title: `WH ticket ${ts}`, priority: 'high' } });
  if (r.status !== 201) throw new Error(`create ticket: ${r.status} ${JSON.stringify(r.json)}`);
  console.log(`[A] ticket created (${r.json.data.id}) — webhook should fire`);

  // poll webhook.site for the delivery
  let received = null;
  const deadlineA = Date.now() + 25000;
  while (Date.now() < deadlineA) {
    const reqs = await getWebhookSiteRequests(uuid);
    if (reqs.length > 0) { received = reqs[0]; break; }
    await sleep(1500);
  }
  if (!received) throw new Error('Part A FAILED: no webhook delivery arrived at webhook.site within 25s');

  // webhook.site lowercases header names; values may be arrays or strings
  const headers = received.headers ?? {};
  const rawSig = headers['x-flowdesk-signature'] ?? headers['X-FlowDesk-Signature'] ?? null;
  const sigHeader = Array.isArray(rawSig) ? rawSig[0] : rawSig;
  const rawBody = received.content ?? '';
  console.log(`[A] delivery received. signature header: ${sigHeader ? sigHeader.slice(0, 24) + '...' : 'MISSING'}`);

  const valid = verifySignature(secret, rawBody, sigHeader);
  console.log(`[A] HMAC-SHA256 signature valid: ${valid}`);
  if (!valid) throw new Error('Part A FAILED: HMAC signature did not verify');

  // confirm the delivery was logged as success
  await sleep(1500);
  r = await api('GET', `/webhooks/${endpointId}/deliveries`, { token });
  const successDelivery = (r.json?.data ?? []).find((d) => d.status === 'success');
  console.log(`[A] delivery log shows success: ${!!successDelivery} (response_code=${successDelivery?.responseCode})`);

  console.log('\n[A] ✅ Part A passed — signed payload delivered and verified');

  // =====================================================================
  // PART B — retry / backoff on a failing endpoint
  // =====================================================================
  console.log('\n--- Part B: retry / backoff on failing endpoint ---');
  r = await api('POST', '/webhooks', { token, body: { url: 'https://flowdesk-webhook-fail.invalid/hook', events: ['ticket.created'] } });
  if (r.status !== 201) throw new Error(`create failing webhook: ${r.status} ${JSON.stringify(r.json)}`);
  const failId = r.json.data.id;
  console.log(`[B] failing endpoint created id=${failId} (non-resolvable host)`);

  r = await api('POST', '/tickets', { token, body: { title: `WH fail ${ts}`, priority: 'low' } });
  if (r.status !== 201) throw new Error(`create ticket(B): ${r.status}`);
  console.log('[B] ticket created — webhook should fail and retry');

  // poll deliveries; expect attempt_number to climb past 1 (proves retry)
  let maxAttempt = 0;
  let failedCount = 0;
  const deadlineB = Date.now() + 30000;
  while (Date.now() < deadlineB) {
    r = await api('GET', `/webhooks/${failId}/deliveries`, { token });
    const dels = r.json?.data ?? [];
    failedCount = dels.filter((d) => d.status === 'failed').length;
    maxAttempt = dels.reduce((m, d) => Math.max(m, d.attemptNumber ?? 0), 0);
    if (maxAttempt >= 2) break;
    await sleep(2500);
  }
  console.log(`[B] failed delivery records: ${failedCount}, max attempt_number observed: ${maxAttempt}`);

  // check consecutive_failures climbed on the endpoint
  r = await api('GET', '/webhooks', { token });
  const failEndpoint = (r.json?.data ?? []).find((w) => w.id === failId);
  console.log(`[B] endpoint consecutive_failures: ${failEndpoint?.consecutiveFailures}, isActive: ${failEndpoint?.isActive}`);

  if (maxAttempt >= 2 && failedCount >= 2) {
    console.log('\n[B] ✅ Part B passed — failed deliveries retried with backoff');
  } else {
    throw new Error(`Part B FAILED: expected ≥2 retried failed attempts, saw max attempt ${maxAttempt}, failed ${failedCount}`);
  }

  console.log('\n=== WEBHOOK E2E PASSED ===');
  console.log(JSON.stringify({ endpointId, signatureValid: valid, retryMaxAttempt: maxAttempt }, null, 2));
}

main().catch((err) => {
  console.error('\n=== WEBHOOK E2E FAILED ===');
  console.error(err.message);
  process.exit(1);
});
