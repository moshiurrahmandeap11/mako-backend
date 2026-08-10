import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/db';
import { processChatMessage } from './chat.service';
import { logger } from '../../utils/logger';
import { WidgetAuthRequest } from '../../middleware/authenticateWidget';

export async function createSession(req: WidgetAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;

    await prisma.conversation.create({
      data: {
        merchantId,
        sessionId,
      },
    });

    res.json({ sessionId });
  } catch (error) {
    logger.error('Create Widget Session Error:', error);
    res.status(500).json({ error: 'Failed to create widget session.' });
  }
}

export async function getWidgetConfigPublic(req: WidgetAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const planTier = req.merchant?.planTier || 'FREE';
    const isFree = planTier === 'FREE';

    let config = await prisma.widgetConfig.findUnique({
      where: { merchantId },
    });

    if (!config) {
      config = {
        id: '',
        merchantId,
        primaryColor: '#111111',
        greetingMessage: 'Hi! How can I help you shop today?',
        botName: 'Shop Assistant',
        position: 'bottom-right',
        addToCartEnabled: true,
      };
    }

    res.json({
      primaryColor: config.primaryColor || '#111111',
      greetingMessage: config.greetingMessage || 'Hi! How can I help you shop today?',
      botName: config.botName || 'Shop Assistant',
      position: config.position || 'bottom-right',
      addToCartEnabled: config.addToCartEnabled !== undefined ? config.addToCartEnabled : true,
      hideBranding: planTier === 'PRO' || planTier === 'ENTERPRISE',
      eventBridgeEnabled: planTier === 'PRO' || planTier === 'ENTERPRISE',
    });
  } catch (error) {
    logger.error('Get Public Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to fetch widget configuration.' });
  }
}

export async function chat(req: WidgetAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { sessionId, message, botMode, provider, imageUrl } = req.body;

    if ((!message || typeof message !== 'string') && !imageUrl) {
      res.status(400).json({ error: 'Message or imageUrl field is required.' });
      return;
    }

    const effectiveSessionId = sessionId || `sess_${crypto.randomBytes(16).toString('hex')}`;

    const response = await processChatMessage(
      merchantId,
      effectiveSessionId,
      (message || '').trim(),
      botMode,
      provider,
      req.apiKeyRecord?.systemPrompt,
      req.apiKeyRecord?.template,
      imageUrl
    );

    res.json(response);
  } catch (error) {
    logger.error('Widget Chat API Error:', error);
    res.status(500).json({ error: 'Failed to process chat message.' });
  }
}

export async function pingVisitor(req: WidgetAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { visitorId } = req.body;

    if (!visitorId) {
      res.status(400).json({ error: 'visitorId is required.' });
      return;
    }

    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    let country = 'United States';
    let countryCode = 'US';
    let city = 'New York';

    // 1. Cloudflare IP country header
    const cfCountry = req.headers['cf-ipcountry'] as string;
    if (cfCountry && cfCountry.length === 2 && cfCountry !== 'XX') {
      countryCode = cfCountry.toUpperCase();
      country = countryCode === 'BD' ? 'Bangladesh' : countryCode === 'US' ? 'United States' : countryCode === 'GB' ? 'United Kingdom' : countryCode;
    } else {
      // 2. geoip-lite lookup
      const geoip = await import('geoip-lite');
      const geo = geoip.lookup(rawIp);
      if (geo) {
        countryCode = geo.country;
        country = geo.country;
        city = geo.city || city;
      } else if (rawIp === '127.0.0.1' || rawIp === '::1' || rawIp.startsWith('192.168.') || rawIp.startsWith('10.')) {
        // Localhost development default fallback
        const lang = req.headers['accept-language'] || '';
        if (lang.includes('bn') || lang.includes('BD')) {
          country = 'Bangladesh';
          countryCode = 'BD';
          city = 'Dhaka';
        } else {
          country = 'United States';
          countryCode = 'US';
          city = 'San Francisco';
        }
      }
    }

    const visitor = await prisma.visitor.upsert({
      where: {
        merchantId_visitorId: {
          merchantId,
          visitorId,
        },
      },
      create: {
        merchantId,
        visitorId,
        ipAddress: rawIp,
        country,
        countryCode,
        city,
        pageViews: 1,
        lastSeenAt: new Date(),
      },
      update: {
        ipAddress: rawIp,
        country,
        countryCode,
        city,
        pageViews: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });

    res.json({ success: true, visitor });
  } catch (error) {
    logger.error('Ping Visitor Error:', error);
    res.status(500).json({ error: 'Failed to record visitor ping.' });
  }
}
