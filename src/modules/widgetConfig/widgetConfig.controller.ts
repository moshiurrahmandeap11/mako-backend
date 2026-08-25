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
          primaryColor: '#1DBF73',
          headerBgColor: '#FFFFFF',
          headerTextColor: '#222325',
          launcherBgColor: '#1DBF73',
          launcherIconColor: '#FFFFFF',
          greetingMessage: 'Hi! How can I help you today?',
          botName: 'AI Assistant',
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

    const {
      primaryColor,
      headerBgColor,
      headerTextColor,
      launcherBgColor,
      launcherIconColor,
      greetingMessage,
      botName,
      position,
      addToCartEnabled,
      suggestionChips,
    } = req.body;

    const config = await prisma.widgetConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        primaryColor: primaryColor || '#1DBF73',
        headerBgColor: headerBgColor || '#FFFFFF',
        headerTextColor: headerTextColor || '#222325',
        launcherBgColor: launcherBgColor || '#1DBF73',
        launcherIconColor: launcherIconColor || '#FFFFFF',
        greetingMessage: greetingMessage || 'Hi! How can I help you today?',
        botName: botName || 'AI Assistant',
        position: position || 'bottom-right',
        addToCartEnabled: addToCartEnabled !== undefined ? Boolean(addToCartEnabled) : true,
        suggestionChips: suggestionChips !== undefined ? suggestionChips : ["Show me your portfolio projects", "What services do you provide?", "How can I contact you?"],
      },
      update: {
        ...(primaryColor !== undefined && { primaryColor }),
        ...(headerBgColor !== undefined && { headerBgColor }),
        ...(headerTextColor !== undefined && { headerTextColor }),
        ...(launcherBgColor !== undefined && { launcherBgColor }),
        ...(launcherIconColor !== undefined && { launcherIconColor }),
        ...(greetingMessage !== undefined && { greetingMessage }),
        ...(botName !== undefined && { botName }),
        ...(position !== undefined && { position }),
        ...(addToCartEnabled !== undefined && { addToCartEnabled: Boolean(addToCartEnabled) }),
        ...(suggestionChips !== undefined && { suggestionChips }),
      },
    });

    res.json({ message: 'Widget configuration updated successfully', config });
  } catch (error) {
    logger.error('Update Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to update widget config.' });
  }
}

export async function resetConfig(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    const defaultConfig = {
      primaryColor: '#1DBF73',
      headerBgColor: '#FFFFFF',
      headerTextColor: '#222325',
      launcherBgColor: '#1DBF73',
      launcherIconColor: '#FFFFFF',
      greetingMessage: 'Hi! How can I help you shop today?',
      botName: 'AI Assistant',
      position: 'bottom-right',
      addToCartEnabled: true,
      suggestionChips: ["Show me your portfolio projects", "What services do you provide?", "How can I contact you?"],
    };

    const config = await prisma.widgetConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        ...defaultConfig,
      },
      update: defaultConfig,
    });

    res.json({ message: 'Widget configuration reset to default settings', config });
  } catch (error) {
    logger.error('Reset Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to reset widget config.' });
  }
}
