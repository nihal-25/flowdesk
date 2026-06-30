import axios from 'axios';
import { api } from './api';

/** Extracts a human-readable reason from an axios/unknown error. */
function errReason(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    const msg = (e.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return `${status ?? 'network'}${msg ? ` ${msg}` : ` ${e.message}`}`;
  }
  return e instanceof Error ? e.message : 'Unknown error';
}

export async function loadDemoData(): Promise<{ success: boolean; message: string }> {
  try {
    // Create demo tickets
    const ticketData = [
      { title: 'Cannot login to dashboard', description: 'Getting 401 error when trying to sign in after password reset.', priority: 'high' as const, tags: ['auth', 'bug'] },
      { title: 'Billing invoice not received', description: 'Expected invoice for March subscription but nothing in inbox.', priority: 'medium' as const, tags: ['billing'] },
      { title: 'Feature request: dark mode', description: 'Would love a dark mode option for evening use.', priority: 'low' as const, tags: ['feature-request', 'ui'] },
      { title: 'API rate limit too restrictive', description: 'Hitting 429 errors on the free plan with normal usage.', priority: 'high' as const, tags: ['api', 'limits'] },
      { title: 'Integration with Slack broken', description: 'Slack notifications stopped working after the latest update.', priority: 'urgent' as const, tags: ['integration', 'slack'] },
      { title: 'Export tickets to CSV', description: 'Need to export ticket history for compliance reporting.', priority: 'medium' as const, tags: ['export', 'feature-request'] },
      { title: 'Response time SLA breach', description: 'Multiple tickets exceeded 24-hour response SLA this week.', priority: 'urgent' as const, tags: ['sla', 'performance'] },
      { title: 'Mobile app crashes on iOS 17', description: 'App force-closes immediately on launch on iPhone 15.', priority: 'high' as const, tags: ['mobile', 'ios', 'bug'] },
      { title: 'Custom domain setup help', description: 'Need guidance on setting up flowdesk.mycompany.com subdomain.', priority: 'medium' as const, tags: ['setup', 'dns'] },
      { title: 'Webhook not firing on ticket close', description: 'Configured webhook for ticket.closed event but endpoint receives nothing.', priority: 'high' as const, tags: ['webhook', 'bug'] },
    ];

    const createdTickets: { id: string }[] = [];
    for (const ticket of ticketData) {
      try {
        const { data } = await api.post<{ success: boolean; data?: { id: string } }>('/tickets', ticket);
        if (data.success && data.data) createdTickets.push(data.data);
      } catch { /* a single ticket failing is non-fatal */ }
    }

    // Create the demo agents (Sarah Chen, Marcus Johnson, Priya Patel) directly
    // in the tenant. This is a core part of "demo data" — if it fails we surface
    // the real reason instead of silently swallowing it.
    const demoAgents: { id: string }[] = [];
    let agentError = '';
    try {
      const { data } = await api.post<{ success: boolean; data?: { agents: { id: string }[] } }>('/auth/demo-agents');
      if (data.success && Array.isArray(data.data?.agents)) {
        demoAgents.push(...data.data!.agents);
      } else {
        agentError = `unexpected response shape: ${JSON.stringify(data).slice(0, 160)}`;
      }
    } catch (e) {
      agentError = errReason(e);
    }

    // Assign a realistic subset of tickets to the agents (round-robin), leaving
    // some unassigned so the board shows a mix.
    let assignedCount = 0;
    if (demoAgents.length > 0) {
      const assignments = [0, 1, 3, 4, 6, 7]; // ticket indexes to assign
      for (let i = 0; i < assignments.length; i++) {
        const ticket = createdTickets[assignments[i]!];
        const agent = demoAgents[i % demoAgents.length];
        if (!ticket || !agent) continue;
        try {
          await api.patch(`/tickets/${ticket.id}`, { assignedTo: agent.id });
          assignedCount++;
        } catch { /* a single assignment failing is non-fatal */ }
      }
    }

    // Add messages to first few tickets
    const messages = [
      'Hi team, can someone look into this urgently? Our customers are impacted.',
      'I am investigating this now. Looks like a configuration issue.',
      'Found the root cause — pushing a fix in 30 minutes.',
    ];
    for (let i = 0; i < Math.min(3, createdTickets.length); i++) {
      const ticket = createdTickets[i];
      if (!ticket) continue;
      for (const body of messages) {
        try {
          await api.post(`/tickets/${ticket.id}/messages`, { body, messageType: 'text' });
        } catch { /* ignore */ }
      }
    }

    // Move a couple tickets along the workflow (open -> in_progress -> resolved).
    // Note: status transitions are validated server-side, so step through them.
    const progressions: string[][] = [
      ['in_progress'],
      ['in_progress', 'resolved'],
      ['in_progress'],
    ];
    for (let i = 0; i < Math.min(progressions.length, createdTickets.length); i++) {
      const ticket = createdTickets[i];
      if (!ticket) continue;
      for (const status of progressions[i]!) {
        try {
          await api.patch(`/tickets/${ticket.id}`, { status });
        } catch { /* ignore */ }
      }
    }

    // Agents are a core part of demo data — if none were created, report failure
    // with the real reason rather than a misleading success.
    if (demoAgents.length === 0) {
      return {
        success: false,
        message: `Created ${createdTickets.length} tickets, but agent creation FAILED (${agentError || 'no agents returned'}). Try again or check the auth service.`,
      };
    }

    return {
      success: true,
      message: `Created ${createdTickets.length} tickets, ${demoAgents.length} agents, and ${assignedCount} assignments.`,
    };
  } catch (err) {
    return { success: false, message: `Demo data failed: ${errReason(err)}` };
  }
}
