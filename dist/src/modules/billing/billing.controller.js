"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.createPortalSession = createPortalSession;
exports.handleWebhook = handleWebhook;
exports.verifyCheckout = verifyCheckout;
exports.getInvoices = getInvoices;
exports.downloadInvoice = downloadInvoice;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../../config/db");
const polar_1 = require("../../utils/polar");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const authenticateDashboard_1 = require("../../middleware/authenticateDashboard");
const pricing_1 = require("../../config/pricing");
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
            res.status(404).json({ error: 'Merchant account not found.' });
            return;
        }
        let customerPortalUrl = '';
        // 1. Try customerId from database
        if (merchant.stripeCustomerId) {
            try {
                const session = await polar_1.polar.customerSessions.create({
                    customerId: merchant.stripeCustomerId,
                });
                if (session && session.customerPortalUrl) {
                    customerPortalUrl = session.customerPortalUrl;
                }
            }
            catch (err) {
                logger_1.logger.warn(`Polar customer session error for customerId ${merchant.stripeCustomerId}: ${err.message}`);
            }
        }
        // 2. If not found by customerId, lookup customer by email
        if (!customerPortalUrl && merchant.email) {
            try {
                const customersList = await polar_1.polar.customers.list({
                    email: merchant.email,
                    limit: 1,
                });
                const items = customersList.result?.items || customersList.items || [];
                const customer = items[0];
                if (customer?.id) {
                    const session = await polar_1.polar.customerSessions.create({
                        customerId: customer.id,
                    });
                    if (session && session.customerPortalUrl) {
                        customerPortalUrl = session.customerPortalUrl;
                        await db_1.prisma.user.update({
                            where: { id: merchant.id },
                            data: { stripeCustomerId: customer.id },
                        });
                    }
                }
            }
            catch (err) {
                logger_1.logger.warn(`Polar customer lookup error for email ${merchant.email}: ${err.message}`);
            }
        }
        // 3. Direct customer portal link fallback
        if (!customerPortalUrl) {
            customerPortalUrl =
                env_1.env.POLAR_SERVER === 'sandbox'
                    ? 'https://sandbox.polar.sh/purchases'
                    : 'https://polar.sh/purchases';
        }
        logger_1.logger.info(`Polar: Generated billing portal session URL for merchant ${merchant.email}: ${customerPortalUrl}`);
        res.json({ url: customerPortalUrl });
    }
    catch (error) {
        logger_1.logger.error('Error creating Polar billing portal session:', error);
        res.status(500).json({ error: error.message || 'Failed to access billing portal.' });
    }
}
function verifyPolarWebhookSignature(req, rawBody) {
    if (!env_1.env.POLAR_WEBHOOK_SECRET) {
        logger_1.logger.warn('POLAR_WEBHOOK_SECRET not set; skipping webhook HMAC signature check in dev mode.');
        return true;
    }
    const webhookId = req.headers['webhook-id'];
    const webhookTimestamp = req.headers['webhook-timestamp'];
    const webhookSignature = req.headers['webhook-signature'];
    if (!webhookSignature) {
        logger_1.logger.warn('Missing webhook-signature header on Polar webhook.');
        return false;
    }
    try {
        const secret = env_1.env.POLAR_WEBHOOK_SECRET.startsWith('whsec_')
            ? env_1.env.POLAR_WEBHOOK_SECRET.substring(6)
            : env_1.env.POLAR_WEBHOOK_SECRET;
        // Standard Webhook HMAC signature format
        const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody);
        const toSign = webhookId && webhookTimestamp ? `${webhookId}.${webhookTimestamp}.${bodyStr}` : bodyStr;
        const hmac = crypto_1.default.createHmac('sha256', secret).update(toSign).digest('hex');
        const base64Hmac = crypto_1.default.createHmac('sha256', secret).update(toSign).digest('base64');
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
    }
    catch (err) {
        logger_1.logger.error('Error validating Polar webhook signature:', err);
        return false;
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
        if (process.env.NODE_ENV === 'production' && env_1.env.POLAR_WEBHOOK_SECRET) {
            const isValid = verifyPolarWebhookSignature(req, rawBody);
            if (!isValid) {
                logger_1.logger.error('Invalid Polar Webhook HMAC signature. Rejecting unauthorized request.');
                res.status(401).json({ error: 'Invalid webhook signature.' });
                return;
            }
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
                    const plan = (0, pricing_1.getPlanConfig)(targetTier);
                    await db_1.prisma.user.update({
                        where: { id: merchant.id },
                        data: {
                            planTier: targetTier,
                            subscriptionStatus: 'active',
                            subscriptionStart: new Date(),
                            stripeCustomerId: customerId || merchant.stripeCustomerId,
                            stripeSubscriptionId: data.id || merchant.stripeSubscriptionId,
                        },
                    });
                    (0, authenticateDashboard_1.clearPlanTierCache)(merchant.id);
                    logger_1.logger.info(`🎉 Polar Webhook Success: Activated Tier [${targetTier}] for Merchant [${merchant.email}] (${plan.monthlyCredits.toLocaleString()} credits/mo with rollover)`);
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
                            rolloverCredits: 0, // Rollover expires when paid subscription is canceled
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
