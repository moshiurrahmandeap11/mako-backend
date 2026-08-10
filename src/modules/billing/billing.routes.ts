import express from 'express';
import { createCheckoutSession, createPortalSession, handleWebhook } from './billing.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = express.Router();

// Protected dashboard endpoints (using express.json() specifically since mounted before global body parsers)
router.post('/checkout', express.json(), authenticateDashboard, createCheckoutSession);
router.post('/portal', express.json(), authenticateDashboard, createPortalSession);

// Webhook endpoint (requires raw body, so we use express.raw middleware specifically)
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

export default router;
