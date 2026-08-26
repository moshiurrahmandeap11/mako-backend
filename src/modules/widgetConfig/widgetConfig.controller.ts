import { Response } from 'express';
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { uploadImageToCloudinary } from '../../services/cloudinary.service';

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
          botAvatarUrl: null,
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
      botAvatarUrl,
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
        botAvatarUrl: botAvatarUrl !== undefined ? botAvatarUrl : null,
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
        ...(botAvatarUrl !== undefined && { botAvatarUrl }),
      },
    });

    res.json({ message: 'Widget configuration updated successfully', config });
  } catch (error) {
    logger.error('Update Widget Config Error:', error);
    res.status(500).json({ error: 'Failed to update widget config.' });
  }
}

export async function uploadAvatar(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { image, url } = req.body;

    let avatarUrl = url;
    if (image) {
      avatarUrl = await uploadImageToCloudinary(image, 'mako_avatars');
    }

    if (!avatarUrl) {
      res.status(400).json({ error: 'Image data (base64) or URL is required.' });
      return;
    }

    const config = await prisma.widgetConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        botAvatarUrl: avatarUrl,
      },
      update: {
        botAvatarUrl: avatarUrl,
      },
    });

    res.json({ message: 'Avatar uploaded successfully', avatarUrl, config });
  } catch (error: any) {
    logger.error('Upload Avatar Error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload avatar image.' });
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
      botAvatarUrl: null,
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
