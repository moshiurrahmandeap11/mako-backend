import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { connectDB } from './config/db';
import { logger } from './utils/logger';

import { toNodeHandler } from 'better-auth/node';
import { auth } from './config/auth';

import merchantRoutes from './modules/merchant/merchant.routes';
import apiKeyRoutes from './modules/apiKey/apiKey.routes';
import productRoutes from './modules/product/product.routes';
import widgetConfigRoutes from './modules/widgetConfig/widgetConfig.routes';
import widgetChatRoutes from './modules/chat/chat.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import billingRoutes from './modules/billing/billing.routes';
import knowledgeRoutes from './modules/knowledge/knowledge.routes';
import { initCronJobs } from './jobs/cron';

const app = express();
app.set('trust proxy', 1);

// CORS Policy
const allowedOrigins = [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://mako-frontend.vercel.app'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

// Better Auth route handler (must be mounted before body parsers)
app.use('/api/auth', toNodeHandler(auth));

// Mount billing routes before express.json() to allow raw body verification for webhook
app.use('/api/billing', billingRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Robust Static File Serving for widget.js
const publicPaths = [
  path.resolve(process.cwd(), 'public'),
  path.resolve(__dirname, '../../public'),
  path.resolve(__dirname, '../public'),
];

let publicDir = publicPaths.find((p) => fs.existsSync(p)) || publicPaths[0];

app.use('/widget.js', (req, res, next) => {
  const widgetFilePath = path.join(publicDir, 'widget.js');
  if (fs.existsSync(widgetFilePath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(widgetFilePath);
  } else {
    next();
  }
});
app.use('/public', express.static(publicDir));

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Labto AI Widget API', timestamp: new Date().toISOString() });
});

// Register API Routes
app.use('/api/merchant', merchantRoutes);
app.use('/api/keys', apiKeyRoutes);
app.use('/api/products', productRoutes);
app.use('/api/widget-config', widgetConfigRoutes);
app.use('/api/widget', widgetChatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = env.PORT || 4000;

async function startServer() {
  await connectDB();
  initCronJobs();
  app.listen(PORT, () => {
    logger.info(`🚀 Backend Express API listening on port ${PORT}`);
    logger.info(`📦 Widget static bundle available at http://localhost:${PORT}/widget.js`);
  });
}

startServer();
