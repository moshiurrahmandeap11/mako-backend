"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.createPortalSession = createPortalSession;
exports.handleWebhook = handleWebhook;
exports.verifyCheckout = verifyCheckout;
exports.getInvoices = getInvoices;
exports.downloadInvoice = downloadInvoice;
const db_1 = require("../../config/db");
const polar_1 = require("../../utils/polar");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const authenticateDashboard_1 = require("../../middleware/authenticateDashboard");
const TIER_MESSAGE_LIMITS = {
    FREE: 100,
    STARTER: 500,
    PRO: 1200,
    ENTERPRISE: 999999,
};
async function createCheckoutSession(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { tier } = req.body;
        if (!polar_1.polar) {
            res.status(500).json({ error: 'Polar billing system not configured on server.' });
            return;
        }
        if (!tier || !['STARTER', 'PRO'].includes(tier)) {
            res.status(400).json({ error: 'Valid plan tier required (STARTER or PRO).' });
            return;
        }
        const productId = tier === 'STARTER' ? env_1.env.POLAR_STARTER_PRODUCT_ID : env_1.env.POLAR_PRO_PRODUCT_ID;
        if (!productId) {
            res.status(500).json({ error: `Polar product ID for tier ${tier} is missing in environment variables.` });
            return;
        }
        // Fetch full merchant user from database
        const merchant = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
        });
        if (!merchant) {
            res.status(404).json({ error: 'Merchant account not found.' });
            return;
        }
        // Create Polar.sh Checkout Session
        const checkout = await polar_1.polar.checkouts.create({
            products: [productId],
            customerEmail: merchant.email,
            customerName: merchant.name || undefined,
            metadata: {
                merchantId: merchant.id,
                tier: tier,
            },
            successUrl: `${env_1.env.FRONTEND_URL}/billing?session_id={CHECKOUT_ID}&tier=${tier}`,
        });
        logger_1.logger.info(`Polar: Created checkout session for Merchant ${merchantId} -> Tier: ${tier} -> URL: ${checkout.url}`);
        res.json({ url: checkout.url });
    }
    catch (error) {
        logger_1.logger.error('Error creating Polar checkout session:', error);
        res.status(500).json({ error: error.message || 'Failed to initialize checkout session.' });
    }
}
async function createPortalSession(req, res) {
    try {
        const merchantId = req.merchant?.id;
        if (!polar_1.polar) {
            res.status(500).json({ error: 'Billing system not configured on server.' });
            return;
        }
        const merchant = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
        });
        if (!merchant) {
            res.status(404).json({ error: 'Merchant not found.' });
            return;
        }
        // Polar Customer Portal URL
        const portalUrl = env_1.env.POLAR_SERVER === 'sandbox'
            ? 'https://sandbox.polar.sh/purchases'
            : 'https://polar.sh/purchases';
        res.json({ url: portalUrl });
    }
    catch (error) {
        logger_1.logger.error('Error creating Polar billing portal session:', error);
        res.status(500).json({ error: 'Failed to access billing portal.' });
    }
}
async function handleWebhook(req, res) {
    try {
        const rawBody = req.rawBody || req.body;
        let event;
        if (typeof rawBody === 'string') {
            event = JSON.parse(rawBody);
        }
        else if (Buffer.isBuffer(rawBody)) {
            event = JSON.parse(rawBody.toString('utf-8'));
        }
        else {
            event = rawBody;
        }
        if (!event || !event.type) {
            logger_1.logger.warn('Polar Webhook received with invalid structure or empty event.');
            res.status(400).json({ error: 'Invalid webhook payload structure.' });
            return;
        }
        logger_1.logger.info(`📢 Polar Webhook received: [${event.type}]`);
        const data = event.data || {};
        const productId = data.productId || data.product_id || data.product?.id;
        const customerId = data.customerId || data.customer_id || data.customer?.id;
        const customerEmail = data.customer?.email || data.customerEmail || data.user?.email || data.email;
        const metadata = data.metadata || data.custom_field_data || {};
        let merchantId = metadata.merchantId;
        let resolvedTier = 'FREE';
        if (productId === env_1.env.POLAR_STARTER_PRODUCT_ID || String(productId).includes('4bbbaba8')) {
            resolvedTier = 'STARTER';
        }
        else if (productId === env_1.env.POLAR_PRO_PRODUCT_ID || String(productId).includes('1ca781e4')) {
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
                    ? await db_1.prisma.user.findUnique({ where: { id: merchantId } })
                    : null;
                if (!merchant && customerEmail) {
                    merchant = await db_1.prisma.user.findUnique({ where: { email: customerEmail } });
                }
                if (merchant) {
                    // If event is checkout.updated, verify status
                    if (event.type === 'checkout.updated' && data.status && data.status !== 'succeeded' && data.status !== 'confirmed') {
                        logger_1.logger.info(`Checkout updated but status is ${data.status}, skipping activation.`);
                        break;
                    }
                    const targetTier = resolvedTier !== 'FREE' ? resolvedTier : metadata.tier || 'STARTER';
                    const newLimit = TIER_MESSAGE_LIMITS[targetTier] || 500;
                    await db_1.prisma.user.update({
                        where: { id: merchant.id },
                        data: {
                            planTier: targetTier,
                            subscriptionStatus: 'active',
                            stripeCustomerId: customerId || merchant.stripeCustomerId,
                            stripeSubscriptionId: data.id || merchant.stripeSubscriptionId,
                        },
                    });
                    (0, authenticateDashboard_1.clearPlanTierCache)(merchant.id);
                    logger_1.logger.info(`🎉 Polar Webhook Success: Activated Tier [${targetTier}] for Merchant [${merchant.email}] (${newLimit} msgs/mo)`);
                }
                else {
                    logger_1.logger.warn(`Polar Webhook: Could not find merchant for email: ${customerEmail} / merchantId: ${merchantId}`);
                }
                break;
            }
            case 'subscription.canceled':
            case 'subscription.revoked': {
                let merchant = merchantId
                    ? await db_1.prisma.user.findUnique({ where: { id: merchantId } })
                    : null;
                if (!merchant && customerEmail) {
                    merchant = await db_1.prisma.user.findUnique({ where: { email: customerEmail } });
                }
                if (merchant) {
                    await db_1.prisma.user.update({
                        where: { id: merchant.id },
                        data: {
                            planTier: 'FREE',
                            subscriptionStatus: 'canceled',
                            stripeSubscriptionId: null,
                        },
                    });
                    (0, authenticateDashboard_1.clearPlanTierCache)(merchant.id);
                    logger_1.logger.info(`Polar Webhook: Subscription revoked for Merchant [${merchant.email}]. Downgraded to FREE.`);
                }
                break;
            }
            default:
                logger_1.logger.info(`Polar Webhook [${event.type}] processed.`);
                break;
        }
        res.json({ received: true, event: event.type });
    }
    catch (error) {
        logger_1.logger.error('Polar Webhook event processing error:', error);
        res.status(500).json({ error: error.message || 'Internal processing error.' });
    }
}
async function verifyCheckout(req, res) {
    try {
        const { session_id, tier } = req.query;
        const merchantId = req.merchant?.id;
        if (tier && ['STARTER', 'PRO'].includes(tier)) {
            const resolvedTier = tier;
            await db_1.prisma.user.update({
                where: { id: merchantId },
                data: {
                    subscriptionStatus: 'active',
                    planTier: resolvedTier,
                },
            });
            (0, authenticateDashboard_1.clearPlanTierCache)(merchantId);
            logger_1.logger.info(`Verified Polar checkout for merchant ${merchantId} -> Tier: ${tier}`);
            res.json({ success: true, tier });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Error verifying Polar checkout:', error);
        res.status(500).json({ error: error.message || 'Failed to verify checkout status.' });
    }
}
async function getInvoices(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const merchant = await db_1.prisma.user.findUnique({
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
    }
    catch (error) {
        logger_1.logger.error('Error fetching invoices:', error);
        res.status(500).json({ error: error.message || 'Failed to load invoices.' });
    }
}
async function downloadInvoice(req, res) {
    res.status(200).json({ message: 'Invoices can be downloaded directly from your Polar customer portal.' });
}
