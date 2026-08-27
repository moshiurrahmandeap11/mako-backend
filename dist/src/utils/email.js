"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOtpEmail = sendOtpEmail;
exports.sendQuotaWarningEmail = sendQuotaWarningEmail;
exports.sendQuotaExceededEmail = sendQuotaExceededEmail;
exports.sendMaintenanceBroadcastEmail = sendMaintenanceBroadcastEmail;
exports.sendNewsletterWelcomeEmail = sendNewsletterWelcomeEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
const logger_1 = require("./logger");
const isGmail = env_1.env.SMTP_HOST.includes("gmail");
const transporter = nodemailer_1.default.createTransport(isGmail
    ? {
        service: "gmail",
        auth: {
            user: env_1.env.SMTP_USER,
            pass: env_1.env.SMTP_PASS,
        },
    }
    : {
        host: env_1.env.SMTP_HOST,
        port: env_1.env.SMTP_PORT,
        secure: env_1.env.SMTP_PORT === 465,
        auth: {
            user: env_1.env.SMTP_USER,
            pass: env_1.env.SMTP_PASS,
        },
    });
const resendApiKey = process.env.RESEND_API_KEY || "";
async function sendEmailViaResendOrSmtp({ to, subject, html, }) {
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
                    from: process.env.SMTP_FROM || "Labto AI <support@labtoai.com>",
                    to: [to],
                    reply_to: "support@labtoai.com",
                    subject,
                    html,
                    text: textFallback,
                }),
            });
            const data = await res.json();
            if (data.id) {
                logger_1.logger.info(`Email successfully delivered via Resend HTTPS to ${to} (ID: ${data.id})`);
                return data;
            }
            else {
                logger_1.logger.warn(`Resend response for ${to}:`, data.message || data);
            }
        }
        catch (err) {
            logger_1.logger.error(`Resend HTTPS dispatch failed for ${to}:`, err);
        }
    }
    // Fallback to Nodemailer transporter
    try {
        const info = await transporter.sendMail({
            from: env_1.env.SMTP_FROM || "Labto AI Assistant <moshiurbhau@gmail.com>",
            to,
            subject,
            html,
        });
        logger_1.logger.info(`Email sent via SMTP transporter to ${to} (MessageId: ${info.messageId})`);
        return info;
    }
    catch (smtpErr) {
        logger_1.logger.error(`SMTP fallback also failed for ${to}:`, smtpErr);
        throw smtpErr;
    }
}
async function sendOtpEmail({ to, otp, type, }) {
    const isVerification = type === "email-verification";
    const subject = isVerification
        ? "Verify Your Email Address - Labto AI Assistant"
        : "Reset Your Password - Labto AI Assistant";
    const title = isVerification ? "Verify Your Email" : "Reset Your Password";
    const messageText = isVerification
        ? "Thank you for registering with Labto AI Assistant. Use the 6-digit OTP code below to verify your email address and activate your account:"
        : "We received a request to reset the password for your Labto AI account. Use the 6-digit OTP code below to proceed with resetting your password:";
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
    return sendEmailViaResendOrSmtp({ to, subject, html });
}
async function sendQuotaWarningEmail({ to, name, used, limit, tier, }) {
    const subject = `⚠️ Action Required: You've used 90% of your Labto AI monthly credits`;
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
        <div class="title">Your Monthly AI Credits are Ending Soon</div>
        <div class="subtitle">
          Hi ${name || "Merchant"}, your website chatbot has consumed <strong>${used.toLocaleString()} of ${limit.toLocaleString()} AI Smart Credits</strong> (${percentage}%) for your <strong>${tier}</strong> plan this month.
        </div>
        <div class="progress-box">
          <table style="width: 100%; color: #e2e8f0; font-size: 14px;">
            <tr>
              <td><strong>Current Usage</strong></td>
              <td style="text-align: right; color: #f59e0b; font-weight: 700;">${used.toLocaleString()} / ${limit.toLocaleString()} Credits</td>
            </tr>
          </table>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill"></div>
          </div>
        </div>
        <div class="subtitle">
          To prevent your chatbot from pausing when it reaches 100%, upgrade to our Starter plan ($2/mo) or Pro plan ($5/mo) today with <strong>100% Unused Credit Rollover</strong>.
        </div>
        <a href="https://labtoai.com/pricing" class="cta-btn">Upgrade Plan & Keep Widget Active &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Assistant. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
    return sendEmailViaResendOrSmtp({ to, subject, html });
}
async function sendQuotaExceededEmail({ to, name, used, limit, tier, }) {
    const subject = `🛑 Labto AI Widget Paused: Monthly AI credits reached (${limit.toLocaleString()}/${limit.toLocaleString()})`;
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
          <span class="badge">100% Credits Reached &bull; Widget Paused</span>
        </div>
        <div class="title">Monthly AI Smart Credits Reached</div>
        <div class="subtitle">
          Hi ${name || "Merchant"}, your chatbot has reached its monthly limit of <strong>${limit.toLocaleString()} AI Smart Credits</strong> on the <strong>${tier}</strong> plan.
        </div>
        <div class="alert-box">
          <table style="width: 100%; color: #f8fafc; font-size: 14px;">
            <tr>
              <td><strong>Status:</strong></td>
              <td style="text-align: right; color: #ef4444; font-weight: 700;">Widget Temporarily Paused</td>
            </tr>
            <tr>
              <td><strong>Used Quota:</strong></td>
              <td style="text-align: right; color: #f87171; font-weight: 600;">${used.toLocaleString()} / ${limit.toLocaleString()} Credits</td>
            </tr>
          </table>
        </div>
        <div class="subtitle">
          Your website visitors will no longer receive AI responses until your quota resets on the 1st of next month or when you upgrade.
        </div>
        <a href="https://labtoai.com/pricing" class="cta-btn">Reactivate Widget Instantly &rarr;</a>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Assistant. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
    return sendEmailViaResendOrSmtp({ to, subject, html });
}
async function sendMaintenanceBroadcastEmail({ to, name, message, }) {
    const subject = "🚨 Scheduled Maintenance Notice - Labto AI";
    const customMsg = message ||
        "Labto AI is currently undergoing scheduled platform maintenance and system upgrades. We will be back online shortly.";
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F7F7; color: #222325; margin: 0; padding: 40px 20px; }
        .container { max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E4E5E7; border-radius: 8px; padding: 36px; }
        .logo { font-size: 20px; font-weight: 800; color: #1DBF73; letter-spacing: -0.02em; margin-bottom: 20px; text-align: center; }
        .badge { display: inline-block; background-color: #ECFDF5; border: 1px solid #A7F3D0; color: #059669; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #222325; margin-bottom: 12px; }
        .subtitle { font-size: 14px; color: #62646A; line-height: 1.6; margin-bottom: 20px; }
        .notice-box { background-color: #F9FAFB; border: 1px solid #E4E5E7; border-radius: 6px; padding: 18px; margin-bottom: 24px; font-size: 13px; color: #374151; line-height: 1.6; }
        .bullet { margin-bottom: 8px; font-size: 13px; color: #4B5563; }
        .footer { font-size: 12px; color: #74767E; text-align: center; line-height: 1.5; margin-top: 32px; border-top: 1px solid #E4E5E7; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ LABTO AI</div>
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
          &copy; ${new Date().getFullYear()} Labto AI Inc. All rights reserved.<br>
          Need urgent assistance? Contact us at support@labtoai.com
        </div>
      </div>
    </body>
    </html>
  `;
    return sendEmailViaResendOrSmtp({ to, subject, html });
}
async function sendNewsletterWelcomeEmail({ to, name, }) {
    const subject = "Welcome to Labto AI — You're Subscribed! 🎉";
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 20px; color: #222325; }
        .container { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E4E5E7; padding: 40px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .logo { font-size: 20px; font-weight: 800; color: #1DBF73; letter-spacing: -0.5px; text-align: center; margin-bottom: 24px; }
        .badge { display: inline-block; padding: 6px 14px; background: #E8F8F0; color: #1DBF73; font-size: 12px; font-weight: 600; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
        .title { font-size: 24px; font-weight: 700; color: #222325; text-align: center; margin-bottom: 12px; line-height: 1.3; }
        .subtitle { font-size: 15px; color: #62646A; line-height: 1.6; margin-bottom: 24px; text-align: left; }
        .highlight-card { background: #F7F7F7; border: 1px solid #E4E5E7; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
        .feature-item { display: flex; align-items: flex-start; margin-bottom: 12px; font-size: 14px; color: #404145; line-height: 1.5; }
        .feature-item:last-child { margin-bottom: 0; }
        .btn-container { text-align: center; margin: 32px 0 20px; }
        .btn { display: inline-block; background: #1DBF73; color: #FFFFFF !important; text-decoration: none; padding: 13px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; }
        .footer { font-size: 12px; color: #95979D; text-align: center; border-top: 1px solid #E4E5E7; padding-top: 24px; margin-top: 32px; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">⚡ LABTO AI</div>
        <div style="text-align: center;">
          <span class="badge">Subscription Confirmed</span>
        </div>
        <div class="title">Welcome to the Future of E-Commerce AI</div>
        <div class="subtitle">
          Hello ${name ? name : "there"},<br><br>
          Thank you for subscribing to <strong>Labto AI</strong> updates! You're now on the list to receive our latest product release notes, e-commerce conversion strategies, and autonomous sales assistant innovations.
        </div>
        
        <div class="highlight-card">
          <div style="font-weight: 600; font-size: 14px; color: #222325; margin-bottom: 12px;">What to expect from us:</div>
          <div class="feature-item">🚀 <strong>Autonomous Sales & Concierge:</strong> Discover how AI shopping agents boost conversions across Shopify, WooCommerce & Custom storefronts.</div>
          <div class="feature-item">💡 <strong>Sub-Second Hybrid Search:</strong> Insights on vector search & zero-hallucination store retrieval.</div>
          <div class="feature-item">🛍️ <strong>Automated Cart Mutations:</strong> Seamless multi-platform cart flows and customer experience tips.</div>
        </div>

        <div class="btn-container">
          <a href="https://labtoai.com" class="btn" target="_blank">Explore Labto AI Platform</a>
        </div>

        <div class="footer">
          &copy; ${new Date().getFullYear()} Labto AI Inc. All rights reserved.<br>
          You received this email because you subscribed to updates at <a href="https://labtoai.com" style="color: #1DBF73; text-decoration: none;">labtoai.com</a>.
        </div>
      </div>
    </body>
    </html>
  `;
    return sendEmailViaResendOrSmtp({ to, subject, html });
}
