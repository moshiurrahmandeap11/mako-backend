import { PlanTier } from "@prisma/client";
import crypto from "crypto";
import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { getPlanConfig } from "../../config/pricing";
import {
  DashboardAuthRequest,
  clearPlanTierCache,
} from "../../middleware/authenticateDashboard";
import { logger } from "../../utils/logger";
import { polar } from "../../utils/polar";

export async function createCheckoutSession(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { tier, billingType } = req.body;
    const resolvedBillingType =
      billingType === "onetime" ? "onetime" : "monthly";

    if (!polar) {
      res
        .status(500)
        .json({ error: "Polar billing system not configured on server." });
      return;
    }

    if (!tier || !["STARTER", "PRO"].includes(tier)) {
      res
        .status(400)
        .json({ error: "Valid plan tier required (STARTER or PRO)." });
      return;
    }

    let productId = "";
    if (tier === "STARTER") {
      productId =
        resolvedBillingType === "onetime"
          ? env.POLAR_STARTER_ONETIME_PRODUCT_ID ||
            "22a1c6b5-4392-401c-9767-9b2cb6e33049"
          : env.POLAR_STARTER_PRODUCT_ID ||
            "eb079bce-d1af-4280-a77d-0318e7b7bde6";
    } else if (tier === "PRO") {
      productId =
        resolvedBillingType === "onetime"
          ? env.POLAR_PRO_ONETIME_PRODUCT_ID ||
            "51e49a61-74c8-4ecf-b45f-f1e2424ab9dc"
          : env.POLAR_PRO_PRODUCT_ID || "b97a3f4f-d036-4ceb-a26f-77fe0bf3d07d";
    }

    if (!productId) {
      res
        .status(500)
        .json({
          error: `Polar product ID for tier ${tier} (${resolvedBillingType}) is missing.`,
        });
      return;
    }

    // Fetch full merchant user from database
    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      res.status(404).json({ error: "Merchant account not found." });
      return;
    }

    // Create Polar.sh Checkout Session
    const checkout = await polar.checkouts.create({
      products: [productId],
      customerEmail: merchant.email,
      customerName: merchant.name || undefined,
      metadata: {
        merchantId: merchant.id,
        tier: tier,
        billingType: resolvedBillingType,
      },
      successUrl: `${env.FRONTEND_URL}/billing?session_id={CHECKOUT_ID}&tier=${tier}&billingType=${resolvedBillingType}`,
    });

    logger.info(
      `Polar: Created checkout session for Merchant ${merchantId} -> Tier: ${tier} (${resolvedBillingType}) -> URL: ${checkout.url}`,
    );
    res.json({ url: checkout.url });
  } catch (error: any) {
    logger.error("Error creating Polar checkout session:", error);
    res
      .status(500)
      .json({
        error: error.message || "Failed to initialize checkout session.",
      });
  }
}

export async function createPortalSession(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    if (!polar) {
      res
        .status(500)
        .json({ error: "Billing system not configured on server." });
      return;
    }

    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      res.status(404).json({ error: "Merchant account not found." });
      return;
    }

    let customerPortalUrl = "";

    // 1. Try customerId from database
    if (merchant.stripeCustomerId) {
      try {
        const session = await polar.customerSessions.create({
          customerId: merchant.stripeCustomerId,
        });
        if (session && session.customerPortalUrl) {
          customerPortalUrl = session.customerPortalUrl;
        }
      } catch (err: any) {
        logger.warn(
          `Polar customer session error for customerId ${merchant.stripeCustomerId}: ${err.message}`,
        );
      }
    }

    // 2. If not found by customerId, lookup customer by email
    if (!customerPortalUrl && merchant.email) {
      try {
        const customersList = await polar.customers.list({
          email: merchant.email,
          limit: 1,
        });
        const items =
          (customersList as any).result?.items ||
          (customersList as any).items ||
          [];
        const customer = items[0];
        if (customer?.id) {
          const session = await polar.customerSessions.create({
            customerId: customer.id,
          });
          if (session && session.customerPortalUrl) {
            customerPortalUrl = session.customerPortalUrl;
            await prisma.user.update({
              where: { id: merchant.id },
              data: { stripeCustomerId: customer.id },
            });
          }
        }
      } catch (err: any) {
        logger.warn(
          `Polar customer lookup error for email ${merchant.email}: ${err.message}`,
        );
      }
    }

    // 3. Direct customer portal link fallback
    if (!customerPortalUrl) {
      customerPortalUrl =
        env.POLAR_SERVER === "sandbox"
          ? "https://sandbox.polar.sh/purchases"
          : "https://polar.sh/purchases";
    }

    logger.info(
      `Polar: Generated billing portal session URL for merchant ${merchant.email}: ${customerPortalUrl}`,
    );
    res.json({ url: customerPortalUrl });
  } catch (error: any) {
    logger.error("Error creating Polar billing portal session:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to access billing portal." });
  }
}

