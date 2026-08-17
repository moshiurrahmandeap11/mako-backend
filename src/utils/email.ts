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

export async function sendQuotaWarningEmail({
  to,
  name,
  used,
  limit,
  tier,
}: {
  to: string;
  name: string;
  used: number;
  limit: number;
  tier: string;
}) {
  const subject = `⚠️ Action Required: You've used 90% of your Labto AI monthly messages`;
  const percentage = Math.round((used / limit) * 100);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 540px; margin: 0 auto; background-color: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .logo { font-size: 20px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px; text-align: center; }
        .badge { display: inline-block; background-color: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; color: #fbbf24; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .progress-box { background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
        .progress-bar-bg { width: 100%; height: 10px; background-color: #1e293b; border-radius: 5px; overflow: hidden; margin-top: 10px; }
        .progress-bar-fill { width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); border-radius: 5px; }
        .stat-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; color: #e2e8f0; }
        .cta-btn { display: block; width: 100%; background-color: #f59e0b; color: #020617; text-align: center; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 10px; margin-bottom: 20px; box-sizing: border-box; }
        .cta-btn:hover { background-color: #d97706; }
        .footer { font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ LABTO AI</div>
        <div style="text-align: center;">
          <span class="badge">90% Quota Used</span>
        </div>
        <div class="title">Your Monthly Message Limit is Ending Soon</div>
        <div class="subtitle">
          Hi ${name || 'Merchant'}, your website chatbot has consumed <strong>${used} of ${limit} messages</strong> (${percentage}%) for your <strong>${tier}</strong> plan this month.
        </div>
        <div class="progress-box">
          <table style="width: 100%; color: #e2e8f0; font-size: 14px;">
            <tr>
              <td><strong>Current Usage</strong></td>
              <td style="text-align: right; color: #f59e0b; font-weight: 700;">${used} / ${limit} Messages</td>
            </tr>
          </table>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
        <div class="subtitle">
          To prevent your chatbot from pausing when it reaches 100%, upgrade to our Starter plan ($2/mo) or Pro plan ($5/mo) today.
        </div>
        <a href="https://mako-frontend.vercel.app/pricing" class="cta-btn">Upgrade Plan & Keep Widget Active &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Assistant. All rights reserved.
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
    logger.info(`Quota Warning Email (90%) sent to ${to} (MessageId: ${info.messageId})`);
    return info;
  } catch (error) {
    logger.error(`Failed to send quota warning email to ${to}:`, error);
  }
}

export async function sendQuotaExceededEmail({
  to,
  name,
  used,
  limit,
  tier,
}: {
  to: string;
  name: string;
  used: number;
  limit: number;
  tier: string;
}) {
  const subject = `🛑 Labto AI Widget Paused: Monthly message limit reached (${limit}/${limit})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 40px 20px; }
        .container { max-width: 540px; margin: 0 auto; background-color: #0f172a; border: 1px solid #ef444450; border-radius: 16px; padding: 36px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .logo { font-size: 20px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px; text-align: center; }
        .badge { display: inline-block; background-color: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
        .alert-box { background-color: #020617; border: 1px solid #ef444440; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
        .cta-btn { display: block; width: 100%; background-color: #ef4444; color: #ffffff; text-align: center; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 10px; margin-bottom: 20px; box-sizing: border-box; }
        .cta-btn:hover { background-color: #dc2626; }
        .footer { font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ LABTO AI</div>
        <div style="text-align: center;">
          <span class="badge">100% Quota Reached &bull; Widget Paused</span>
        </div>
        <div class="title">Monthly Message Limit Reached</div>
        <div class="subtitle">
          Hi ${name || 'Merchant'}, your chatbot has reached its monthly limit of <strong>${limit} messages</strong> on the <strong>${tier}</strong> plan.
        </div>
        <div class="alert-box">
          <table style="width: 100%; color: #f8fafc; font-size: 14px;">
            <tr>
              <td><strong>Status:</strong></td>
              <td style="text-align: right; color: #ef4444; font-weight: 700;">Widget Temporarily Paused</td>
            </tr>
            <tr>
              <td><strong>Used Quota:</strong></td>
              <td style="text-align: right; color: #f87171; font-weight: 600;">${used} / ${limit} Messages</td>
            </tr>
          </table>
        </div>
        <div class="subtitle">
          Your website visitors will no longer receive AI responses until your quota resets on the 1st of next month or when you upgrade.
        </div>
        <a href="https://mako-frontend.vercel.app/pricing" class="cta-btn">Reactivate Widget Instantly &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Assistant. All rights reserved.
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
    logger.info(`Quota Exceeded Email (100%) sent to ${to} (MessageId: ${info.messageId})`);
    return info;
  } catch (error) {
    logger.error(`Failed to send quota exceeded email to ${to}:`, error);
  }
}
