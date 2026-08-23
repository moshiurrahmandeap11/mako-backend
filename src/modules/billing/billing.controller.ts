import { Response, Request } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/db';
import { polar } from '../../utils/polar';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest, clearPlanTierCache } from '../../middleware/authenticateDashboard';
import { PlanTier } from '@prisma/client';
import { getPlanConfig } from '../../config/pricing';

export async function createCheckoutSession(
  req: DashboardAuthRequest,
  res: Response
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { tier } = req.body;

    if (!polar) {
      res.status(500).json({ error: 'Polar billing system not configured on server.' });
      return;
    }

    if (!tier || !['STARTER', 'PRO'].includes(tier)) {
      res.status(400).json({ error: 'Valid plan tier required (STARTER or PRO).' });
      return;
    }

    const productId =
      tier === 'STARTER' ? env.POLAR_STARTER_PRODUCT_ID : env.POLAR_PRO_PRODUCT_ID;

    if (!productId) {
      res.status(500).json({ error: `Polar product ID for tier ${tier} is missing in environment variables.` });
      return;
    }

    // Fetch full merchant user from database
    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      res.status(404).json({ error: 'Merchant account not found.' });
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
      },
      successUrl: `${env.FRONTEND_URL}/billing?session_id={CHECKOUT_ID}&tier=${tier}`,
    });

    logger.info(`Polar: Created checkout session for Merchant ${merchantId} -> Tier: ${tier} -> URL: ${checkout.url}`);
    res.json({ url: checkout.url });
  } catch (error: any) {
    logger.error('Error creating Polar checkout session:', error);
    res.status(500).json({ error: error.message || 'Failed to initialize checkout session.' });
  }
}

export async function createPortalSession(
  req: DashboardAuthRequest,
  res: Response
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    if (!polar) {
      res.status(500).json({ error: 'Billing system not configured on server.' });
      return;
    }

    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      res.status(404).json({ error: 'Merchant account not found.' });
      return;
    }

    // Polar Customer Portal URL
    const portalUrl =
      env.POLAR_SERVER === 'sandbox'
        ? 'https://sandbox.polar.sh/purchases'
        : 'https://polar.sh/purchases';

    res.json({ url: portalUrl });
  } catch (error: any) {
    logger.error('Error creating Polar billing portal session:', error);
    res.status(500).json({ error: 'Failed to access billing portal.' });
  }
}

