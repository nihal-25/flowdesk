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

    // ── Stage A: tickets + agents are independent → create all in parallel ──
    // Creating a ticket and creating the demo agents don't depend on each other.
    // Ticket results are kept index-aligned to ticketData (null = failed) so the
    // assignment/message/status stages can reference tickets by position.
    const createAgents = async (): Promise<{ agents: { id: string }[]; error: string }> => {
      try {
        const { data } = await api.post<{ success: boolean; data?: { agents: { id: string }[] } }>('/auth/demo-agents');
        if (data.success && Array.isArray(data.data?.agents)) {
          return { agents: data.data!.agents, error: '' };
        }
        return { agents: [], error: `unexpected response shape: ${JSON.stringify(data).slice(0, 160)}` };
      } catch (e) {
        return { agents: [], error: errReason(e) };
      }
    };

    const [ticketResults, agentOutcome] = await Promise.all([
      Promise.all(
        ticketData.map(async (ticket): Promise<{ id: string } | null> => {
          try {
            const { data } = await api.post<{ success: boolean; data?: { id: string } }>('/tickets', ticket);
            return data.success && data.data ? data.data : null;
          } catch {
            return null; // a single ticket failing is non-fatal
          }
        }),
      ),
      createAgents(),
    ]);

    const createdCount = ticketResults.filter((t): t is { id: string } => t !== null).length;
    const demoAgents = agentOutcome.agents;

    // ── Stage B: assignments (need tickets + agents) → distinct tickets, parallel ──
    let assignedCount = 0;
    if (demoAgents.length > 0) {
      const assignmentIdx = [0, 1, 3, 4, 6, 7]; // ticket indexes to assign
      const results = await Promise.all(
        assignmentIdx.map(async (idx, i): Promise<boolean> => {
          const ticket = ticketResults[idx];
          const agent = demoAgents[i % demoAgents.length];
          if (!ticket || !agent) return false;
          try {
            await api.patch(`/tickets/${ticket.id}`, { assignedTo: agent.id });
            return true;
          } catch {
            return false; // a single assignment failing is non-fatal
          }
        }),
      );
      assignedCount = results.filter(Boolean).length;
    }

    // ── Stage C: messages + status → parallel across tickets, ordered within ──
    // Different tickets run concurrently; within a ticket, messages stay in
    // conversation order and status steps through open→in_progress→resolved.
    // Runs after Stage B so a ticket isn't assigned and status-changed at once.
    const messages = [
      'Hi team, can someone look into this urgently? Our customers are impacted.',
      'I am investigating this now. Looks like a configuration issue.',
      'Found the root cause — pushing a fix in 30 minutes.',
    ];
    const progressions: Record<number, string[]> = {
      0: ['in_progress'],
      1: ['in_progress', 'resolved'],
      2: ['in_progress'],
    };
    await Promise.all(
      [0, 1, 2].map(async (idx) => {
        const ticket = ticketResults[idx];
        if (!ticket) return;
        for (const body of messages) {
          try {
            await api.post(`/tickets/${ticket.id}/messages`, { body, messageType: 'text' });
          } catch { /* ignore */ }
        }
        for (const status of progressions[idx] ?? []) {
          try {
            await api.patch(`/tickets/${ticket.id}`, { status });
          } catch { /* ignore */ }
        }
      }),
    );

    // Agents are a core part of demo data — if none were created, report failure
    // with the real reason rather than a misleading success.
    if (demoAgents.length === 0) {
      return {
        success: false,
        message: `Created ${createdCount} tickets, but agent creation FAILED (${agentOutcome.error || 'no agents returned'}). Try again or check the auth service.`,
      };
    }

    return {
      success: true,
      message: `Created ${createdCount} tickets, ${demoAgents.length} agents, and ${assignedCount} assignments.`,
    };
  } catch (err) {
    return { success: false, message: `Demo data failed: ${errReason(err)}` };
  }
}
