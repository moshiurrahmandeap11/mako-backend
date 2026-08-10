import { Response } from 'express';
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';

export async function getSummary(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;

    const [totalProducts, totalConversations, totalApiKeys, totalMessages] = await Promise.all([
      prisma.product.count({ where: { merchantId } }),
      prisma.conversation.count({ where: { merchantId } }),
      prisma.apiKey.count({ where: { merchantId, isActive: true } }),
      prisma.message.count({ where: { conversation: { merchantId } } }),
    ]);

    res.json({
      summary: {
        totalProducts,
        totalConversations,
        totalApiKeys,
        totalMessages,
        planTier: req.merchant?.planTier,
      },
    });
  } catch (error) {
    logger.error('Get Analytics Summary Error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary.' });
  }
}

export async function listConversations(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '15', 10);
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: { merchantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.conversation.count({ where: { merchantId } }),
    ]);

    res.json({
      conversations,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('List Conversations Error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation logs.' });
  }
}