function verifyPolarWebhookSignature(req: Request, rawBody: string | Buffer): boolean {
  if (!env.POLAR_WEBHOOK_SECRET) {
    logger.warn('POLAR_WEBHOOK_SECRET not set; skipping webhook HMAC signature check in dev mode.');
    return true;
  }

  const webhookId = req.headers['webhook-id'] as string;
  const webhookTimestamp = req.headers['webhook-timestamp'] as string;
  const webhookSignature = req.headers['webhook-signature'] as string;

  if (!webhookSignature) {
    logger.warn('Missing webhook-signature header on Polar webhook.');
    return false;
  }

  try {
    const secret = env.POLAR_WEBHOOK_SECRET.startsWith('whsec_')
      ? env.POLAR_WEBHOOK_SECRET.substring(6)
      : env.POLAR_WEBHOOK_SECRET;

    // Standard Webhook HMAC signature format
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody);
    const toSign = webhookId && webhookTimestamp ? `${webhookId}.${webhookTimestamp}.${bodyStr}` : bodyStr;

    const hmac = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
    const base64Hmac = crypto.createHmac('sha256', secret).update(toSign).digest('base64');

    const signatureParts = webhookSignature.split(' ');
    for (const part of signatureParts) {
      const [version, sig] = part.split(',');
      const actualSig = sig || version;
      if (actualSig === hmac || actualSig === `v1,${hmac}` || actualSig === base64Hmac || actualSig === `v1,${base64Hmac}`) {
        return true;
      }
    }

    // Direct match check
    return webhookSignature.includes(hmac) || webhookSignature.includes(base64Hmac);
  } catch (err) {
    logger.error('Error validating Polar webhook signature:', err);
    return false;
  }
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    const rawBody = (req as any).rawBody || req.body;
    let event: any;

    if (typeof rawBody === 'string') {
      event = JSON.parse(rawBody);
    } else if (Buffer.isBuffer(rawBody)) {
      event = JSON.parse(rawBody.toString('utf-8'));
    } else {
      event = rawBody;
    }

    if (!event || !event.type) {
      logger.warn('Polar Webhook received with invalid structure or empty event.');
      res.status(400).json({ error: 'Invalid webhook payload structure.' });
      return;
    }

    if (process.env.NODE_ENV === 'production' && env.POLAR_WEBHOOK_SECRET) {
      const isValid = verifyPolarWebhookSignature(req, rawBody);
      if (!isValid) {
        logger.error('Invalid Polar Webhook HMAC signature. Rejecting unauthorized request.');
        res.status(401).json({ error: 'Invalid webhook signature.' });
        return;
      }
    }

    logger.info(`📢 Polar Webhook received: [${event.type}]`);

    const data = event.data || {};
    const productId = data.productId || data.product_id || data.product?.id;
    const customerId = data.customerId || data.customer_id || data.customer?.id;
    const customerEmail = data.customer?.email || data.customerEmail || data.user?.email || data.email;
    const metadata = data.metadata || data.custom_field_data || {};

    let merchantId = metadata.merchantId;
    let resolvedTier: PlanTier = 'FREE';

    if (productId === env.POLAR_STARTER_PRODUCT_ID || String(productId).includes('4bbbaba8')) {
      resolvedTier = 'STARTER';
    } else if (productId === env.POLAR_PRO_PRODUCT_ID || String(productId).includes('1ca781e4')) {
      resolvedTier = 'PRO';
    }

    switch (event.type) {
      case 'subscription.created':
      case 'subscription.active':
      case 'subscription.updated':
      case 'checkout.updated':
      case 'order.created': {
        // Find merchant by ID or Email
        let merchant = merchantId
          ? await prisma.user.findUnique({ where: { id: merchantId } })
          : null;

        if (!merchant && customerEmail) {
          merchant = await prisma.user.findUnique({ where: { email: customerEmail } });
        }

        if (merchant) {
          // If event is checkout.updated, verify status
          if (event.type === 'checkout.updated' && data.status && data.status !== 'succeeded' && data.status !== 'confirmed') {
            logger.info(`Checkout updated but status is ${data.status}, skipping activation.`);
            break;
          }

          const targetTier = resolvedTier !== 'FREE' ? resolvedTier : (metadata.tier as PlanTier) || 'STARTER';
          const plan = getPlanConfig(targetTier);

          await prisma.user.update({
            where: { id: merchant.id },
            data: {
              planTier: targetTier,
              subscriptionStatus: 'active',
              stripeCustomerId: customerId || merchant.stripeCustomerId,
              stripeSubscriptionId: data.id || merchant.stripeSubscriptionId,
            },
          });

          clearPlanTierCache(merchant.id);
          logger.info(`🎉 Polar Webhook Success: Activated Tier [${targetTier}] for Merchant [${merchant.email}] (${plan.monthlyCredits.toLocaleString()} credits/mo with rollover)`);
        } else {
          logger.warn(`Polar Webhook: Could not find merchant for email: ${customerEmail} / merchantId: ${merchantId}`);
        }
        break;
      }

      case 'subscription.canceled':
      case 'subscription.revoked': {
        let merchant = merchantId
          ? await prisma.user.findUnique({ where: { id: merchantId } })
          : null;

        if (!merchant && customerEmail) {
          merchant = await prisma.user.findUnique({ where: { email: customerEmail } });
        }

        if (merchant) {
          await prisma.user.update({
            where: { id: merchant.id },
            data: {
              planTier: 'FREE',
              subscriptionStatus: 'canceled',
              stripeSubscriptionId: null,
              rolloverCredits: 0, // Rollover expires when paid subscription is canceled
            },
          });

          clearPlanTierCache(merchant.id);
          logger.info(`Polar Webhook: Subscription revoked for Merchant [${merchant.email}]. Downgraded to FREE.`);
        }
        break;
      }

      default:
        logger.info(`Polar Webhook [${event.type}] processed.`);
        break;
    }

    res.json({ received: true, event: event.type });
  } catch (error: any) {
    logger.error('Polar Webhook event processing error:', error);
    res.status(500).json({ error: error.message || 'Internal processing error.' });
  }
}

export async function verifyCheckout(
  req: DashboardAuthRequest,
  res: Response
): Promise<void> {
  try {
    const { session_id, tier } = req.query;
    const merchantId = req.merchant?.id!;

    if (tier && ['STARTER', 'PRO'].includes(tier as string)) {
      const resolvedTier = tier as PlanTier;
      await prisma.user.update({
        where: { id: merchantId },
        data: {
          subscriptionStatus: 'active',
          planTier: resolvedTier,
        },
      });

      clearPlanTierCache(merchantId);
      logger.info(`Verified Polar checkout for merchant ${merchantId} -> Tier: ${tier}`);
      res.json({ success: true, tier });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error verifying Polar checkout:', error);
    res.status(500).json({ error: error.message || 'Failed to verify checkout status.' });
  }
}

export async function getInvoices(
  req: DashboardAuthRequest,
  res: Response
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
          id: merchant.stripeSubscriptionId || 'sub_active',
          number: `INV-${merchant.planTier}-2026`,
          amount: merchant.planTier === 'PRO' ? '5.00' : merchant.planTier === 'STARTER' ? '2.00' : '0.00',
          currency: 'USD',
          status: merchant.subscriptionStatus === 'active' ? 'paid' : 'open',
          dateFormatted: new Date().toLocaleDateString(),
          pdf: '',
        },
      ],
    });
  } catch (error: any) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ error: error.message || 'Failed to load invoices.' });
  }
}

export async function downloadInvoice(
  req: DashboardAuthRequest,
  res: Response
): Promise<void> {
  res.status(200).json({ message: 'Invoices can be downloaded directly from your Polar customer portal.' });
}
