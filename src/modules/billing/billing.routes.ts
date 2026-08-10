import express from 'express';
import { createCheckoutSession, createPortalSession, handleWebhook } from './billing.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = express.Router();

// Protected dashboard endpoints
router.post('/checkout', authenticateDashboard, createCheckoutSession);
router.post('/portal', authenticateDashboard, createPortalSession);

// Webhook endpoint (requires raw body, so we use express.raw middleware specifically)
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

export default router;
