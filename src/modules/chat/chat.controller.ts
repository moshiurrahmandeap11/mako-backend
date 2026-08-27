import crypto from "crypto";
import { Response } from "express";
import { prisma } from "../../config/db";
import { WidgetAuthRequest } from "../../middleware/authenticateWidget";
import { logger } from "../../utils/logger";
import { processChatMessage, processChatMessageStream } from "./chat.service";

export async function createSession(
  req: WidgetAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const sessionId = `sess_${crypto.randomBytes(16).toString("hex")}`;

    await prisma.conversation.create({
      data: {
        merchantId,
        sessionId,
      },
    });

    res.json({ sessionId });
  } catch (error) {
    logger.error("Create Widget Session Error:", error);
    res.status(500).json({ error: "Failed to create widget session." });
  }
}

export async function getWidgetConfigPublic(
  req: WidgetAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const planTier = req.merchant?.planTier || "FREE";
    const isFree = planTier === "FREE";

    let config = await prisma.widgetConfig.findUnique({
      where: { merchantId },
    });

    if (!config) {
      config = {
        id: "",
        merchantId,
        primaryColor: "#1DBF73",
        headerBgColor: "#FFFFFF",
        headerTextColor: "#222325",
        launcherBgColor: "#1DBF73",
        launcherIconColor: "#FFFFFF",
        greetingMessage: "Hi! How can I help you today?",
        botName: "AI Assistant",
        position: "bottom-right",
        addToCartEnabled: true,
        suggestionChips: [
          "Show me your portfolio projects",
          "What services do you provide?",
          "How can I contact you?",
        ],
        botAvatarUrl: null,
      };
    }

    res.json({
      primaryColor: config?.primaryColor || "#1DBF73",
      headerBgColor: config?.headerBgColor || "#FFFFFF",
      headerTextColor: config?.headerTextColor || "#222325",
      launcherBgColor: config?.launcherBgColor || "#1DBF73",
      launcherIconColor: config?.launcherIconColor || "#FFFFFF",
      greetingMessage:
        config?.greetingMessage || "Hi! How can I help you today?",
      botName: config?.botName || "AI Assistant",
      position: config?.position || "bottom-right",
      addToCartEnabled:
        config?.addToCartEnabled !== undefined ? config.addToCartEnabled : true,
      suggestionChips: (config as any)?.suggestionChips || [
        "Show me your portfolio projects",
        "What services do you provide?",
        "How can I contact you?",
      ],
      botAvatarUrl: (config as any)?.botAvatarUrl || null,
      hideBranding: planTier === "PRO" || planTier === "ENTERPRISE",
      eventBridgeEnabled: planTier === "PRO" || planTier === "ENTERPRISE",
    });
  } catch (error) {
    logger.error("Get Public Widget Config Error:", error);
    res.status(500).json({ error: "Failed to fetch widget configuration." });
  }
}

export async function chat(
  req: WidgetAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { sessionId, message, botMode, provider, imageUrl, stream } =
      req.body;

    if ((!message || typeof message !== "string") && !imageUrl) {
      res.status(400).json({ error: "Message or imageUrl field is required." });
      return;
    }

    const rawMessage = (message || "").trim();
    if (rawMessage.length > 250) {
      res.status(400).json({
        error: "Prompt length exceeds maximum allowed limit of 250 characters.",
      });
      return;
    }

    const effectiveSessionId =
      sessionId || `sess_${crypto.randomBytes(16).toString("hex")}`;
    const isStream =
      stream === true ||
      req.query.stream === "true" ||
      req.headers.accept?.includes("text/event-stream");

    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const sendEvent = (type: string, data: any) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // 0. Maintenance Mode Check
      try {
        const maintSetting = await (prisma as any).platformSetting.findUnique({
          where: { key: "maintenanceMode" },
        });
        if (maintSetting && Boolean(maintSetting.value) === true) {
          const msgSetting = await (prisma as any).platformSetting.findUnique({
            where: { key: "maintenanceMessage" },
          });
          const customMessage =
            msgSetting?.value ||
            "Labto AI is currently undergoing scheduled platform maintenance. AI chat responses are temporarily paused. Please check back shortly.";

          sendEvent("token", { token: `⚠️ ${customMessage}` });
          sendEvent("done", {
            text: `⚠️ ${customMessage}`,
            suggestedQuestions: [],
            products: [],
            cartAction: null,
          });
          res.end();
          return;
        }
      } catch (maintCheckErr) {
        // Fallback
      }

      try {
        const response = await processChatMessageStream(
          merchantId,
          effectiveSessionId,
          rawMessage.slice(0, 250),
          (thought) => sendEvent("thought", { thought }),
          (token) => sendEvent("token", { token }),
          botMode,
          provider,
          req.apiKeyRecord?.systemPrompt,
          req.apiKeyRecord?.template,
          imageUrl,
          req.detectedDomain,
        );

        sendEvent("done", response);
        res.end();
      } catch (streamErr: any) {
        logger.error("Stream processing error:", streamErr);
        sendEvent("error", {
          error: streamErr?.message || "Stream processing failed",
        });
        res.end();
      }
      return;
    }

    // 0. Maintenance Mode Check for Non-Stream
    try {
      const maintSetting = await (prisma as any).platformSetting.findUnique({
        where: { key: "maintenanceMode" },
      });
      if (maintSetting && Boolean(maintSetting.value) === true) {
        const msgSetting = await (prisma as any).platformSetting.findUnique({
          where: { key: "maintenanceMessage" },
        });
        const customMessage =
          msgSetting?.value ||
          "Labto AI is currently undergoing scheduled platform maintenance. AI chat responses are temporarily paused. Please check back shortly.";

        res.json({
          text: `⚠️ ${customMessage}`,
          suggestedQuestions: [],
          products: [],
          cartAction: null,
        });
        return;
      }
    } catch (maintCheckErr) {
      // Fallback
    }

    const response = await processChatMessage(
      merchantId,
      effectiveSessionId,
      rawMessage.slice(0, 250),
      botMode,
      provider,
      req.apiKeyRecord?.systemPrompt,
      req.apiKeyRecord?.template,
      imageUrl,
      req.detectedDomain,
    );

    res.json(response);
  } catch (error) {
    logger.error("Widget Chat API Error:", error);
    res.status(500).json({ error: "Failed to process chat message." });
  }
}