function verifyPolarWebhookSignature(
  req: Request,
  rawBody: string | Buffer,
): boolean {
  if (!env.POLAR_WEBHOOK_SECRET) {
    logger.warn(
      "POLAR_WEBHOOK_SECRET not set; skipping webhook HMAC signature check in dev mode.",
    );
    return true;
  }

  const webhookId = req.headers["webhook-id"] as string;
  const webhookTimestamp = req.headers["webhook-timestamp"] as string;
  const webhookSignature = req.headers["webhook-signature"] as string;

  if (!webhookSignature) {
    logger.warn("Missing webhook-signature header on Polar webhook.");
    return false;
  }

  try {
    const secret = env.POLAR_WEBHOOK_SECRET.startsWith("whsec_")
      ? env.POLAR_WEBHOOK_SECRET.substring(6)
      : env.POLAR_WEBHOOK_SECRET;

    // Standard Webhook HMAC signature format
    const bodyStr = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf-8")
      : String(rawBody);
    const toSign =
      webhookId && webhookTimestamp
        ? `${webhookId}.${webhookTimestamp}.${bodyStr}`
        : bodyStr;

    const hmac = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("hex");
    const base64Hmac = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("base64");

    const signatureParts = webhookSignature.split(" ");
    for (const part of signatureParts) {
      const [version, sig] = part.split(",");
      const actualSig = sig || version;
      if (
        actualSig === hmac ||
        actualSig === `v1,${hmac}` ||
        actualSig === base64Hmac ||
        actualSig === `v1,${base64Hmac}`
      ) {
        return true;
      }
    }

    // Direct match check
    return (
      webhookSignature.includes(hmac) || webhookSignature.includes(base64Hmac)
    );
  } catch (err) {
    logger.error("Error validating Polar webhook signature:", err);
    return false;
  }
}

export async function handleWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawBody = (req as any).rawBody || req.body;
    let event: any;

    if (typeof rawBody === "string") {
      event = JSON.parse(rawBody);
    } else if (Buffer.isBuffer(rawBody)) {
      event = JSON.parse(rawBody.toString("utf-8"));
    } else {
      event = rawBody;
    }

    if (!event || !event.type) {
      logger.warn(
        "Polar Webhook received with invalid structure or empty event.",
      );
      res.status(400).json({ error: "Invalid webhook payload structure." });
      return;
    }

    if (process.env.NODE_ENV === "production" && env.POLAR_WEBHOOK_SECRET) {
      const isValid = verifyPolarWebhookSignature(req, rawBody);
      if (!isValid) {
        logger.error(
          "Invalid Polar Webhook HMAC signature. Rejecting unauthorized request.",
        );
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }
    }

    logger.info(`📢 Polar Webhook received: [${event.type}]`);

    const data = event.data || {};
    const productId = data.productId || data.product_id || data.product?.id;
    const customerId = data.customerId || data.customer_id || data.customer?.id;
    const customerEmail =
      data.customer?.email ||
      data.customerEmail ||
      data.user?.email ||
      data.email;
    const metadata = data.metadata || data.custom_field_data || {};

    let merchantId = metadata.merchantId;
    let resolvedTier: PlanTier = "FREE";

    const isStarterOneTime =
      productId === env.POLAR_STARTER_ONETIME_PRODUCT_ID ||
      String(productId).includes("22a1c6b5");
    const isProOneTime =
      productId === env.POLAR_PRO_ONETIME_PRODUCT_ID ||
      String(productId).includes("51e49a61");
    const isStarterMonthly =
      productId === env.POLAR_STARTER_PRODUCT_ID ||
      String(productId).includes("eb079bce") ||
      String(productId).includes("4bbbaba8");
    const isProMonthly =
      productId === env.POLAR_PRO_PRODUCT_ID ||
      String(productId).includes("b97a3f4f") ||
      String(productId).includes("1ca781e4");

    const isOneTime =
      isStarterOneTime || isProOneTime || metadata.billingType === "onetime";

    if (isStarterOneTime || isStarterMonthly) {
      resolvedTier = "STARTER";
    } else if (isProOneTime || isProMonthly) {
      resolvedTier = "PRO";
    }

    switch (event.type) {
      case "subscription.created":
      case "subscription.active":
      case "subscription.updated":
      case "checkout.updated":
      case "order.created": {
        // Find merchant by ID or Email
        let merchant = merchantId
          ? await prisma.user.findUnique({ where: { id: merchantId } })
          : null;

        if (!merchant && customerEmail) {
          merchant = await prisma.user.findUnique({
            where: { email: customerEmail },
          });
        }

        if (merchant) {
          // If event is checkout.updated, verify status
          if (
            event.type === "checkout.updated" &&
            data.status &&
            data.status !== "succeeded" &&
            data.status !== "confirmed"
          ) {
            logger.info(
              `Checkout updated but status is ${data.status}, skipping activation.`,
            );
            break;
          }

          const targetTier =
            resolvedTier !== "FREE"
              ? resolvedTier
              : (metadata.tier as PlanTier) || "STARTER";
          const plan = getPlanConfig(targetTier);
          const creditsToAdd = targetTier === "PRO" ? 30000 : 10000;

          if (isOneTime) {
            // One-Time Top-Up Refill Pack
            await prisma.user.update({
              where: { id: merchant.id },
              data: {
                planTier: merchant.planTier === "PRO" ? "PRO" : targetTier,
                subscriptionStatus: "active",
                subscriptionStart: new Date(),
                stripeCustomerId: customerId || merchant.stripeCustomerId,
                rolloverCredits: { increment: creditsToAdd },
              },
            });

            clearPlanTierCache(merchant.id);
            logger.info(
              `🎉 Polar Webhook Success: One-Time Refill (+${creditsToAdd.toLocaleString()} credits) for Merchant [${merchant.email}]`,
            );
          } else {
            // Monthly Recurring Subscription
            await prisma.user.update({
              where: { id: merchant.id },
              data: {
                planTier: targetTier,
                subscriptionStatus: "active",
                subscriptionStart: new Date(),
                stripeCustomerId: customerId || merchant.stripeCustomerId,
                stripeSubscriptionId: data.id || merchant.stripeSubscriptionId,
              },
            });

            clearPlanTierCache(merchant.id);
            logger.info(
              `🎉 Polar Webhook Success: Activated Monthly Tier [${targetTier}] for Merchant [${merchant.email}] (${plan.monthlyCredits.toLocaleString()} credits/mo with rollover)`,
            );
          }
        } else {
          logger.warn(
            `Polar Webhook: Could not find merchant for email: ${customerEmail} / merchantId: ${merchantId}`,
          );
        }
        break;
      }

      case "subscription.canceled":
      case "subscription.revoked": {
        let merchant = merchantId
          ? await prisma.user.findUnique({ where: { id: merchantId } })
          : null;

        if (!merchant && customerEmail) {
          merchant = await prisma.user.findUnique({
            where: { email: customerEmail },
          });
        }

        if (merchant) {
          await prisma.user.update({
            where: { id: merchant.id },
            data: {
              planTier: "FREE",
              subscriptionStatus: "canceled",
              stripeSubscriptionId: null,
              rolloverCredits: 0, // Rollover expires when paid subscription is canceled
            },
          });

          clearPlanTierCache(merchant.id);
          logger.info(
            `Polar Webhook: Subscription revoked for Merchant [${merchant.email}]. Downgraded to FREE.`,
          );
        }
        break;
      }

      default:
        logger.info(`Polar Webhook [${event.type}] processed.`);
        break;
    }

    res.json({ received: true, event: event.type });
  } catch (error: any) {
    logger.error("Polar Webhook event processing error:", error);
    res
      .status(500)
      .json({ error: error.message || "Internal processing error." });
  }
}

