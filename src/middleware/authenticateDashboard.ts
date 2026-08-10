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

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { planTier: true },
    });

    req.merchant = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      planTier: dbUser?.planTier || 'FREE',
    };

    next();
  } catch (error) {
    logger.warn('Dashboard Auth Failed:', error);
    res.status(401).json({ error: 'Unauthorized. Invalid or expired session.' });
  }
}
