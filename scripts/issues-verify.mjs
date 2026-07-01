// Proves Issues 1, 2, 3 against the LIVE deployment via the API.
import axios from '../node_modules/axios/index.js';

const GW = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const ts = Date.now();
const log = (...a) => console.log(...a);
const post = (path, body, token) =>
  axios.post(`${GW}${path}`, body, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);

const register = (email, workspace) =>
  post('/auth/register', { tenantName: workspace, firstName: 'A', lastName: 'B', email, password: 'Verify!Pass123' });
const tokenFrom = (u) => u.split('token=')[1];

let pass2 = false, pass1 = false, pass3 = false;

async function issue2() {
  log('\n══════ ISSUE 2 — duplicate registration blocked ══════');
  const X = `dup+${ts}@flowdesk.test`;
  const first = await register(X, `Dup ${ts}`);
  log('1st register:', first.status, JSON.stringify(first.data).slice(0, 90));
  try {
    const second = await register(X, `Dup2 ${ts}`);
    log('2nd register:', second.status, '(expected 409!) ->', JSON.stringify(second.data));
  } catch (e) {
    log('2nd register:', e.response?.status, JSON.stringify(e.response?.data?.error));
    pass2 = e.response?.status === 409 && /already exists/i.test(e.response?.data?.error?.message || '');
  }
  log('ISSUE 2:', pass2 ? 'PASS ✅' : 'FAIL ❌');
}

async function issue1() {
  log('\n══════ ISSUE 1 — one email, one workspace (invite) ══════');
  const adminA = `admА+${ts}@flowdesk.test`.replace('А', 'a');
  const adminB = `admb+${ts}@flowdesk.test`;
  const Y = `shared+${ts}@flowdesk.test`;

  const regA = await register(adminA, `WsA ${ts}`);
  const invA = await post('/auth/invite', { email: Y, firstName: 'Y', lastName: 'Y', role: 'agent' }, regA.data.data.accessToken);
  const tokA = tokenFrom(invA.data.data.inviteUrl);
  const acceptA = await post('/auth/accept-invite', { token: tokA, password: 'Verify!Pass123', firstName: 'Y', lastName: 'Y' });
  log(`Y accepted into workspace A: ${acceptA.status} (Y is now an agent in A)`);

  const regB = await register(adminB, `WsB ${ts}`);
  const invB = await post('/auth/invite', { email: Y, firstName: 'Y', lastName: 'Y', role: 'agent' }, regB.data.data.accessToken);
  const tokB = tokenFrom(invB.data.data.inviteUrl);
  try {
    const acceptB = await post('/auth/accept-invite', { token: tokB, password: 'Verify!Pass123', firstName: 'Y', lastName: 'Y' });
    log('Y accept into workspace B:', acceptB.status, '(expected 409!) ->', JSON.stringify(acceptB.data));
  } catch (e) {
    log('Y accept into workspace B:', e.response?.status, JSON.stringify(e.response?.data?.error));
    pass1 = e.response?.status === 409 && /belongs to a FlowDesk workspace/i.test(e.response?.data?.error?.message || '');
  }
  log('ISSUE 1:', pass1 ? 'PASS ✅' : 'FAIL ❌');
}

async function issue3() {
  log('\n══════ ISSUE 3 — resolve from open and in_progress ══════');
  const admin = `resolver+${ts}@flowdesk.test`;
  const reg = await register(admin, `Resolve ${ts}`);
  const tk = reg.data.data.accessToken;

  const mkTicket = async (title) => (await post('/tickets', { title, description: 'd', priority: 'high', tags: ['x'] }, tk)).data.data.id;
  const patch = (id, body) => axios.patch(`${GW}/tickets/${id}`, body, { headers: { Authorization: `Bearer ${tk}` } });
  const getStatus = async (id) => (await axios.get(`${GW}/tickets/${id}`, { headers: { Authorization: `Bearer ${tk}` } })).data.data.status;

  // A) open -> resolved
  const t1 = await mkTicket('Direct resolve from open');
  const r1 = await patch(t1, { status: 'resolved' });
  const s1 = await getStatus(t1);
  log(`open -> resolved: PATCH ${r1.status}, GET status = "${s1}"`);

  // B) in_progress -> resolved
  const t2 = await mkTicket('Resolve via in_progress');
  await patch(t2, { status: 'in_progress' });
  const r2 = await patch(t2, { status: 'resolved' });
  const s2 = await getStatus(t2);
  log(`in_progress -> resolved: PATCH ${r2.status}, GET status = "${s2}"`);

  // C) Resolved Today count on the dashboard analytics
  let resolvedToday = -1;
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const ov = await axios.get(`${GW}/analytics/overview?fresh=true`, { headers: { Authorization: `Bearer ${tk}` } });
    resolvedToday = ov.data.data.stats.resolvedToday;
    if (resolvedToday >= 2) break;
  }
  log(`dashboard "Resolved Today" = ${resolvedToday}`);

  pass3 = s1 === 'resolved' && s2 === 'resolved' && resolvedToday >= 2;
  log('ISSUE 3:', pass3 ? 'PASS ✅' : 'FAIL ❌');
}

async function main() {
  await issue2();
  await issue1();
  await issue3();
  log('\n══════ SUMMARY ══════');
  log(`Issue 1 (one email/workspace, invite): ${pass1 ? 'PASS ✅' : 'FAIL ❌'}`);
  log(`Issue 2 (duplicate registration 409):  ${pass2 ? 'PASS ✅' : 'FAIL ❌'}`);
  log(`Issue 3 (resolve from open/in_progress):${pass3 ? 'PASS ✅' : 'FAIL ❌'}`);
  process.exit(pass1 && pass2 && pass3 ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e.response?.status, e.response?.data || e.message); process.exit(2); });
