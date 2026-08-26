import { Response } from "express";
import { prisma } from "../../config/db";
import {
  DashboardAuthRequest,
  clearPlanTierCache,
} from "../../middleware/authenticateDashboard";
import { logger } from "../../utils/logger";

export async function getAdminMerchants(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const tier = req.query.tier ? String(req.query.tier).toUpperCase() : "ALL";
    const page = parseInt(String(req.query.page || "1"), 10);
    const limit = parseInt(String(req.query.limit || "50"), 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (
      tier !== "ALL" &&
      ["FREE", "STARTER", "PRO", "ENTERPRISE"].includes(tier)
    ) {
      where.planTier = tier;
    }

    const [totalCount, merchants] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          planTier: true,
          allowedDomains: true,
          extraCredits: true,
          rolloverCredits: true,
          createdAt: true,
          emailVerified: true,
          apiKeys: {
            select: {
              id: true,
              name: true,
              keyPrefix: true,
              template: true,
              isActive: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              apiKeys: true,
              conversations: true,
              products: true,
              knowledgeChunks: true,
            },
          },
        },
      }),
    ]);

    const merchantsWithStats = await Promise.all(
      merchants.map(async (m) => {
        const messagesCount = await prisma.message.count({
          where: { conversation: { merchantId: m.id } },
        });
        const tokenSum = await prisma.message.aggregate({
          where: { conversation: { merchantId: m.id } },
          _sum: { tokensUsed: true },
        });
        let tokens = tokenSum._sum.tokensUsed || 0;
        if (tokens === 0 && messagesCount > 0) {
          tokens = messagesCount * 180;
        }
        return {
          ...m,
          totalMessages: messagesCount,
          totalTokensUsed: tokens,
        };
      }),
    );

    res.json({
      merchants: merchantsWithStats,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    logger.error("Admin Merchants Error:", error);
    res.status(500).json({ error: "Failed to fetch merchants list." });
  }
}

export async function getAdminMerchantDetails(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = String(req.params.merchantId);
    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
      include: {
        apiKeys: true,
        widgetConfig: true,
        _count: {
          select: {
            conversations: true,
            products: true,
            knowledgeChunks: true,
            visitors: true,
          },
        },
      },
    });

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found." });
      return;
    }

    const messagesCount = await prisma.message.count({
      where: { conversation: { merchantId } },
    });
    const tokenSum = await prisma.message.aggregate({
      where: { conversation: { merchantId } },
      _sum: { tokensUsed: true },
    });

    res.json({
      merchant: {
        ...merchant,
        totalMessages: messagesCount,
        totalTokensUsed:
          tokenSum._sum && tokenSum._sum.tokensUsed
            ? tokenSum._sum.tokensUsed
            : messagesCount * 180,
      },
    });
  } catch (error) {
    logger.error("Admin Merchant Details Error:", error);
    res.status(500).json({ error: "Failed to fetch merchant details." });
  }
}

export async function updateMerchantPlan(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = String(req.params.merchantId);
    const { planTier } = req.body;

    const validTiers = ["FREE", "STARTER", "PRO", "ENTERPRISE"];
    if (!validTiers.includes(planTier)) {
      res
        .status(400)
        .json({
          error: `Invalid plan tier. Must be one of ${validTiers.join(", ")}`,
        });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: merchantId },
      data: { planTier },
    });

    clearPlanTierCache(merchantId);
    logger.info(`[Admin] Updated merchant ${merchantId} plan to ${planTier}`);

    res.json({
      success: true,
      message: `Plan updated to ${planTier} successfully.`,
      merchant: updated,
    });
  } catch (error) {
    logger.error("Admin Update Plan Error:", error);
    res.status(500).json({ error: "Failed to update merchant plan." });
  }
}

export async function updateMerchantCredits(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = String(req.params.merchantId);
    const { extraCredits } = req.body;

    const creditsNum = parseInt(String(extraCredits), 10);
    if (isNaN(creditsNum) || creditsNum < 0) {
      res
        .status(400)
        .json({ error: "Invalid credits amount. Must be a positive integer." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: merchantId },
      data: { extraCredits: creditsNum },
    });

    clearPlanTierCache(merchantId);
    logger.info(
      `[Admin] Updated merchant ${merchantId} extra credits to ${creditsNum}`,
    );

    res.json({
      success: true,
      message: `Extra credits set to ${creditsNum} successfully.`,
      merchant: updated,
    });
  } catch (error) {
    logger.error("Admin Update Credits Error:", error);
    res.status(500).json({ error: "Failed to update extra credits." });
  }
}

export async function toggleMerchantRole(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = String(req.params.merchantId);
    const { role } = req.body;

    if (!["MERCHANT", "ADMIN"].includes(role)) {
      res
        .status(400)
        .json({ error: "Invalid role. Must be MERCHANT or ADMIN." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: merchantId },
      data: { role },
    });

    clearPlanTierCache(merchantId);
    logger.info(`[Admin] Updated merchant ${merchantId} role to ${role}`);

    res.json({
      success: true,
      message: `User role updated to ${role} successfully.`,
      merchant: updated,
    });
  } catch (error) {
    logger.error("Admin Toggle Role Error:", error);
    res.status(500).json({ error: "Failed to update user role." });
  }
}
