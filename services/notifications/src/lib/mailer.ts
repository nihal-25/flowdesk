import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config.js';

let transporter: Transporter | null = null;

export function getMailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      ...(config.SMTP_USER && config.SMTP_PASSWORD
        ? {
            auth: {
              user: config.SMTP_USER,
              pass: config.SMTP_PASSWORD,
            },
          }
        : {}),
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<void> {
  const mailer = getMailer();
  await mailer.sendMail({
    from: config.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.html ? { html: opts.html } : {}),
  });
}
