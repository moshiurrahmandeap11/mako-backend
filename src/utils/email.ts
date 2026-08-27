import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "./logger";

const isGmail = env.SMTP_HOST.includes("gmail");

const transporter = nodemailer.createTransport(
  isGmail
    ? {
        service: "gmail",
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      }
    : {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      },
);

const resendApiKey = process.env.RESEND_API_KEY || "";

async function sendEmailViaResendOrSmtp({
  to,
  subject,
  html,
  from,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}) {
  const senderFrom = from || process.env.SMTP_FROM || "Labto AI <no-reply@labtoai.com>";
  const senderReplyTo = replyTo || "support@labtoai.com";

  if (resendApiKey) {
    try {
      const textFallback = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: senderFrom,
          to: [to],
          reply_to: senderReplyTo,
          subject,
          html,
          text: textFallback,
        }),
      });

      const data: any = await res.json();
      if (data.id) {
        logger.info(
          `Email successfully delivered via Resend HTTPS to ${to} (ID: ${data.id})`,
        );
        return data;
      } else {
        logger.warn(`Resend response for ${to}:`, data.message || data);
      }
    } catch (err) {
      logger.error(`Resend HTTPS dispatch failed for ${to}:`, err);
    }
  }

  // Fallback to Nodemailer transporter
  try {
    const info = await transporter.sendMail({
      from: senderFrom,
      to,
      replyTo: senderReplyTo,
      subject,
      html,
    });
    logger.info(
      `Email sent via SMTP transporter to ${to} (MessageId: ${info.messageId})`,
    );
    return info;
  } catch (smtpErr) {
    logger.error(`SMTP fallback also failed for ${to}:`, smtpErr);
    throw smtpErr;
  }
}

// Brand Logo Component for HTML Emails
const emailBrandHeader = `
  <div style="text-align: center; margin-bottom: 24px;">
    <a href="https://labtoai.com" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="34" height="34" style="vertical-align: middle;">
        <g stroke="#1DBF73" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M 120,90 H 380 A 50,50 0 0 1 430,140 V 310 A 50,50 0 0 1 380,360 H 350 L 380,415 L 310,360 H 120 A 50,50 0 0 1 70,310 V 140 A 50,50 0 0 1 120,90 Z" />
          <path d="M 155,160 V 290 H 235" />
          <path d="M 315,165 Q 315,225 375,225 Q 315,225 315,285 Q 315,225 255,225 Q 315,225 315,165 Z" />
        </g>
      </svg>
      <span class="brand-text" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; font-weight: 700; color: #222325; letter-spacing: -0.5px; vertical-align: middle; margin-left: 6px;">Labto <span style="color: #1DBF73;">AI</span></span>
    </a>
  </div>
`;

