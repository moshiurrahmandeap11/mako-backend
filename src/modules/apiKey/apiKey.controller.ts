import { Response } from 'express';
import { prisma } from '../../config/db';
import { generateApiKey } from '../../utils/apiKeyGenerator';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';

const API_KEY_LIMITS: Record<string, number> = {
  FREE: 1,
  STARTER: 2,
  PRO: 4,
  ENTERPRISE: Infinity,
};

export async function createKey(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const planTier = req.merchant?.planTier || 'FREE';
    const { name, template, systemPrompt, allowedDomains } = req.body;

    const limit = API_KEY_LIMITS[planTier] !== undefined ? API_KEY_LIMITS[planTier] : 1;
    const existingCount = await prisma.apiKey.count({
      where: { merchantId, isActive: true },
    });

    if (existingCount >= limit) {
      res.status(400).json({
        error: `Your ${planTier} plan allows up to ${limit} active API key${limit > 1 ? 's' : ''}. Please upgrade your plan to create more keys.`,
      });
      return;
    }

    const { fullKey, keyPrefix, hashedKey } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        merchantId,
        keyPrefix,
        hashedKey,
        isActive: true,
        name: name || 'My Chatbot',
        template: template || 'Customer Support',
        systemPrompt: systemPrompt || '',
        allowedDomains: Array.isArray(allowedDomains) ? allowedDomains : [],
      },
    });

    res.status(201).json({
      message: 'API Key generated successfully. Save this key safely — it will not be shown again.',
      apiKey: {
        id: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
        fullKey, // Return unhashed key only once!
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error) {
    logger.error('API Key Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate API Key.' });
  }
}

export async function listKeys(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    const keys = await prisma.apiKey.findMany({
      where: { merchantId },
      select: {
        id: true,
        keyPrefix: true,
        isActive: true,
        name: true,
        template: true,
        systemPrompt: true,
        allowedDomains: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ keys });
  } catch (error) {
    logger.error('List API Keys Error:', error);
    res.status(500).json({ error: 'Failed to fetch API keys.' });
  }
}

export async function revokeKey(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const keyId = req.params.id as string;

    const existingKey = await prisma.apiKey.findFirst({
      where: { id: keyId, merchantId },
    });

    if (!existingKey) {
      res.status(404).json({ error: 'API key not found.' });
      return;
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    res.json({ message: 'API key revoked successfully.' });
  } catch (error) {
    logger.error('Revoke API Key Error:', error);
    res.status(500).json({ error: 'Failed to revoke API Key.' });
  }
}

export async function deleteKey(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const keyId = req.params.id as string;

    const existingKey = await prisma.apiKey.findFirst({
      where: { id: keyId, merchantId },
    });

    if (!existingKey) {
      res.status(404).json({ error: 'API key not found.' });
      return;
    }

    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    res.json({ message: 'API key deleted successfully.' });
  } catch (error) {
    logger.error('Delete API Key Error:', error);
    res.status(500).json({ error: 'Failed to delete API Key.' });
  }
}

