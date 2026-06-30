import { config } from '../config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Sends an email via the Resend HTTP API (https://resend.com).
 *
 * We deliberately use Resend's HTTPS API (port 443) instead of SMTP: Railway —
 * like most PaaS hosts — blocks outbound SMTP ports (25/465/587), so the old
 * Gmail/Nodemailer transport always failed with "Connection timeout". HTTPS is
 * not blocked, so this delivers reliably from the cloud host.
 *
 * Throws on any non-2xx response or timeout so callers (which run this
 * fire-and-forget) can log the real reason.
 */
async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!config.RESEND_API_KEY) {
    console.info('[email] RESEND_API_KEY not configured — skipping email to:', opts.to);
    return;
  }

  // Own timeout so a hung HTTP call can never block indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Resend API responded ${resp.status}: ${body.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendInviteEmail(opts: {
  to: string;
  firstName: string;
  inviterName: string;
  tenantName: string;
  inviteUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `You've been invited to ${opts.tenantName} on FlowDesk`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're invited to join ${opts.tenantName}!</h2>
        <p>Hi ${opts.firstName},</p>
        <p>${opts.inviterName} has invited you to join <strong>${opts.tenantName}</strong> on FlowDesk — a real-time customer support platform.</p>
        <p style="margin: 24px 0;">
          <a href="${opts.inviteUrl}"
             style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #888; font-size: 14px;">This invitation expires in 24 hours.</p>
        <p style="color: #888; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendTicketResolvedEmail(opts: {
  to: string;
  firstName: string;
  ticketTitle: string;
  ticketId: string;
  dashboardUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `Your support ticket has been resolved`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your ticket has been resolved ✓</h2>
        <p>Hi ${opts.firstName},</p>
        <p>Your support ticket <strong>"${opts.ticketTitle}"</strong> has been resolved by our team.</p>
        <p style="margin: 24px 0;">
          <a href="${opts.dashboardUrl}"
             style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Ticket
          </a>
        </p>
        <p style="color: #888; font-size: 14px;">If you feel your issue hasn't been fully resolved, you can reopen the ticket from the dashboard.</p>
      </div>
    `,
  });
}

export async function sendNotificationEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <p>${opts.body}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #888; font-size: 12px;">
          You received this email from FlowDesk.
          Manage your notification preferences in your account settings.
        </p>
      </div>
    `,
  });
}