export async function pingVisitor(
  req: WidgetAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const { visitorId } = req.body;

    if (!visitorId) {
      res.status(400).json({ error: "visitorId is required." });
      return;
    }

    const rawIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "127.0.0.1";
    let country = "United States";
    let countryCode = "US";
    let city = "New York";

    // 1. Cloudflare IP country header
    const cfCountry = req.headers["cf-ipcountry"] as string;
    if (cfCountry && cfCountry.length === 2 && cfCountry !== "XX") {
      countryCode = cfCountry.toUpperCase();
      country =
        countryCode === "BD"
          ? "Bangladesh"
          : countryCode === "US"
            ? "United States"
            : countryCode === "GB"
              ? "United Kingdom"
              : countryCode;
    } else {
      // 2. geoip-lite lookup
      const geoip = await import("geoip-lite");
      const geo = geoip.lookup(rawIp);
      if (geo) {
        countryCode = geo.country;
        country = geo.country;
        city = geo.city || city;
      } else if (
        rawIp === "127.0.0.1" ||
        rawIp === "::1" ||
        rawIp.startsWith("192.168.") ||
        rawIp.startsWith("10.")
      ) {
        // Localhost development default fallback
        const lang = req.headers["accept-language"] || "";
        if (lang.includes("bn") || lang.includes("BD")) {
          country = "Bangladesh";
          countryCode = "BD";
          city = "Dhaka";
        } else {
          country = "United States";
          countryCode = "US";
          city = "San Francisco";
        }
      }
    }

    const visitor = await prisma.visitor.upsert({
      where: {
        merchantId_visitorId: {
          merchantId,
          visitorId,
        },
      },
      create: {
        merchantId,
        visitorId,
        ipAddress: rawIp,
        country,
        countryCode,
        city,
        pageViews: 1,
        lastSeenAt: new Date(),
      },
      update: {
        ipAddress: rawIp,
        country,
        countryCode,
        city,
        pageViews: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });

    res.json({ success: true, visitor });
  } catch (error) {
    logger.error("Ping Visitor Error:", error);
    res.status(500).json({ error: "Failed to record visitor ping." });
  }
}

export async function getChatHistory(
  req: WidgetAuthRequest,
  res: Response,
): Promise<void> {
  try {
    const merchantId = req.merchant?.id!;
    const sessionId = (req.query.sessionId as string) || "";

    if (!sessionId) {
      res.json({ messages: [] });
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { merchantId, sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation || !conversation.messages) {
      res.json({ messages: [] });
      return;
    }

    const formattedMessages = conversation.messages.map((m) => {
      let products = undefined;
      let imageUrl = undefined;
      if (m.toolCalls && typeof m.toolCalls === "object") {
        if ((m.toolCalls as any).recommendedProducts) {
          products = (m.toolCalls as any).recommendedProducts;
        }
        if ((m.toolCalls as any).imageUrl) {
          imageUrl = (m.toolCalls as any).imageUrl;
        }
      }

      let cleanText = m.content || "";
      if (cleanText.includes("data:image/")) {
        const imgMatch = cleanText.match(
          /!\[Uploaded Image\]\((data:image\/[^)]+)\)/,
        );
        if (imgMatch && imgMatch[1]) {
          if (!imageUrl) imageUrl = imgMatch[1];
          cleanText = cleanText
            .replace(/!\[Uploaded Image\]\(data:image\/[^)]+\)/g, "")
            .trim();
        }
        cleanText = cleanText
          .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "")
          .trim();
      }

      return {
        id: m.id,
        sender: m.role === "user" ? "user" : "bot",
        text: cleanText,
        imageUrl,
        products,
        time: new Date(m.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    });

    res.json({ messages: formattedMessages });
  } catch (error) {
    logger.error("Get Chat History Error:", error);
    res.status(500).json({ error: "Failed to fetch chat history." });
  }
}
