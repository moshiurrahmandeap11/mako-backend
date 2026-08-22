import express from 'express';
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  verifyCheckout,
  getInvoices,
  downloadInvoice,
} from './billing.controller';
import { authenticateDashboard } from '../../middleware/authenticateDashboard';

const router = express.Router();

// Protected dashboard endpoints
router.post('/checkout', express.json(), authenticateDashboard, createCheckoutSession);
router.post('/portal', express.json(), authenticateDashboard, createPortalSession);

router.get('/verify', authenticateDashboard, verifyCheckout);
router.get('/invoices', authenticateDashboard, getInvoices);
router.get('/invoices/:invoiceId/download', authenticateDashboard, downloadInvoice);

// Webhook endpoint (accept any content type and parse safely in handler)
router.post('/webhook', express.raw({ type: '*/*' }), handleWebhook);

export default router;
