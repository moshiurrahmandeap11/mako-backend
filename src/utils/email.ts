import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendOtpEmail({
  to,
  otp,
  type,
}: {
  to: string;
  otp: string;
  type: 'email-verification' | 'forget-password' | string;
}) {
  const isVerification = type === 'email-verification';
  const subject = isVerification
    ? 'Verify Your Email Address - Labto AI Assistant'
    : 'Reset Your Password - Labto AI Assistant';

  const title = isVerification ? 'Verify Your Email' : 'Reset Your Password';
  const messageText = isVerification
    ? 'Thank you for registering with Labto AI Assistant. Use the 6-digit OTP code below to verify your email address and activate your account:'
    : 'We received a request to reset the password for your Labto AI account. Use the 6-digit OTP code below to proceed with resetting your password:';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 520px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .logo { font-size: 20px; font-weight: 800; color: #f59e0b; text-transform: uppercase; tracking: 0.1em; margin-bottom: 24px; text-align: center; }
        .title { font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 12px; text-align: center; }
        .subtitle { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 28px; text-align: center; }
        .otp-box { background-color: #020617; border: 1px solid #f59e0b40; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 28px; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f59e0b; font-family: monospace; }
        .footer { font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ LABTO AI</div>
        <div class="title">${title}</div>
        <div class="subtitle">${messageText}</div>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        <div class="subtitle" style="font-size: 12px; margin-bottom: 0;">
          This OTP code is valid for 5 minutes. If you did not request this, please ignore this email.
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Shopping Assistant. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
    });
    logger.info(`OTP Email successfully sent to ${to} (MessageId: ${info.messageId})`);
    return info;
  } catch (error) {
    logger.error(`Failed to send OTP email to ${to}:`, error);
    throw error;
  }
}
