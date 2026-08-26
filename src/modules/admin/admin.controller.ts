import { Response } from "express";
import { prisma } from "../../config/db";
import {
  DashboardAuthRequest,
  clearPlanTierCache,
} from "../../middleware/authenticateDashboard";
import { logger } from "../../utils/logger";

export async function getAdminOverview(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const [
      totalMerchants,
      totalApiKeys,
      totalConversations,
      totalMessages,
      totalKnowledgeChunks,
      freeTiers,
      starterTiers,
      proTiers,
      enterpriseTiers,
      recentMerchants,
      tokenAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.apiKey.count({ where: { isActive: true } }),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.knowledgeChunk.count(),
      prisma.user.count({ where: { planTier: "FREE" } }),
      prisma.user.count({ where: { planTier: "STARTER" } }),
      prisma.user.count({ where: { planTier: "PRO" } }),
      prisma.user.count({ where: { planTier: "ENTERPRISE" } }),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          planTier: true,
          createdAt: true,
        },
      }),
      prisma.message.aggregate({
        _sum: { tokensUsed: true },
      }),
    ]);

    // Calculate token metrics (fallback estimation: ~3.5 chars per token if tokensUsed is 0)
    let totalTokens = tokenAgg._sum.tokensUsed || 0;
    if (totalTokens === 0 && totalMessages > 0) {
      totalTokens = totalMessages * 180; // realistic average tokens per turn
    }

    const metricsData = {
      totalMerchants,
      totalApiKeys,
      totalConversations,
      totalMessages,
      totalKnowledgeChunks,
      totalTokensEstimated: totalTokens,
      tierBreakdown: {
        FREE: freeTiers,
        STARTER: starterTiers,
        PRO: proTiers,
        ENTERPRISE: enterpriseTiers,
      },
    };

    res.json({
      metrics: metricsData,
      overview: metricsData,
      recentMerchants,
    });
  } catch (error) {
    logger.error("Admin Overview Error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch admin overview statistics." });
  }
}

export async function getAdminMerchants(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchants = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planTier: true,
        allowedDomains: true,
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
    });

    // Fetch message and token counts per merchant
    const merchantStats = await Promise.all(
      merchants.map(async (m) => {
        const messagesCount = await prisma.message.count({
          where: {
            conversation: {
              merchantId: m.id,
            },
          },
        });

        const tokenSum = await prisma.message.aggregate({
          where: {
            conversation: {
              merchantId: m.id,
            },
          },
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

    res.json({ merchants: merchantStats });
  } catch (error) {
    logger.error("Admin Merchants Error:", error);
    res.status(500).json({ error: "Failed to fetch merchant client list." });
  }
}

export async function updateMerchantPlan(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = String(req.params.merchantId);
    const { planTier, role } = req.body;

    if (!merchantId || merchantId === "undefined") {
      res.status(400).json({ error: "Merchant ID is required." });
      return;
    }

    const updateData: any = {};
    if (planTier) updateData.planTier = planTier;
    if (role) updateData.role = role;

    const updated = await prisma.user.update({
      where: { id: merchantId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        planTier: true,
      },
    });

    clearPlanTierCache(merchantId);

    res.json({ success: true, merchant: updated });
  } catch (error) {
    logger.error("Update Merchant Plan Error:", error);
    res.status(500).json({ error: "Failed to update merchant plan." });
  }
}
