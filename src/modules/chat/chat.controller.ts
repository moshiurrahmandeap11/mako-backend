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
      primaryColor: isFree ? '#111111' : config.primaryColor,
      greetingMessage: isFree ? 'Hi! How can I help you shop today?' : config.greetingMessage,
      botName: isFree ? 'Shop Assistant' : config.botName,
      position: isFree ? 'bottom-right' : config.position,
      addToCartEnabled: isFree ? true : config.addToCartEnabled,
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
    const { sessionId, message, botMode, provider } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message field is required.' });
      return;
    }

    const effectiveSessionId = sessionId || `sess_${crypto.randomBytes(16).toString('hex')}`;

    const response = await processChatMessage(
      merchantId,
      effectiveSessionId,
      message.trim(),
      botMode,
      provider,
      req.apiKeyRecord?.systemPrompt,
      req.apiKeyRecord?.template
    );

    res.json(response);
  } catch (error) {
    logger.error('Widget Chat API Error:', error);
    res.status(500).json({ error: 'Failed to process chat message.' });
  }
}
