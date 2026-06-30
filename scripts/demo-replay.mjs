// Faithfully replays EXACTLY what the frontend loadDemoData() does, in order,
// using the same axios instance config as frontend/src/lib/api.ts — but logs
// every error that the production silent catch blocks would hide.
import axios from '../node_modules/axios/index.js';

const GATEWAY = process.env.GATEWAY || 'https://gateway-production-25dc.up.railway.app';
const ts = Date.now();
const ADMIN_EMAIL = `replay+${ts}@flowdesk.test`;

function log(...a) { console.log(...a); }

async function main() {
  // 1) Register a brand-new account (what the user did in the browser)
  const reg = await axios.post(`${GATEWAY}/auth/register`, {
    tenantName: `Replay ${ts}`, firstName: 'Re', lastName: 'Play',
    email: ADMIN_EMAIL, password: 'Replay!Pass123',
  });
  const token = reg.data?.data?.accessToken;
  log('registered admin:', ADMIN_EMAIL, '| token len:', token?.length);

  // Recreate the frontend `api` instance EXACTLY (api.ts)
  const api = axios.create({
    baseURL: GATEWAY,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });
  api.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // ---- replay loadDemoData() ----
  const ticketData = [
    { title: 'Cannot login to dashboard', description: 'd', priority: 'high', tags: ['auth','bug'] },
    { title: 'Billing invoice not received', description: 'd', priority: 'medium', tags: ['billing'] },
    { title: 'Feature request: dark mode', description: 'd', priority: 'low', tags: ['feature-request','ui'] },
    { title: 'API rate limit too restrictive', description: 'd', priority: 'high', tags: ['api','limits'] },
    { title: 'Integration with Slack broken', description: 'd', priority: 'urgent', tags: ['integration','slack'] },
    { title: 'Export tickets to CSV', description: 'd', priority: 'medium', tags: ['export','feature-request'] },
    { title: 'Response time SLA breach', description: 'd', priority: 'urgent', tags: ['sla','performance'] },
    { title: 'Mobile app crashes on iOS 17', description: 'd', priority: 'high', tags: ['mobile','ios','bug'] },
    { title: 'Custom domain setup help', description: 'd', priority: 'medium', tags: ['setup','dns'] },
    { title: 'Webhook not firing on ticket close', description: 'd', priority: 'high', tags: ['webhook','bug'] },
  ];

  const createdTickets = [];
  for (const ticket of ticketData) {
    try {
      const { data } = await api.post('/tickets', ticket);
      if (data.success && data.data) createdTickets.push(data.data);
    } catch (e) { log('  [tickets] FAILED:', e.response?.status, e.response?.data?.error?.message || e.message); }
  }
  log(`tickets created: ${createdTickets.length}/10`);

  // demo agents — the suspect call
  const demoAgents = [];
  try {
    const { data } = await api.post('/auth/demo-agents');
    log('demo-agents RAW response:', JSON.stringify(data));
    if (data.success && data.data?.agents) demoAgents.push(...data.data.agents);
  } catch (e) {
    log('  [demo-agents] FAILED:', e.response?.status, JSON.stringify(e.response?.data) || e.message);
  }
  log(`demoAgents parsed: ${demoAgents.length}`, demoAgents.map(a => a.id));

  // assignments
  if (demoAgents.length > 0) {
    const assignments = [0,1,3,4,6,7];
    for (let i = 0; i < assignments.length; i++) {
      const ticket = createdTickets[assignments[i]];
      const agent = demoAgents[i % demoAgents.length];
      if (!ticket || !agent) continue;
      try { await api.patch(`/tickets/${ticket.id}`, { assignedTo: agent.id }); }
      catch (e) { log('  [assign] FAILED:', e.response?.status, e.response?.data?.error?.message || e.message); }
    }
  }

  // ---- VERIFY like the user would ----
  const agentsRes = await api.get('/agents');
  const agents = agentsRes.data.data;
  log('\n=== GET /agents -> count:', Array.isArray(agents) ? agents.length : 'NOT ARRAY');
  for (const a of agents) log(`   - ${a.firstName} ${a.lastName} (${a.role})`);

  const tk = await api.get('/tickets?pageSize=20&sortBy=created_at&sortOrder=desc');
  const withAssignee = (tk.data.data.tickets || []).filter(t => t.assignee).length;
  log(`=== tickets with assignee: ${withAssignee}`);

  const ok = agents.length === 4 && withAssignee > 0;
  log(`\nRESULT: ${ok ? 'PASS ✅ (4 members + assignees)' : 'FAIL ❌'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e.response?.status, e.response?.data || e.message); process.exit(2); });
