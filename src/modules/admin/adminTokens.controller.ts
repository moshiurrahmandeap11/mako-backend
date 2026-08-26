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
    const pools: any = (keyRotator as any).pools || {};

    const formatPool = (provider: string) => {
      const p = pools[provider] || [];
      return {
        provider,
        totalKeys: p.length,
        activeKeys: p.filter((k: any) => !k.isRateLimited).length,
        rateLimitedKeys: p.filter((k: any) => k.isRateLimited).length,
        keys: p.map((k: any, idx: number) => ({
          index: idx + 1,
          keyPrefix: k.key
            ? `${k.key.slice(0, 7)}...${k.key.slice(-4)}`
            : "N/A",
          isRateLimited: Boolean(k.isRateLimited),
          errorCount: k.errorCount || 0,
          rateLimitExpiresInSec: k.rateLimitReset
            ? Math.max(0, Math.round((k.rateLimitReset - Date.now()) / 1000))
            : 0,
        })),
      };
    };

    res.json({
      groq: formatPool("groq"),
      openrouter: formatPool("openrouter"),
      gemini: formatPool("gemini"),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Admin Key Pools Health Error:", error);
    res.status(500).json({ error: "Failed to fetch key pools status." });
  }
}
