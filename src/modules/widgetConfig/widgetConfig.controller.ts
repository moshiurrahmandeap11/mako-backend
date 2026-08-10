import { Response } from 'express';
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';

export async function getConfig(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    let config = await prisma.widgetConfig.findUnique({ where: { merchantId } });

    if (!config) {
      config = await prisma.widgetConfig.create({
        data: {
          merchantId,
          primaryColor: '#111111',
          greetingMessage: 'Hi! How can I help you shop today?',
          botName: 'Shop Assistant',
          position: 'bottom-right',
          addToCartEnabled: true,
        },
      });
    }

    res.json({ config });
  } catch (error) {
    logger.error('Get Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to fetch widget config.' });
  }
}

export async function updateConfig(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const planTier = req.merchant?.planTier || 'FREE';

    if (planTier === 'FREE') {
      res.status(403).json({
        error: 'Customizing widget configurations and styling requires a STARTER or PRO plan. Please upgrade your subscription.'
      });
      return;
    }

    const { primaryColor, greetingMessage, botName, position, addToCartEnabled } = req.body;

    const config = await prisma.widgetConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        primaryColor: primaryColor || '#111111',
        greetingMessage: greetingMessage || 'Hi! How can I help you shop today?',
        botName: botName || 'Shop Assistant',
        position: position || 'bottom-right',
        addToCartEnabled: addToCartEnabled !== undefined ? Boolean(addToCartEnabled) : true,
      },
      update: {
        ...(primaryColor !== undefined && { primaryColor }),
        ...(greetingMessage !== undefined && { greetingMessage }),
        ...(botName !== undefined && { botName }),
        ...(position !== undefined && { position }),
        ...(addToCartEnabled !== undefined && { addToCartEnabled: Boolean(addToCartEnabled) }),
      },
    });

    res.json({ message: 'Widget configuration updated successfully', config });
  } catch (error) {
    logger.error('Update Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to update widget config.' });
  }
}
