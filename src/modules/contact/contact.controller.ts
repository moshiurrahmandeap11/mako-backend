import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { logger } from '../../utils/logger';

export async function submitContactInquiry(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      res.status(400).json({ error: 'Name, email, and message are required fields.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const inquiry = await (prisma as any).contactInquiry.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        subject: subject ? String(subject).trim() : 'General Inquiry',
        message: String(message).trim(),
        status: 'NEW',
      },
    });

    logger.info(`[Contact] New inquiry received from ${inquiry.email} (ID: ${inquiry.id})`);

    res.status(201).json({
      success: true,
      message: 'Thank you! Your message has been received. Our team will get back to you shortly.',
      inquiryId: inquiry.id,
    });
  } catch (error) {
    logger.error('Submit Contact Inquiry Error:', error);
    res.status(500).json({ error: 'Failed to submit your message. Please try again later.' });
  }
}
