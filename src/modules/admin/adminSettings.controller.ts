import { Response } from "express";
import { prisma } from "../../config/db";
import { DashboardAuthRequest } from "../../middleware/authenticateDashboard";
import { sendMaintenanceBroadcastEmail } from "../../utils/email";
import { logger } from "../../utils/logger";

export async function getAdminPlatformSettings(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const settings = await (prisma as any).platformSetting.findMany();
    const settingsMap: Record<string, any> = {};
    settings.forEach((s: any) => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      settings: {
        maintenanceMode: settingsMap.maintenanceMode || false,
        maintenanceMessage:
          settingsMap.maintenanceMessage ||
          "Labto AI is undergoing scheduled maintenance.",
        announcementBanner: settingsMap.announcementBanner || "",
        allowNewSignups: settingsMap.allowNewSignups !== false,
        defaultSignupCredits: settingsMap.defaultSignupCredits || 1500,
        ...settingsMap,
      },
    });
  } catch (error) {
    logger.error("Admin Platform Settings Error:", error);
    res.status(500).json({ error: "Failed to fetch platform settings." });
  }
}

export async function updateAdminPlatformSetting(
  req: DashboardAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { key, value } = req.body;

    if (!key) {
      res.status(400).json({ error: "Setting key is required." });
      return;
    }

    const updated = await (prisma as any).platformSetting.upsert({
      where: { key: String(key) },
      create: { key: String(key), value: value !== undefined ? value : true },
      update: { value: value !== undefined ? value : true },
    });

    logger.info(`[Admin] Updated platform setting '${key}'`);

    // If maintenance mode was just enabled, broadcast notification email to all registered merchants
    if (key === "maintenanceMode" && Boolean(value) === true) {
      (async () => {
        try {
          const msgSetting = await (prisma as any).platformSetting.findUnique({
            where: { key: "maintenanceMessage" },
          });
          const customMessage =
            msgSetting?.value ||
            "Labto AI is undergoing scheduled maintenance. We will be back online shortly.";

          const merchants = await prisma.user.findMany({
            select: { email: true, name: true },
          });

          logger.info(
            `[Maintenance] Broadcasting maintenance notice email to ${merchants.length} merchants...`,
          );

          for (const m of merchants) {
            if (m.email) {
              sendMaintenanceBroadcastEmail({
                to: m.email,
                name: m.name || undefined,
                message: String(customMessage),
              }).catch((err) => {
                logger.warn(
                  `Failed to send maintenance email to ${m.email}:`,
                  err?.message || err,
                );
              });
            }
          }
        } catch (broadcastErr) {
          logger.error(
            "[Maintenance] Error broadcasting maintenance emails:",
            broadcastErr,
          );
        }
      })();
    }

    res.json({ success: true, setting: updated });
  } catch (error) {
    logger.error("Admin Update Platform Setting Error:", error);
    res.status(500).json({ error: "Failed to update platform setting." });
  }
}

export async function getPublicPlatformSettings(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const settings = await (prisma as any).platformSetting.findMany();
    const settingsMap: Record<string, any> = {};
    settings.forEach((s: any) => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      maintenanceMode: Boolean(settingsMap.maintenanceMode),
      maintenanceMessage:
        settingsMap.maintenanceMessage ||
        "Labto AI is undergoing scheduled maintenance. We will be back online shortly.",
      announcementBanner: settingsMap.announcementBanner || "",
      defaultSignupCredits: settingsMap.defaultSignupCredits || 1500,
    });
  } catch (error) {
    res.json({
      maintenanceMode: false,
      maintenanceMessage: "",
      announcementBanner: "",
      defaultSignupCredits: 1500,
    });
  }
}
