import { Response, NextFunction } from 'express';
import { WidgetAuthRequest } from './authenticateWidget';
import { logger } from '../utils/logger';

// In-memory sliding window store for short-term request bursts
// Map key: IP or Widget SessionId -> timestamps array
const requestTimestamps = new Map<string, number[]>();

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 20; // Max 20 requests per minute per client

// Cleanup stale timestamps every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestTimestamps.entries()) {
    const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);
    if (validTimestamps.length === 0) {
      requestTimestamps.delete(key);
    } else {
      requestTimestamps.set(key, validTimestamps);
    }
  }
}, 5 * 60 * 1000);

export function rateLimitBurst(
  req: WidgetAuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const clientKey =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      req.body?.sessionId ||
      'unknown_client';

    const now = Date.now();
    const timestamps = requestTimestamps.get(clientKey) || [];

    // Filter timestamps within the current sliding 1-minute window
    const recentTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
      logger.warn(`[RateLimitBurst] Client ${clientKey} exceeded short-term burst limit (20 req/min).`);
      res.status(429).json({
        error: 'Too many requests in a short period. Please slow down and try again in a minute.',
        retryAfterSeconds: 60,
      });
      return;
    }

    recentTimestamps.push(now);
    requestTimestamps.set(clientKey, recentTimestamps);

    next();
  } catch (error) {
    logger.error('[RateLimitBurst] Middleware error:', error);
    next();
  }
}
