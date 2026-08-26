import { Response } from 'express';
import { prisma } from '../../config/db';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';
import { logger } from '../../utils/logger';

export async function getAdminInquiries(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
    const where: any = {};
    if (status !== 'ALL') {
      where.status = status;
    }

    const inquiries = await (prisma as any).contactInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ inquiries });
  } catch (error) {
    logger.error('Admin Inquiries Error:', error);
    res.status(500).json({ error: 'Failed to fetch contact inquiries.' });
  }
}

export async function updateInquiryStatus(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { inquiryId } = req.params;
    const { status } = req.body;

    const validStatuses = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of ${validStatuses.join(', ')}` });
      return;
    }

    const updated = await (prisma as any).contactInquiry.update({
      where: { id: inquiryId },
      data: { status },
    });

    res.json({ success: true, inquiry: updated });
  } catch (error) {
    logger.error('Admin Update Inquiry Status Error:', error);
    res.status(500).json({ error: 'Failed to update inquiry status.' });
  }
}

export async function deleteInquiry(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const { inquiryId } = req.params;
    await (prisma as any).contactInquiry.delete({ where: { id: inquiryId } });
    res.json({ success: true, message: 'Inquiry deleted successfully.' });
  } catch (error) {
    logger.error('Admin Delete Inquiry Error:', error);
    res.status(500).json({ error: 'Failed to delete inquiry.' });
  }
}
