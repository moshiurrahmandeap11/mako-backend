"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCheckoutSession = createCheckoutSession;
exports.createPortalSession = createPortalSession;
exports.handleWebhook = handleWebhook;
exports.verifyCheckout = verifyCheckout;
exports.getInvoices = getInvoices;
const db_1 = require("../../config/db");
const stripe_1 = require("../../utils/stripe");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const PLAN_PRICES = {
    STARTER: { amount: 29, name: 'Starter Plan' },
    PRO: { amount: 79, name: 'Pro Plan' },
};
// Helper function to get or dynamically create products/prices in developer's Stripe account
async function getOrCreatePriceId(tier) {
    if (!stripe_1.stripe) {
        throw new Error('Stripe is not configured in environment variables.');
    }
    const planInfo = PLAN_PRICES[tier];
    if (!planInfo) {
        throw new Error(`Invalid plan tier: ${tier}`);
    }
    const productName = `Labto AI - ${planInfo.name}`;
    // 1. Search for existing product in Stripe
    const products = await stripe_1.stripe.products.list({ active: true, limit: 100 });
    let stripeProduct = products.data.find((p) => p.name === productName);
    if (!stripeProduct) {
        // Create new product if not exists
        stripeProduct = await stripe_1.stripe.products.create({
            name: productName,
            description: `Subscription for ${planInfo.name} on Labto AI Widget platform`,
        });
        logger_1.logger.info(`Stripe: Created product for tier ${tier} - ID: ${stripeProduct.id}`);
    }
    // 2. Search for existing recurring monthly price for the product
    const prices = await stripe_1.stripe.prices.list({
        product: stripeProduct.id,
        active: true,
        limit: 100,
    });
    let stripePrice = prices.data.find((price) => price.unit_amount === planInfo.amount * 100 &&
        price.recurring?.interval === 'month');
    if (!stripePrice) {
        // Create recurring price if not exists
        stripePrice = await stripe_1.stripe.prices.create({
            product: stripeProduct.id,
            unit_amount: planInfo.amount * 100,
            currency: 'usd',
            recurring: { interval: 'month' },
        });
        logger_1.logger.info(`Stripe: Created monthly recurring price for ${tier} - ID: ${stripePrice.id}`);
    }
    return stripePrice.id;
}
async function createCheckoutSession(req, res) {
    try {
        const merchantId = req.merchant?.id;
        const { tier } = req.body;
        if (!stripe_1.stripe) {
            res.status(500).json({ error: 'Billing system not configured on server.' });
            return;
        }
        if (!tier || !['STARTER', 'PRO'].includes(tier)) {
            res.status(400).json({ error: 'Valid plan tier required (STARTER or PRO).' });
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
        // Get or Create Stripe Customer ID
        let stripeCustomerId = merchant.stripeCustomerId;
        if (!stripeCustomerId) {
            const customer = await stripe_1.stripe.customers.create({
                email: merchant.email,
                name: merchant.name,
                metadata: { merchantId },
            });
            stripeCustomerId = customer.id;
            // Save Stripe Customer ID to DB
            await db_1.prisma.user.update({
                where: { id: merchantId },
                data: { stripeCustomerId },
            });
        }
        // Get or create Price ID dynamically
        const priceId = await getOrCreatePriceId(tier);
        // Create checkout session
        const session = await stripe_1.stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${env_1.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${env_1.env.FRONTEND_URL}/pricing`,
            metadata: {
                merchantId,
                tier,
            },
        });
        res.json({ url: session.url });
    }
    catch (error) {
        logger_1.logger.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message || 'Failed to initialize checkout session.' });
    }
}
async function createPortalSession(req, res) {
    try {
        const merchantId = req.merchant?.id;
        if (!stripe_1.stripe) {
            res.status(500).json({ error: 'Billing system not configured on server.' });
            return;
        }
        const merchant = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
        });
        if (!merchant || !merchant.stripeCustomerId) {
            res.status(400).json({ error: 'No billing history or active subscription found.' });
            return;
        }
        // Create Stripe Customer Portal session
        const portalSession = await stripe_1.stripe.billingPortal.sessions.create({
            customer: merchant.stripeCustomerId,
            return_url: `${env_1.env.FRONTEND_URL}/dashboard`,
        });
        res.json({ url: portalSession.url });
    }
    catch (error) {
        logger_1.logger.error('Error creating billing portal session:', error);
        res.status(500).json({ error: 'Failed to access billing portal.' });
    }
}
async function handleWebhook(req, res) {
    let event;
    if (!stripe_1.stripe) {
        res.status(500).json({ error: 'Stripe client is not initialized.' });
        return;
    }
    const signature = req.headers['stripe-signature'];
    const webhookSecret = env_1.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) {
        res.status(400).json({ error: 'Missing webhook configuration.' });
        return;
    }
    try {
        // Read raw body parsed in custom JSON parser middleware
        const rawBody = req.rawBody || req.body;
        event = stripe_1.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    catch (err) {
        logger_1.logger.warn(`⚠️ Webhook signature verification failed:`, err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const merchantId = session.metadata?.merchantId;
                const tier = session.metadata?.tier;
                if (merchantId && tier) {
                    await db_1.prisma.user.update({
                        where: { id: merchantId },
                        data: {
                            stripeSubscriptionId: session.subscription,
                            planTier: tier,
                            subscriptionStatus: 'active',
                        },
                    });
                    logger_1.logger.info(`Webhook: Activated subscription for Merchant ${merchantId} -> Tier: ${tier}`);
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                // Search for user/merchant in DB using Customer ID
                const merchant = await db_1.prisma.user.findFirst({
                    where: { stripeCustomerId: customerId },
                });
                if (merchant) {
                    const status = subscription.status;
                    const priceId = subscription.items.data[0]?.price.id;
                    // Resolve PlanTier by finding Stripe Price
                    let resolvedTier = merchant.planTier;
                    if (stripe_1.stripe) {
                        const price = await stripe_1.stripe.prices.retrieve(priceId, { expand: ['product'] });
                        const productName = price.product?.name || '';
                        if (productName.includes('Starter')) {
                            resolvedTier = 'STARTER';
                        }
                        else if (productName.includes('Pro')) {
                            resolvedTier = 'PRO';
                        }
                    }
                    await db_1.prisma.user.update({
                        where: { id: merchant.id },
                        data: {
                            stripeSubscriptionId: subscription.id,
                            subscriptionStatus: status,
                            planTier: status === 'active' ? resolvedTier : merchant.planTier,
                        },
                    });
                    logger_1.logger.info(`Webhook: Subscription updated for Merchant ${merchant.id} -> Status: ${status}`);
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const merchant = await db_1.prisma.user.findFirst({
                    where: { stripeCustomerId: customerId },
                });
                if (merchant) {
                    await db_1.prisma.user.update({
                        where: { id: merchant.id },
                        data: {
                            stripeSubscriptionId: null,
                            subscriptionStatus: 'canceled',
                            planTier: 'FREE', // Reset back to free tier
                        },
                    });
                    logger_1.logger.info(`Webhook: Subscription canceled for Merchant ${merchant.id}. Downgraded to FREE.`);
                }
                break;
            }
            default:
                // Other events can be safely ignored
                break;
        }
        res.json({ received: true });
    }
    catch (error) {
        logger_1.logger.error('Webhook event processing error:', error);
        res.status(500).json({ error: 'Internal processing error.' });
    }
}
async function verifyCheckout(req, res) {
    try {
        const { session_id } = req.query;
        if (!session_id || typeof session_id !== 'string') {
            res.status(400).json({ error: 'Missing session_id query parameter.' });
            return;
        }
        if (!stripe_1.stripe) {
            res.status(500).json({ error: 'Stripe is not configured.' });
            return;
        }
        const session = await stripe_1.stripe.checkout.sessions.retrieve(session_id);
        const merchantId = session.metadata?.merchantId;
        const tier = session.metadata?.tier;
        if (session.payment_status === 'paid' && merchantId && tier) {
            await db_1.prisma.user.update({
                where: { id: merchantId },
                data: {
                    stripeSubscriptionId: session.subscription,
                    subscriptionStatus: 'active',
                    planTier: tier,
                },
            });
            logger_1.logger.info(`Verified checkout via API for merchant ${merchantId} -> Tier: ${tier}`);
            res.json({ success: true, tier });
            return;
        }
        res.json({ success: false, status: session.payment_status });
    }
    catch (error) {
        logger_1.logger.error('Error verifying checkout:', error);
        res.status(500).json({ error: error.message || 'Failed to verify checkout status.' });
    }
}
async function getInvoices(req, res) {
    try {
        const merchantId = req.merchant?.id;
        if (!stripe_1.stripe) {
            res.status(500).json({ error: 'Stripe is not configured.' });
            return;
        }
        const merchant = await db_1.prisma.user.findUnique({
            where: { id: merchantId },
        });
        if (!merchant || !merchant.stripeCustomerId) {
            res.json({ invoices: [] });
            return;
        }
        const invoices = await stripe_1.stripe.invoices.list({
            customer: merchant.stripeCustomerId,
            limit: 15,
        });
        const formatted = invoices.data.map((inv) => ({
            id: inv.id,
            number: inv.number || 'Draft Invoice',
            amount: (inv.amount_paid / 100).toFixed(2),
            currency: (inv.currency || 'USD').toUpperCase(),
            status: inv.status || 'open',
            created: new Date(inv.created * 1000).toLocaleDateString(),
            pdf: inv.invoice_pdf || inv.hosted_invoice_url || '',
        }));
        res.json({ invoices: formatted });
    }
    catch (error) {
        logger_1.logger.error('Error fetching invoices:', error);
        res.status(500).json({ error: error.message || 'Failed to load invoices.' });
    }
}
