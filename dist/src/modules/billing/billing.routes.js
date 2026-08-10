"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const billing_controller_1 = require("./billing.controller");
const authenticateDashboard_1 = require("../../middleware/authenticateDashboard");
const router = express_1.default.Router();
// Protected dashboard endpoints (using express.json() specifically since mounted before global body parsers)
router.post('/checkout', express_1.default.json(), authenticateDashboard_1.authenticateDashboard, billing_controller_1.createCheckoutSession);
router.post('/portal', express_1.default.json(), authenticateDashboard_1.authenticateDashboard, billing_controller_1.createPortalSession);
// Webhook endpoint (requires raw body, so we use express.raw middleware specifically)
router.post('/webhook', express_1.default.raw({ type: 'application/json' }), billing_controller_1.handleWebhook);
exports.default = router;
