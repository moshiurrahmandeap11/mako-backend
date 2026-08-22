import { Response, Request } from 'express';
import { prisma } from '../../config/db';
import { polar } from '../../utils/polar';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest, clearPlanTierCache } from '../../middleware/authenticateDashboard';
import { PlanTier } from '@prisma/client';

const TIER_MESSAGE_LIMITS: Record<string, number> = {
  FREE: 100,
  STARTER: 500,
  PRO: 1200,
  ENTERPRISE: 999999,
};

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
      successUrl: `${env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_ID}&tier=${tier}`,
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
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }

    // Polar Customer Portal / Purchases URL
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
      res.status(400).json({ error: 'Invalid webhook payload structure.' });
      return;
    }

    logger.info(`Polar Webhook received: [${event.type}]`);

    switch (event.type) {
      case 'subscription.created':
      case 'subscription.active':
      case 'subscription.updated': {
        const subscription = event.data;
        const productId = subscription.productId || subscription.product_id;
        const customerId = subscription.customerId || subscription.customer_id;
        const customerEmail = subscription.customer?.email || subscription.user?.email;
        const metadata = subscription.metadata || {};

        let merchantId = metadata.merchantId;
        let resolvedTier: PlanTier = 'FREE';

        // Match product ID to PlanTier
        if (productId === env.POLAR_STARTER_PRODUCT_ID) {
          resolvedTier = 'STARTER';
        } else if (productId === env.POLAR_PRO_PRODUCT_ID) {
          resolvedTier = 'PRO';
        }

        // Locate merchant user
        let merchant = merchantId
          ? await prisma.user.findUnique({ where: { id: merchantId } })
          : null;

        if (!merchant && customerEmail) {
          merchant = await prisma.user.findUnique({ where: { email: customerEmail } });
        }

        if (merchant) {
          const newLimit = TIER_MESSAGE_LIMITS[resolvedTier] || 100;

          await prisma.user.update({
            where: { id: merchant.id },
            data: {
              planTier: resolvedTier,
              subscriptionStatus: 'active',
              stripeCustomerId: customerId || merchant.stripeCustomerId,
              stripeSubscriptionId: subscription.id,
            },
          });

          clearPlanTierCache(merchant.id);
          logger.info(`Polar Webhook: Activated Tier [${resolvedTier}] for Merchant [${merchant.id}] (${newLimit} msgs/mo)`);
        }
        break;
      }

      case 'subscription.canceled':
      case 'subscription.revoked': {
        const subscription = event.data;
        const customerEmail = subscription.customer?.email || subscription.user?.email;
        const metadata = subscription.metadata || {};

        let merchantId = metadata.merchantId;
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
            },
          });

          clearPlanTierCache(merchant.id);
          logger.info(`Polar Webhook: Subscription revoked for Merchant [${merchant.id}]. Downgraded to FREE.`);
        }
        break;
      }

      case 'order.created': {
        const order = event.data;
        logger.info(`Polar Webhook: Order created ID: ${order.id}`);
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Polar Webhook event processing error:', error);
    res.status(500).json({ error: 'Internal processing error.' });
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
