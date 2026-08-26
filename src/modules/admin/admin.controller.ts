import { Response } from "express";
import { prisma } from "../../config/db";
import { DashboardAuthRequest } from "../../middleware/authenticateDashboard";
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
      pendingInquiriesCount,
      openBugsCount,
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
      prisma.message.aggregate({ _sum: { tokensUsed: true } }),
      (prisma as any).contactInquiry ? (prisma as any).contactInquiry.count({ where: { status: 'NEW' } }).catch(() => 0) : 0,
      (prisma as any).bugReport ? (prisma as any).bugReport.count({ where: { status: 'OPEN' } }).catch(() => 0) : 0,
    ]);

    let totalTokens = tokenAgg._sum.tokensUsed || 0;
    if (totalTokens === 0 && totalMessages > 0) {
      totalTokens = totalMessages * 180;
    }

    const estimatedMrr = (starterTiers * 2) + (proTiers * 5) + (enterpriseTiers * 50);

    const metricsData = {
      totalMerchants,
      totalApiKeys,
      totalConversations,
      totalMessages,
      totalKnowledgeChunks,
      totalTokensEstimated: totalTokens,
      estimatedMrr,
      pendingInquiriesCount,
      openBugsCount,
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
    res.status(500).json({ error: "Failed to fetch admin overview statistics." });
  }
}

export async function getAdminSubscriptions(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const [freeCount, starterCount, proCount, enterpriseCount, paidUsers] = await Promise.all([
      prisma.user.count({ where: { planTier: "FREE" } }),
      prisma.user.count({ where: { planTier: "STARTER" } }),
      prisma.user.count({ where: { planTier: "PRO" } }),
      prisma.user.count({ where: { planTier: "ENTERPRISE" } }),
      prisma.user.findMany({
        where: { planTier: { not: "FREE" } },
        select: {
          id: true,
          name: true,
          email: true,
          planTier: true,
          createdAt: true,
          stripeSubscriptionId: true,
          subscriptionStatus: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPaid = starterCount + proCount + enterpriseCount;
    const estimatedMrr = (starterCount * 2) + (proCount * 5) + (enterpriseCount * 50);

    res.json({
      totalPaid,
      estimatedMrr,
      breakdown: {
        FREE: freeCount,
        STARTER: starterCount,
        PRO: proCount,
        ENTERPRISE: enterpriseCount,
      },
      paidUsers,
    });
  } catch (error) {
    logger.error("Admin Subscriptions Error:", error);
    res.status(500).json({ error: "Failed to fetch subscriptions." });
  }
}