export async function sendOtpEmail({
  to,
  otp,
  type,
}: {
  to: string;
  otp: string;
  type: "email-verification" | "forget-password" | string;
}) {
  const isVerification = type === "email-verification";
  const subject = isVerification
    ? "Verify Your Email Address - Labto AI"
    : "Reset Your Password - Labto AI";

  const title = isVerification ? "Verify Your Email" : "Reset Your Password";
  const messageText = isVerification
    ? "Thank you for registering with Labto AI. Use the 6-digit OTP code below to verify your email address and activate your account:"
    : "We received a request to reset the password for your Labto AI account. Use the 6-digit OTP code below to proceed with resetting your password:";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; color: #222325; margin: 0; padding: 24px 16px; }
        .container { max-width: 520px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E5E7; border-radius: 10px; padding: 36px 28px; }
        .title { font-size: 22px; font-weight: 700; color: #222325; margin-bottom: 12px; text-align: center; }
        .subtitle { font-size: 14px; color: #62646A; line-height: 1.6; margin-bottom: 24px; text-align: center; }
        .otp-box { background-color: #F7F7F7; border: 1px solid #E4E5E7; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1DBF73; font-family: monospace; }
        .footer { font-size: 12px; color: #95979D; text-align: center; line-height: 1.5; margin-top: 28px; border-top: 1px solid #E4E5E7; padding-top: 20px; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #121212 !important; color: #F3F4F6 !important; }
          .container { background-color: #1E1E1E !important; border-color: #333333 !important; }
          .brand-text, .title { color: #FFFFFF !important; }
          .subtitle { color: #D1D5DB !important; }
          .otp-box { background-color: #262626 !important; border-color: #404040 !important; }
          .footer { color: #888888 !important; border-color: #333333 !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${emailBrandHeader}
        <div class="title">${title}</div>
        <div class="subtitle">${messageText}</div>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        <div class="subtitle" style="font-size: 12px; margin-bottom: 0;">
          This code is valid for 10 minutes. If you did not request this, please ignore this email.
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailViaResendOrSmtp({
    to,
    subject,
    html,
    from: "Labto AI <no-reply@labtoai.com>",
    replyTo: "support@labtoai.com",
  });
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
  const percentage = Math.round((used / limit) * 100);
  const subject = `⚠️ Labto AI Usage Alert: ${percentage}% of Monthly Credits Used`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; color: #222325; margin: 0; padding: 24px 16px; }
        .container { max-width: 540px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E5E7; border-radius: 10px; padding: 36px 28px; }
        .badge { display: inline-block; background-color: #FEF3C7; border: 1px solid #FDE68A; color: #B45309; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #222325; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #62646A; line-height: 1.6; margin-bottom: 20px; }
        .progress-box { background-color: #F7F7F7; border: 1px solid #E4E5E7; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
        .progress-bar-bg { background-color: #E5E7EB; border-radius: 6px; height: 10px; overflow: hidden; margin-top: 10px; }
        .progress-bar-fill { background-color: #F59E0B; height: 100%; border-radius: 6px; }
        .cta-btn { display: block; width: 100%; background-color: #1DBF73; color: #FFFFFF !important; text-align: center; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 6px; margin-bottom: 16px; box-sizing: border-box; }
        .footer { font-size: 12px; color: #95979D; text-align: center; line-height: 1.5; margin-top: 28px; border-top: 1px solid #E4E5E7; padding-top: 20px; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #121212 !important; color: #F3F4F6 !important; }
          .container { background-color: #1E1E1E !important; border-color: #333333 !important; }
          .brand-text, .title { color: #FFFFFF !important; }
          .subtitle { color: #D1D5DB !important; }
          .progress-box { background-color: #262626 !important; border-color: #404040 !important; }
          .progress-bar-bg { background-color: #404040 !important; }
          .footer { color: #888888 !important; border-color: #333333 !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${emailBrandHeader}
        <div style="text-align: center;">
          <span class="badge">Quota Alert &bull; ${percentage}% Used</span>
        </div>
        <div class="title">Approaching Monthly AI Credits Limit</div>
        <div class="subtitle">
          Hello ${name || "Merchant"}, your AI assistant has consumed <strong>${used.toLocaleString()}</strong> out of your <strong>${limit.toLocaleString()} monthly AI credits</strong> (${percentage}%) on the <strong>${tier}</strong> plan.
        </div>
        <div class="progress-box">
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span>Current Consumption</span>
            <span><strong>${used.toLocaleString()} / ${limit.toLocaleString()}</strong></span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${Math.min(percentage, 100)}%;"></div>
          </div>
        </div>
        <a href="https://labtoai.com/pricing" class="cta-btn">Upgrade Plan to Avoid Pauses &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailViaResendOrSmtp({
    to,
    subject,
    html,
    from: "Labto AI <support@labtoai.com>",
    replyTo: "support@labtoai.com",
  });
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
  const subject = `🛑 Labto AI Widget Paused: Monthly AI credits reached (${limit.toLocaleString()}/${limit.toLocaleString()})`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; color: #222325; margin: 0; padding: 24px 16px; }
        .container { max-width: 540px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E5E7; border-radius: 10px; padding: 36px 28px; }
        .badge { display: inline-block; background-color: #FEE2E2; border: 1px solid #FECACA; color: #DC2626; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #222325; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #62646A; line-height: 1.6; margin-bottom: 20px; }
        .alert-box { background-color: #F7F7F7; border: 1px solid #E4E5E7; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
        .cta-btn { display: block; width: 100%; background-color: #DC2626; color: #FFFFFF !important; text-align: center; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 6px; margin-bottom: 16px; box-sizing: border-box; }
        .footer { font-size: 12px; color: #95979D; text-align: center; line-height: 1.5; margin-top: 28px; border-top: 1px solid #E4E5E7; padding-top: 20px; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #121212 !important; color: #F3F4F6 !important; }
          .container { background-color: #1E1E1E !important; border-color: #333333 !important; }
          .brand-text, .title { color: #FFFFFF !important; }
          .subtitle { color: #D1D5DB !important; }
          .alert-box { background-color: #262626 !important; border-color: #404040 !important; }
          .footer { color: #888888 !important; border-color: #333333 !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${emailBrandHeader}
        <div style="text-align: center;">
          <span class="badge">100% Credits Reached &bull; Paused</span>
        </div>
        <div class="title">Monthly AI Smart Credits Reached</div>
        <div class="subtitle">
          Hello ${name || "Merchant"}, your AI assistant has reached its monthly limit of <strong>${limit.toLocaleString()} credits</strong> on the <strong>${tier}</strong> plan.
        </div>
        <div class="alert-box">
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span>Status</span>
            <span style="color: #DC2626; font-weight: 600;">Widget Responses Paused</span>
          </div>
        </div>
        <a href="https://labtoai.com/pricing" class="cta-btn">Reactivate Assistant Instantly &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailViaResendOrSmtp({
    to,
    subject,
    html,
    from: "Labto AI <support@labtoai.com>",
    replyTo: "support@labtoai.com",
  });
}

export async function sendMaintenanceBroadcastEmail({
  to,
  name,
  message,
}: {
  to: string;
  name?: string;
  message?: string;
}) {
  const subject = "🚨 Scheduled Maintenance Notice - Labto AI";
  const customMsg =
    message ||
    "Labto AI is currently undergoing scheduled platform maintenance and system upgrades. We will be back online shortly.";

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; color: #222325; margin: 0; padding: 24px 16px; }
        .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E4E5E7; border-radius: 10px; padding: 36px 28px; }
        .badge { display: inline-block; background-color: #ECFDF5; border: 1px solid #A7F3D0; color: #059669; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #222325; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #62646A; line-height: 1.6; margin-bottom: 20px; }
        .notice-box { background-color: #F7F7F7; border: 1px solid #E4E5E7; border-radius: 8px; padding: 18px; margin-bottom: 20px; font-size: 13px; color: #374151; line-height: 1.6; }
        .bullet { margin-bottom: 8px; font-size: 13px; color: #4B5563; }
        .footer { font-size: 12px; color: #95979D; text-align: center; line-height: 1.5; margin-top: 28px; border-top: 1px solid #E4E5E7; padding-top: 20px; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #121212 !important; color: #F3F4F6 !important; }
          .container { background-color: #1E1E1E !important; border-color: #333333 !important; }
          .brand-text, .title { color: #FFFFFF !important; }
          .subtitle { color: #D1D5DB !important; }
          .notice-box { background-color: #262626 !important; border-color: #404040 !important; color: #E5E7EB !important; }
          .bullet { color: #D1D5DB !important; }
          .footer { color: #888888 !important; border-color: #333333 !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${emailBrandHeader}
        <div style="text-align: center;">
          <span class="badge">Scheduled System Maintenance</span>
        </div>
        <div class="title">Platform Maintenance Notice</div>
        <div class="subtitle">
          Hello ${name || "Merchant"},
        </div>
        <div class="notice-box">
          <strong>Notice:</strong> ${customMsg}
        </div>
        <div class="subtitle">
          <div class="bullet">&bull; <strong>Data Safety:</strong> All your store product catalogs, knowledge bases, and conversation history are 100% safe and preserved.</div>
          <div class="bullet">&bull; <strong>Widget Status:</strong> AI assistant responses are temporarily paused and will automatically resume as soon as maintenance is completed.</div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI. All rights reserved.<br>
          Need assistance? Contact us at <a href="mailto:support@labtoai.com" style="color: #1DBF73; text-decoration: none;">support@labtoai.com</a>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailViaResendOrSmtp({
    to,
    subject,
    html,
    from: "Labto AI <no-reply@labtoai.com>",
    replyTo: "support@labtoai.com",
  });
}

export async function sendNewsletterWelcomeEmail({
  to,
  name,
}: {
  to: string;
  name?: string;
}) {
  const subject = "Welcome to Labto AI 🎉";
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <style>
        :root { color-scheme: light dark; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 24px 16px; color: #222325; }
        .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 10px; border: 1px solid #E4E5E7; padding: 40px 32px; }
        .title { font-size: 24px; font-weight: 700; color: #222325; text-align: center; margin-bottom: 16px; line-height: 1.3; }
        .subtitle { font-size: 15px; color: #62646A; line-height: 1.65; margin-bottom: 0; text-align: left; }
        .footer { font-size: 12px; color: #95979D; text-align: center; border-top: 1px solid #E4E5E7; padding-top: 24px; margin-top: 36px; line-height: 1.6; }
        @media (prefers-color-scheme: dark) {
          body { background-color: #121212 !important; color: #F3F4F6 !important; }
          .container { background-color: #1E1E1E !important; border-color: #333333 !important; }
          .brand-text, .title { color: #FFFFFF !important; }
          .subtitle { color: #D1D5DB !important; }
          .footer { color: #888888 !important; border-color: #333333 !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${emailBrandHeader}
        <div class="title">Welcome to Labto AI</div>
        <div class="subtitle">
          Hello ${name ? name : "there"},<br><br>
          Thank you for subscribing to <strong>Labto AI</strong> updates! You're now on the list to receive our latest product release notes, intelligent AI assistant features, and platform updates for your websites and businesses.
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI. All rights reserved.<br>
          You received this email because you subscribed to updates at <a href="https://labtoai.com" style="color: #1DBF73; text-decoration: none;">labtoai.com</a>.
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailViaResendOrSmtp({
    to,
    subject,
    html,
    from: "Labto AI <no-reply@labtoai.com>",
    replyTo: "support@labtoai.com",
  });
}
