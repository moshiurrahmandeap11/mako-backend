import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { sendNewsletterWelcomeEmail } from "../../utils/email";
import { logger } from "../../utils/logger";

/**
 * Public Newsletter / Email Subscription Controller
 * Allows any external website, landing page, or storefront to subscribe emails.
 */
export async function subscribeNewsletter(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { email, name, source } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({
        success: false,
        error: "Email address is required.",
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({
        success: false,
        error: "Please provide a valid email address.",
      });
      return;
    }

    // Upsert subscriber in database
    const subscriber = await (prisma as any).newsletterSubscriber.upsert({
      where: { email: cleanEmail },
      create: {
        email: cleanEmail,
        source: source ? String(source).trim().slice(0, 100) : "website",
        status: "SUBSCRIBED",
      },
      update: {
        status: "SUBSCRIBED",
        source: source ? String(source).trim().slice(0, 100) : undefined,
      },
    });

    logger.info(
      `[Newsletter] New subscriber: ${cleanEmail} (Source: ${subscriber.source || "website"})`,
    );

    // Asynchronously dispatch welcome / confirmation email without blocking API response
    sendNewsletterWelcomeEmail({
      to: cleanEmail,
      name: name ? String(name).trim() : undefined,
    }).catch((emailErr) => {
      logger.error(
        `[Newsletter] Failed to dispatch welcome email to ${cleanEmail}:`,
        emailErr,
      );
    });

    res.status(200).json({
      success: true,
      message:
        "Thank you for subscribing to Labto AI updates! A welcome confirmation email has been sent.",
      subscriber: {
        email: subscriber.email,
        status: subscriber.status,
        createdAt: subscriber.createdAt,
      },
    });
  } catch (error) {
    logger.error("[Newsletter] Subscription error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete subscription. Please try again later.",
    });
  }
}
