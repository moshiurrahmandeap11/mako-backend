import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { hashApiKey } from '../utils/apiKeyGenerator';
import { logger } from '../utils/logger';

export interface WidgetAuthRequest extends Request {
  merchant?: {
    id: string;
    name: string;
    allowedDomains: string[];
    planTier: string;
  };
  apiKeyId?: string;
  apiKeyRecord?: any;
}

export async function authenticateWidget(
  req: WidgetAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawApiKey = (req.headers['x-api-key'] || req.query.apiKey) as string;

    if (!rawApiKey) {
      res.status(401).json({ error: 'Missing x-api-key header or apiKey query parameter.' });
      return;
    }

    const hashedKey = hashApiKey(rawApiKey);

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { hashedKey },
      include: {
        merchant: {
          select: { id: true, name: true, allowedDomains: true, planTier: true },
        },
      },
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      res.status(401).json({ error: 'Invalid or inactive API Key.' });
      return;
    }

    // Origin Domain Whitelist Validation
    const originHeader = req.headers.origin || req.headers.referer || '';
    let reqDomain = '';
    if (originHeader) {
      try {
        reqDomain = new URL(originHeader).hostname;
      } catch {
        reqDomain = '';
      }
    }

    // Combine domains from both the specific API Key and the Merchant's global widget settings
    const combinedDomains = [
      ...(apiKeyRecord.allowedDomains || []),
      ...(apiKeyRecord.merchant?.allowedDomains || [])
    ];
    const allowedDomains = [...new Set(combinedDomains)];
    const isDomainAllowed =
      allowedDomains.length === 0 || // empty allowedDomains means all domains allowed (for initial setup/dev)
      allowedDomains.some((domain) => {
        if (domain === '*' || domain === reqDomain || domain === `http://${reqDomain}` || domain === `https://${reqDomain}`) {
          return true;
        }
        return reqDomain.endsWith(domain.replace(/^\*?\./, ''));
      });

    if (process.env.NODE_ENV === 'production' && !isDomainAllowed && reqDomain) {
      logger.warn(`Widget API domain rejected. Request Domain: ${reqDomain}, Allowed: ${allowedDomains.join(',')}`);
      res.status(403).json({ error: `Domain '${reqDomain}' is not whitelisted for this API key.` });
      return;
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    req.merchant = apiKeyRecord.merchant;
    req.apiKeyId = apiKeyRecord.id;
    req.apiKeyRecord = apiKeyRecord;

    next();
  } catch (error) {
    logger.error('Widget authentication middleware error:', error);
    res.status(500).json({ error: 'Internal server authentication error.' });
  }
}
