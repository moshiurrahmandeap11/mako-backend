import { Response } from 'express';
import { prisma } from '../../config/db';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { logger } from '../../utils/logger';

export async function getAdminBugReports(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
    const where: any = {};
    if (status !== 'ALL') {
      where.status = status;
    }

    const bugs = await (prisma as any).bugReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ bugs });
  } catch (error) {
    logger.error('Admin Bug Reports Error:', error);
    res.status(500).json({ error: 'Failed to fetch bug reports.' });
  }
}

export async function updateBugStatus(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { bugId } = req.params;
    const { status } = req.body;

    const validStatuses = ['OPEN', 'UNDER_REVIEW', 'FIXED', 'DISMISSED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of ${validStatuses.join(', ')}` });
      return;
    }

    const updated = await (prisma as any).bugReport.update({
      where: { id: bugId },
      data: { status },
    });

    res.json({ success: true, bug: updated });
  } catch (error) {
    logger.error('Admin Update Bug Status Error:', error);
    res.status(500).json({ error: 'Failed to update bug status.' });
  }
}

export async function deleteBugReport(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { bugId } = req.params;
    await (prisma as any).bugReport.delete({ where: { id: bugId } });
    res.json({ success: true, message: 'Bug report deleted successfully.' });
  } catch (error) {
    logger.error('Admin Delete Bug Error:', error);
    res.status(500).json({ error: 'Failed to delete bug report.' });
  }
}
