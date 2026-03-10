import { api } from './api';

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
        if (data.success && data.data) {
          createdTickets.push(data.data);
        }
      } catch { /* ticket might already exist */ }
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

    // Update some ticket statuses
    const statusUpdates: Array<{ status: 'in_progress' | 'resolved' }> = [
      { status: 'in_progress' },
      { status: 'resolved' },
      { status: 'in_progress' },
    ];

    for (let i = 0; i < Math.min(statusUpdates.length, createdTickets.length); i++) {
      const ticket = createdTickets[i];
      if (!ticket) continue;
      try {
        await api.patch(`/tickets/${ticket.id}`, statusUpdates[i]);
      } catch { /* ignore */ }
    }

    return { success: true, message: `Created ${createdTickets.length} demo tickets with messages and status updates.` };
  } catch (err) {
    return { success: false, message: `Demo data failed: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}
