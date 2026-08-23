"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const billing_controller_1 = require("./billing.controller");
const authenticateDashboard_1 = require("../../middleware/authenticateDashboard");
const router = express_1.default.Router();
// Protected dashboard endpoints
router.post('/checkout', express_1.default.json(), authenticateDashboard_1.authenticateDashboard, billing_controller_1.createCheckoutSession);
router.post('/portal', express_1.default.json(), authenticateDashboard_1.authenticateDashboard, billing_controller_1.createPortalSession);
router.get('/verify', authenticateDashboard_1.authenticateDashboard, billing_controller_1.verifyCheckout);
router.get('/invoices', authenticateDashboard_1.authenticateDashboard, billing_controller_1.getInvoices);
router.get('/invoices/:invoiceId/download', authenticateDashboard_1.authenticateDashboard, billing_controller_1.downloadInvoice);
// Webhook endpoint (accept any content type and parse safely in handler)
router.post('/webhook', express_1.default.raw({ type: '*/*' }), billing_controller_1.handleWebhook);
exports.default = router;
