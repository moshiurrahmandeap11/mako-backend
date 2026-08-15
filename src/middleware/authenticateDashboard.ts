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
    role: string;
  };
}

const userMetaCache = new Map<string, { tier: string; role: string; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearPlanTierCache(userId?: string) {
  if (userId) {
    userMetaCache.delete(userId);
  } else {
    userMetaCache.clear();
  }
}

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
    let role = 'MERCHANT';
    const now = Date.now();
    const cached = userMetaCache.get(userId);

    if (cached && cached.expires > now) {
      planTier = cached.tier;
      role = cached.role;
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { planTier: true, role: true, email: true },
      });
      planTier = dbUser?.planTier || 'FREE';
      role = dbUser?.role || (dbUser?.email === 'admin@ahsanul.dev' ? 'ADMIN' : 'MERCHANT');
      
      // Cleanup to prevent memory leaks over time
      if (userMetaCache.size > 1000) userMetaCache.clear();
      
      userMetaCache.set(userId, { tier: planTier, role, expires: now + CACHE_TTL_MS });
    }

    req.merchant = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      planTier,
      role,
    };

    next();
  } catch (error) {
    logger.warn('Dashboard Auth Failed:', error);
    res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
  }
}

export function requireAdmin(
  req: DashboardAuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.merchant || (req.merchant.role !== 'ADMIN' && req.merchant.email !== 'admin@ahsanul.dev')) {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
    return;
  }
  next();
}
