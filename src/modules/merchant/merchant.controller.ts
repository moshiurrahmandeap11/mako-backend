import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { DashboardAuthRequest } from '../../middleware/authenticateDashboard';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    const existingMerchant = await prisma.user.findUnique({ where: { email } });
    if (existingMerchant) {
      res.status(409).json({ error: 'A merchant account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const merchant = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        allowedDomains: [],
        widgetConfig: {
          create: {
            primaryColor: '#111111',
            greetingMessage: 'Hi! How can I help you shop today?',
            botName: 'Shop Assistant',
            position: 'bottom-right',
            addToCartEnabled: true,
          },
        },
      },
      include: {
        widgetConfig: true,
      },
    });

    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Registration successful',
      token,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        allowedDomains: merchant.allowedDomains,
        planTier: merchant.planTier,
        widgetConfig: merchant.widgetConfig,
      },
    });
  } catch (error) {
    logger.error('Merchant Registration Error:', error);
    res.status(500).json({ error: 'Failed to register merchant account.' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const merchant = await prisma.user.findUnique({
      where: { email },
      include: { widgetConfig: true },
    });

    if (!merchant) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!merchant.passwordHash) {
      res.status(401).json({ error: 'This account is set up with social authentication. Please log in with Google or GitHub.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, merchant.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      token,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        allowedDomains: merchant.allowedDomains,
        planTier: merchant.planTier,
        widgetConfig: merchant.widgetConfig,
      },
    });
  } catch (error) {
    logger.error('Merchant Login Error:', error);
    res.status(500).json({ error: 'Failed to authenticate merchant.' });
  }
}

export async function me(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id;

    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        name: true,
        email: true,
        allowedDomains: true,
        planTier: true,
        createdAt: true,
        widgetConfig: true,
      },
    });

    if (!merchant) {
      res.status(404).json({ error: 'Merchant not found.' });
      return;
    }

    res.json({ merchant });
  } catch (error) {
    logger.error('Get Merchant Profile Error:', error);
    res.status(500).json({ error: 'Failed to fetch merchant profile.' });
  }
}

export async function updateDomains(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id;
    const planTier = req.merchant?.planTier || 'FREE';
    const { allowedDomains } = req.body;

    if (!Array.isArray(allowedDomains)) {
      res.status(400).json({ error: 'allowedDomains must be an array of domain strings.' });
      return;
    }

    const sanitizedDomains = allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);

    const domainLimits: Record<string, number> = {
      FREE: 1,
      STARTER: 2,
      PRO: 5,
      ENTERPRISE: Infinity,
    };
    const limit = domainLimits[planTier] !== undefined ? domainLimits[planTier] : 1;

    if (sanitizedDomains.length > limit) {
      res.status(400).json({
        error: `Your ${planTier} plan allows whitelisting up to ${limit} domains. Please upgrade to add more domains.`
      });
      return;
    }

    const updatedMerchant = await prisma.user.update({
      where: { id: merchantId },
      data: { allowedDomains: sanitizedDomains },
      select: { id: true, allowedDomains: true },
    });

    res.json({
      message: 'Allowed domains updated successfully',
      allowedDomains: updatedMerchant.allowedDomains,
    });
  } catch (error) {
    logger.error('Update Domains Error:', error);
    res.status(500).json({ error: 'Failed to update allowed domains.' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
}

export async function scrapeUrl(req: DashboardAuthRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: 'Target URL is required.' });
      return;
    }

    const { scrapeWebsite } = await import('../../services/scraper.service');
    const result = await scrapeWebsite(url, merchantId);

    res.json({
      message: 'Website scraped and catalog indexed successfully!',
      result,
    });
  } catch (error: any) {
    logger.error('Scrape URL Error:', error);
    res.status(500).json({ error: error.message || 'Failed to scrape website.' });
  }
}