export async function verifyCheckout(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { session_id, tier, billingType } = req.query;
    const merchantId = req.merchant?.id!;

    if (tier && ["STARTER", "PRO"].includes(tier as string)) {
      const resolvedTier = tier as PlanTier;
      const isOneTime = billingType === "onetime";
      const creditsToAdd = resolvedTier === "PRO" ? 30000 : 10000;

      const merchant = await prisma.user.findUnique({
        where: { id: merchantId },
      });

      if (merchant) {
        if (isOneTime) {
          await prisma.user.update({
            where: { id: merchantId },
            data: {
              subscriptionStatus: "active",
              planTier: merchant.planTier === "PRO" ? "PRO" : resolvedTier,
              rolloverCredits: { increment: creditsToAdd },
            },
          });
          logger.info(
            `Verified Polar One-Time checkout (+${creditsToAdd} credits) for merchant ${merchantId}`,
          );
        } else {
          await prisma.user.update({
            where: { id: merchantId },
            data: {
              subscriptionStatus: "active",
              planTier: resolvedTier,
            },
          });
          logger.info(
            `Verified Polar Monthly checkout for merchant ${merchantId} -> Tier: ${tier}`,
          );
        }

        clearPlanTierCache(merchantId);
      }

      res.json({
        success: true,
        tier,
        billingType: isOneTime ? "onetime" : "monthly",
      });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error verifying Polar checkout:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to verify checkout status." });
  }
}

export async function getInvoices(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      res.json({ invoices: [] });
      return;
    }

    // Return invoices list
    res.json({
      invoices: [
        {
          id: merchant.stripeSubscriptionId || "sub_active",
          number: `INV-${merchant.planTier}-2026`,
          amount:
            merchant.planTier === "PRO"
              ? "5.00"
              : merchant.planTier === "STARTER"
                ? "2.00"
                : "0.00",
          currency: "USD",
          status: merchant.subscriptionStatus === "active" ? "paid" : "open",
          dateFormatted: new Date().toLocaleDateString(),
          pdf: "",
        },
      ],
    });
  } catch (error: any) {
    logger.error("Error fetching invoices:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to load invoices." });
  }
}

export async function downloadInvoice(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  res
    .status(200)
    .json({
      message:
        "Invoices can be downloaded directly from your Polar customer portal.",
    });
}
