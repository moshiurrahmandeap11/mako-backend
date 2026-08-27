"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const node_1 = require("better-auth/node");
const auth_1 = require("./config/auth");
const cron_1 = require("./jobs/cron");
const admin_routes_1 = require("./modules/admin/admin.routes");
const adminSettings_controller_1 = require("./modules/admin/adminSettings.controller");
const analytics_routes_1 = __importDefault(require("./modules/analytics/analytics.routes"));
const apiKey_routes_1 = __importDefault(require("./modules/apiKey/apiKey.routes"));
const billing_routes_1 = __importDefault(require("./modules/billing/billing.routes"));
const chat_routes_1 = __importDefault(require("./modules/chat/chat.routes"));
const contact_routes_1 = require("./modules/contact/contact.routes");
const knowledge_routes_1 = __importDefault(require("./modules/knowledge/knowledge.routes"));
const merchant_routes_1 = __importDefault(require("./modules/merchant/merchant.routes"));
const product_routes_1 = __importDefault(require("./modules/product/product.routes"));
const reports_routes_1 = require("./modules/reports/reports.routes");
const widgetConfig_routes_1 = __importDefault(require("./modules/widgetConfig/widgetConfig.routes"));
const app = (0, express_1.default)();
app.set("trust proxy", 1);
// CORS Policy
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "x-api-key",
        "X-API-KEY",
        "*",
    ],
    exposedHeaders: ["Content-Disposition"],
}));
app.options("*", (0, cors_1.default)());
// Better Auth route handler (must be mounted before body parsers)
app.use("/api/auth", (0, node_1.toNodeHandler)(auth_1.auth));
// Mount billing routes before express.json() to allow raw body verification for webhook
app.use("/api/billing", billing_routes_1.default);
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
// Robust Static File Serving for widget.js
const publicPaths = [
    path_1.default.resolve(process.cwd(), "public"),
    path_1.default.resolve(__dirname, "../../public"),
    path_1.default.resolve(__dirname, "../public"),
];
let publicDir = publicPaths.find((p) => fs_1.default.existsSync(p)) || publicPaths[0];
app.use("/widget.js", (req, res, next) => {
    const widgetFilePath = path_1.default.join(publicDir, "widget.js");
    if (fs_1.default.existsSync(widgetFilePath)) {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.sendFile(widgetFilePath);
    }
    else {
        next();
    }
});
app.use("/public", express_1.default.static(publicDir));
// Health Check
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "Labto AI Widget API",
        timestamp: new Date().toISOString(),
    });
});
// Register API Routes
app.use("/api/merchant", merchant_routes_1.default);
app.use("/api/keys", apiKey_routes_1.default);
app.use("/api/products", product_routes_1.default);
app.use("/api/widget-config", widgetConfig_routes_1.default);
app.use("/api/widget", chat_routes_1.default);
app.use("/api/analytics", analytics_routes_1.default);
app.use("/api/knowledge", knowledge_routes_1.default);
app.use("/api/contact", contact_routes_1.contactRouter);
app.use("/api/reports", reports_routes_1.reportsRouter);
app.use("/api/admin", admin_routes_1.adminRouter);
app.get("/api/settings/public", adminSettings_controller_1.getPublicPlatformSettings);
// Global Error Handler
app.use((err, req, res, next) => {
    logger_1.logger.error("Unhandled Server Error:", err);
    res.status(500).json({ error: "Internal server error." });
});
const PORT = env_1.env.PORT || 4000;
async function startServer() {
    await (0, db_1.connectDB)();
    (0, cron_1.initCronJobs)();
    app.listen(PORT, () => {
        logger_1.logger.info(`🚀 Backend Express API listening on port ${PORT}`);
        logger_1.logger.info(`📦 Widget static bundle available at http://localhost:${PORT}/widget.js`);
    });
}
startServer();
