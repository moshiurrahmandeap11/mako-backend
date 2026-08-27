import { Response } from "express";
import { prisma } from "../../config/db";
import { DashboardAuthRequest } from "../../middleware/authenticateDashboard";
import { keyRotator } from "../../utils/keyRotator";
import { logger } from "../../utils/logger";

export async function getAdminTokenUsage(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const [totalTokensAgg, topConsumers, totalMessages] = await Promise.all([
      prisma.message.aggregate({ _sum: { tokensUsed: true } }),
      prisma.user.findMany({
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          planTier: true,
          _count: { select: { conversations: true } },
        },
      }),
      prisma.message.count(),
    ]);

    const consumersWithStats = await Promise.all(
      topConsumers.map(async (u) => {
        const msgCount = await prisma.message.count({
          where: { conversation: { merchantId: u.id } },
        });
        const tokenSum = await prisma.message.aggregate({
          where: { conversation: { merchantId: u.id } },
          _sum: { tokensUsed: true },
        });
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          planTier: u.planTier,
          messageCount: msgCount,
          tokensUsed:
            tokenSum._sum && tokenSum._sum.tokensUsed
              ? tokenSum._sum.tokensUsed
              : msgCount * 180,
        };
      }),
    );

    consumersWithStats.sort((a, b) => b.tokensUsed - a.tokensUsed);

    const totalTokens =
      totalTokensAgg._sum && totalTokensAgg._sum.tokensUsed
        ? totalTokensAgg._sum.tokensUsed
        : totalMessages * 180;

    res.json({
      totalTokens,
      totalMessages,
      topConsumers: consumersWithStats,
      estimatedCostUsd: Number(((totalTokens / 1_000_000) * 0.15).toFixed(4)),
    });
  } catch (error) {
    logger.error("Admin Token Usage Error:", error);
    res.status(500).json({ error: "Failed to fetch token usage metrics." });
  }
}

export async function getAdminKeyPoolsHealth(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const health = keyRotator.getPoolHealth();
    res.json({
      ...health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Admin Key Pools Health Error:", error);
    res.status(500).json({ error: "Failed to fetch key pools status." });
  }
}
