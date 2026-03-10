import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER && config.SMTP_PASSWORD
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendInviteEmail(opts: {
  to: string;
  firstName: string;
  inviterName: string;
  tenantName: string;
  inviteUrl: string;
}): Promise<void> {
  if (!config.SMTP_USER) {
    console.info('[email] SMTP not configured — skipping invite email to:', opts.to);
    return;
  }

  await getTransporter().sendMail({
    from: config.EMAIL_FROM,
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
  if (!config.SMTP_USER) return;

  await getTransporter().sendMail({
    from: config.EMAIL_FROM,
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
  if (!config.SMTP_USER) return;

  await getTransporter().sendMail({
    from: config.EMAIL_FROM,
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
