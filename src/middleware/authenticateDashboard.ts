import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../config/auth';
import { prisma } from '../config/db';
import { logger } from '../utils/logger';

export interface DashboardAuthRequest extends Request {
  merchant?: {
    id: string;
    email: string;
    name: string;
    planTier: string;
  };
}

const planTierCache = new Map<string, { tier: string; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function authenticateDashboard(
  req: DashboardAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: 'Unauthorized. No active session found.' });
      return;
    }

    const userId = session.user.id;
    let planTier = 'FREE';
    const now = Date.now();
    const cached = planTierCache.get(userId);

    if (cached && cached.expires > now) {
      planTier = cached.tier;
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { planTier: true },
      });
      planTier = dbUser?.planTier || 'FREE';
      
      // Cleanup to prevent memory leaks over time
      if (planTierCache.size > 1000) planTierCache.clear();
      
      planTierCache.set(userId, { tier: planTier, expires: now + CACHE_TTL_MS });
    }

    req.merchant = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      planTier,
    };

    next();
  } catch (error) {
    logger.warn('Dashboard Auth Failed:', error);
    res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
  }
}
