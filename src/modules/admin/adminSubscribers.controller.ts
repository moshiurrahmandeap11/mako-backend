import { Response } from 'express';
import { prisma } from '../../config/db';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { logger } from '../../utils/logger';

/**
 * GET /api/admin/subscribers
 * Supports backend pagination (?page=1&limit=20), email search (?search=foo),
 * and status filtering (?status=ALL | SUBSCRIBED | UNSUBSCRIBED).
 */
export async function getAdminSubscribers(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const search = req.query.search ? String(req.query.search).trim() : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
    const source = req.query.source ? String(req.query.source).trim() : 'ALL';

    const where: any = {};

    if (search) {
      where.email = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (status !== 'ALL') {
      where.status = status;
    }

    if (source !== 'ALL') {
      where.source = source;
    }

    // Parallel query for count, subscribers, and stats
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalCount, subscribers, totalActive, totalUnsubscribed, totalToday] = await Promise.all([
      (prisma as any).newsletterSubscriber.count({ where }),
      (prisma as any).newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).newsletterSubscriber.count({ where: { status: 'SUBSCRIBED' } }),
      (prisma as any).newsletterSubscriber.count({ where: { status: 'UNSUBSCRIBED' } }),
      (prisma as any).newsletterSubscriber.count({
        where: {
          createdAt: { gte: startOfToday },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    res.json({
      success: true,
      subscribers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      stats: {
        totalSubscribers: totalActive + totalUnsubscribed,
        activeSubscribers: totalActive,
        unsubscribedCount: totalUnsubscribed,
        todayCount: totalToday,
      },
    });
  } catch (error) {
    logger.error('Admin getSubscribers error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscribers list.' });
  }
}

/**
 * PATCH /api/admin/subscribers/:subscriberId/status
 * Toggle subscriber between SUBSCRIBED and UNSUBSCRIBED.
 */
export async function toggleSubscriberStatus(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { subscriberId } = req.params;
    const { status } = req.body;

    const validStatuses = ['SUBSCRIBED', 'UNSUBSCRIBED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: 'Status must be SUBSCRIBED or UNSUBSCRIBED.' });
      return;
    }

    const updated = await (prisma as any).newsletterSubscriber.update({
      where: { id: subscriberId },
      data: { status },
    });

    res.json({ success: true, subscriber: updated });
  } catch (error) {
    logger.error('Admin toggleSubscriberStatus error:', error);
    res.status(500).json({ success: false, error: 'Failed to update subscriber status.' });
  }
}

/**
 * DELETE /api/admin/subscribers/:subscriberId
 * Permanently remove subscriber from database.
 */
export async function deleteSubscriber(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { subscriberId } = req.params;
    await (prisma as any).newsletterSubscriber.delete({
      where: { id: subscriberId },
    });
    res.json({ success: true, message: 'Subscriber deleted successfully.' });
  } catch (error) {
    logger.error('Admin deleteSubscriber error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete subscriber.' });
  }
}
