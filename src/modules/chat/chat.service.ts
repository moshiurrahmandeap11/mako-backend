import { prisma } from "../../config/db";
import { logger } from "../../utils/logger";
import {
  isGratitude,
  isOutOfScopeRequest,
  isRoleHijackingAttempt,
  isSimpleGreeting,
} from "./guards/chatGuards";
import { buildSystemPrompt } from "./prompts/systemPromptBuilder";
import {
  executeLlmCascade,
  executeLlmCascadeStream,
} from "./providers/llmRunner";
import { searchKnowledgeTool } from "./tools/searchKnowledge.tool";
import { searchProductsTool } from "./tools/searchProducts.tool";
import { webSearchTool } from "./tools/webSearch.tool";
import {
  parseCartActionFromReply,
  sanitizeReplyText,
  smartExtractCartAction,
} from "./utils/cartActionParser";
import { getCachedResponse, setCachedResponse } from "./utils/chatCache";

export interface ChatResponse {
  sessionId: string;
  reply: string;
  products: any[];
  cartAction?: any;
  thoughts: string[];
}

export async function processChatMessage(
  merchantId: string,
  sessionId: string,
  userMessage: string,
  botMode: string = "shopping",
  provider?: string,
  customPrompt?: string,
  template?: string,
  imageUrl?: string,
  requestDomain?: string,
) {
  // Enforce strict 250 character limit on all prompts
  userMessage = (userMessage || "").trim().slice(0, 250);

  // Fetch merchant profile for branding & domain identity
  const merchant = await prisma.user.findUnique({
    where: { id: merchantId },
    select: { name: true, allowedDomains: true, widgetConfig: true },
  });

  // Dynamically resolve clean business identity
  let merchantName = "our company";
  const effectiveDomain = requestDomain || merchant?.allowedDomains?.[0] || "";

  if (effectiveDomain) {
    const rawDomain = effectiveDomain
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^www\./, "");
    if (rawDomain && rawDomain !== "localhost" && rawDomain !== "127.0.0.1") {
      const parts = rawDomain.split(".")[0].split(/[-_]/);
      merchantName = parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
  }

  if ((!merchantName || merchantName === "our company") && merchant?.name) {
    merchantName = merchant.name;
  }

  // 1. Get or create conversation record
  let conversation = await prisma.conversation.findFirst({
    where: { merchantId, sessionId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { merchantId, sessionId },
      include: { messages: true },
    });
  }

  const textSafe = userMessage || "";
  const isBengaliScript = /[\u0980-\u09FF]/.test(textSafe);
  const isBanglish =
    /\b(koto|ki|koro|tmra|apni|amader|lagbe|project|daw|ache|na|bolo|tumi|kemne|kivabe|dam|taka|bhai|vai|website|bro)\b/i.test(
      textSafe,
    );

  // FAST PATH 1: Instant Gratitude Responses (<10ms)
  if (isGratitude(userMessage)) {
    let gratitudeReply = "";
    if (isBengaliScript) {
      gratitudeReply = `আপনাকে অনেক ধন্যবাদ! যেকোনো সাহায্যে আমি আছি।`;
    } else if (isBanglish) {
      gratitudeReply = `You are most welcome bro! Apnar ar kono sahajjo lagle bolben।`;
    } else {
      gratitudeReply = `You are most welcome! Let me know if you need any further assistance.`;
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: gratitudeReply,
      },
    });

    return {
      sessionId,
      reply: gratitudeReply,
      thoughts: [],
      cartAction: undefined,
      recommendedProducts: [],
      tokensUsed: 8,
    };
  }

  // FAST PATH 2: Anti-Jailbreak / Role Hijacking Guard (<10ms, 0 token waste)
  if (isRoleHijackingAttempt(userMessage)) {
    let hijackReply = "";
    if (isBengaliScript) {
      hijackReply = `আমি ${merchantName}-এর অফিশিয়াল সহকারী। আমি ভূমিকা পরিবর্তন করতে পারি না। কীভাবে আমাদের সেবা বা প্রজেক্টে সাহায্য করতে পারি?`;
    } else if (isBanglish) {
      hijackReply = `Ami ${merchantName}-er official AI assistant hishebe kaj kori. Identity ba role change kora sombhov noy। Bolun, amader website ba services niye kivabe help korte pari?`;
    } else {
      hijackReply = `I am the official AI assistant dedicated exclusively to ${merchantName}. I cannot change my role or act as a personal assistant. How can I help you with our services today?`;
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: hijackReply,
      },
    });

    return {
      sessionId,
      reply: hijackReply,
      thoughts: [
        `🛡️ Security Guard: Prevented role hijacking / prompt injection attempt.`,
      ],
      cartAction: undefined,
      recommendedProducts: [],
      tokensUsed: 15,
    };
  }

  // FAST PATH 3: Out of Scope Guard (<10ms, 0 token waste)
  if (isOutOfScopeRequest(userMessage)) {
    let declineReply = "";
    if (isBengaliScript) {
      declineReply = `আমি ${merchantName}-এর এআই সহকারী। আমি শুধুমাত্র আমাদের প্রজেক্ট, সেবা ও ওয়েবসাইট সম্পর্কিত তথ্যে সাহায্য করতে পারি।`;
    } else if (isBanglish) {
      declineReply = `Ami ${merchantName}-er AI assistant. Ami sudhu amader services, projects ebong company information niye help korte pari.`;
    } else {
      declineReply = `I am the AI assistant dedicated to ${merchantName}. I can only assist you with our services, portfolio projects, and company information.`;
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: declineReply,
      },
    });

    return {
      sessionId,
      reply: declineReply,
      thoughts: [
        `🛡️ Policy Guard: Declining out-of-scope coding/homework request.`,
      ],
      cartAction: undefined,
      recommendedProducts: [],
      tokensUsed: 12,
    };
  }

  // Save user message to database
  const cleanUserText =
    userMessage || (imageUrl ? "Analyzing attached image." : "");
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: cleanUserText,
      toolCalls: imageUrl ? { imageUrl } : undefined,
    },
  });

  // FAST PATH 4: Instant High-Speed FAQ Cache Hit
  const cached = !imageUrl ? getCachedResponse(merchantId, userMessage) : null;
  if (cached) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: cached.reply,
        tokensUsed: 5,
        toolCalls:
          cached.products && cached.products.length > 0
            ? { recommendedProducts: cached.products }
            : undefined,
      },
    });

    return {
      sessionId,
      reply: cached.reply,
      products: cached.products || [],
      cartAction: null,
      thoughts: [
        "⚡ Instant High-Speed Cached Response (~2ms).",
        ...cached.thoughts,
      ],
    };
  }

  let recommendedProducts: any[] = [];
  let retrievedProducts: any[] = [];
  let ragContext = "";
  const thoughts: string[] = [];

  if (isBengaliScript) {
    thoughts.push(`Analyzed user inquiry in Bengali`);
  } else if (isBanglish) {
    thoughts.push(`Understood user inquiry in Banglish`);
  } else {
    thoughts.push(`Understood user inquiry`);
  }

  if (imageUrl) {
    thoughts.push(`Analyzed attached image for visual context`);
  }

  // Perform Catalog & Knowledge RAG Search
  try {
    const ragTimeout = new Promise<[any[], any[]]>((resolve) =>
      setTimeout(() => resolve([[], []]), 1200),
    );

    let [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.race([
      Promise.all([
        searchProductsTool(
          merchantId,
          userMessage || "general",
          undefined,
          6,
          effectiveDomain,
        ),
        searchKnowledgeTool(
          merchantId,
          userMessage || "general",
          8,
          effectiveDomain,
        ),
      ]),
      ragTimeout,
    ]);

    retrievedProducts = retrievedProductsRes;

    if (retrievedProducts.length === 0) {
      retrievedProducts = await prisma.product.findMany({
        where: { merchantId },
        take: 8,
      });
    }

    if (retrievedProducts.length > 0) {
      thoughts.push(
        `Found matching products in store catalog (${retrievedProducts.length} items)`,
      );
      ragContext +=
        `\n\n### Store Catalog & Available Products:\n` +
        retrievedProducts
          .map((p) => {
            const optStr =
              p.options && Array.isArray(p.options) && p.options.length > 0
                ? (p.options as any[])
                    .map(
                      (o: any) => `${o.name} (${(o.values || []).join(", ")})`,
                    )
                    .join("; ")
                : "None";
            return `- **[${p.title}](${p.productUrl || `/products/${p.id}`})** | ID: \`${p.id}\` | Price: **$${p.price} ${p.currency || "USD"}** | Options: ${optStr} | Category: ${p.category || "General"} | Description: ${p.description || p.title}`;
          })
          .join("\n") +
        `\n\nInstructions: Use the catalog items above to recommend items, verify options/sizes, or provide details. Include product page links where appropriate.`;
    }

    if (retrievedKnowledgeRes.length > 0) {
      thoughts.push(`Retrieved relevant website knowledge and policies`);
      ragContext +=
        `\n\n### Website Knowledge Base (Scraped Content):\n` +
        retrievedKnowledgeRes
          .map((k) => `[Source: ${k.url}]\n${k.content}`)
          .join("\n\n") +
        `\n\nInstructions: Use the scraped website knowledge above to answer the user's questions about company info, portfolio, policies, FAQs, or general site services.`;
    }

    if (retrievedProducts.length === 0 && retrievedKnowledgeRes.length === 0) {
      ragContext = `\n\n### Website Context:
Company/Website Name: ${merchantName}${effectiveDomain ? ` (${effectiveDomain})` : ""}.
Currently, no specific catalog items or knowledge base articles matched this query. Continue assisting the user based on your primary persona and website identity.`;
    }
  } catch (err) {
    logger.error("RAG Search Error:", err);
  }

  const hasStoreProducts = retrievedProducts.length > 0;
  const systemPrompt = buildSystemPrompt(
    merchantName,
    effectiveDomain,
    botMode,
    customPrompt,
    template,
    hasStoreProducts,
  );

  // Execute Cascading LLM Provider Runner
  const llmResult = await executeLlmCascade(
    merchantId,
    userMessage,
    systemPrompt + ragContext,
    conversation.messages,
    imageUrl,
    provider,
    botMode,
    template,
  );

  thoughts.push(...llmResult.thoughts);
  if (llmResult.retrievedProducts?.length > 0) {
    retrievedProducts = llmResult.retrievedProducts;
  }

  let finalReply = sanitizeReplyText(llmResult.finalReply);
  let cartAction: any = null;

  // Parse Cart Action tags from reply
  const parsedCart = await parseCartActionFromReply(
    finalReply,
    merchantId,
    isBengaliScript,
    isBanglish,
  );
  finalReply = parsedCart.cleanedReply;
  if (parsedCart.cartAction) cartAction = parsedCart.cartAction;
  if (
    parsedCart.product &&
    !recommendedProducts.some((p) => p.id === parsedCart.product.id)
  ) {
    recommendedProducts.push(parsedCart.product);
  }

  // Fail-safe Smart Action Extractor if no tag was found
  if (!cartAction && finalReply) {
    const smartCart = await smartExtractCartAction(
      finalReply,
      userMessage,
      merchantId,
    );
    if (smartCart.cartAction) cartAction = smartCart.cartAction;
    if (
      smartCart.product &&
      !recommendedProducts.some((p) => p.id === smartCart.product.id)
    ) {
      recommendedProducts.push(smartCart.product);
    }
  }

  finalReply = sanitizeReplyText(finalReply);

  if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
    recommendedProducts = retrievedProducts;
  }

  let estimatedTokens = llmResult.estimatedTokens;
  if (!estimatedTokens) {
    estimatedTokens = Math.max(
      15,
      Math.ceil(((userMessage || "").length + (finalReply || "").length) / 3.6),
    );
  }

  // Save assistant reply to database
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: finalReply,
      tokensUsed: estimatedTokens,
      toolCalls:
        recommendedProducts.length > 0 || cartAction
          ? { recommendedProducts, cartAction }
          : undefined,
    },
  });

  // Store response in fast cache
  setCachedResponse(
    merchantId,
    userMessage,
    finalReply,
    thoughts,
    recommendedProducts,
  );

  thoughts.push("✨ Formulated optimal response.");

  return {
    sessionId,
    reply: finalReply,
    products: recommendedProducts.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      title: p.title,
      price: p.price,
      currency: p.currency || "USD",
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      inStock: p.inStock,
      options: p.options,
      variants: p.variants,
    })),
    cartAction,
    thoughts: [],
  };
}

/**
 * Real-time SSE Streaming Chat Processor (ChatGPT / Claude style live tokens & thoughts).
 */
export async function processChatMessageStream(
  merchantId: string,
  sessionId: string,
  userMessage: string,
  onThought: (thought: string) => void,
  onToken: (token: string) => void,
  botMode: string = "shopping",
  provider?: string,
  customPrompt?: string,
  template?: string,
  imageUrl?: string,
  requestDomain?: string,
): Promise<ChatResponse> {
  userMessage = (userMessage || "").trim().slice(0, 250);

  const merchant = await prisma.user.findUnique({
    where: { id: merchantId },
    select: { name: true, allowedDomains: true, widgetConfig: true },
  });

  let merchantName = "our company";
  const effectiveDomain = requestDomain || merchant?.allowedDomains?.[0] || "";

  if (effectiveDomain) {
    const rawDomain = effectiveDomain
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/^www\./, "");
    if (rawDomain && rawDomain !== "localhost" && rawDomain !== "127.0.0.1") {
      const parts = rawDomain.split(".")[0].split(/[-_]/);
      merchantName = parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
  }

  if ((!merchantName || merchantName === "our company") && merchant?.name) {
    merchantName = merchant.name;
  }

  let conversation = await prisma.conversation.findFirst({
    where: { merchantId, sessionId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { merchantId, sessionId },
      include: { messages: true },
    });
  }

  const textSafe = userMessage || "";
  const isBengaliScript = /[\u0980-\u09FF]/.test(textSafe);
  const isBanglish =
    /\b(koto|ki|koro|tmra|apni|amader|lagbe|project|daw|ache|na|bolo|tumi|kemne|kivabe|dam|taka|bhai|vai|website|bro)\b/i.test(
      textSafe,
    );

  // Fast-path 1: Gratitude
  if (isGratitude(userMessage)) {
    let gratitudeReply = "";
    if (isBengaliScript) {
      gratitudeReply = `আপনাকে অনেক ধন্যবাদ! যেকোনো সাহায্যে আমি আছি।`;
    } else if (isBanglish) {
      gratitudeReply = `You are most welcome bro! Apnar ar kono sahajjo lagle bolben।`;
    } else {
      gratitudeReply = `You are most welcome! Let me know if you need any further assistance.`;
    }

    onToken(gratitudeReply);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: gratitudeReply,
      },
    });

    return {
      sessionId,
      reply: gratitudeReply,
      thoughts: [],
      cartAction: undefined,
      products: [],
    };
  }

  // Fast-path 2: Role Hijacking Guard
  if (isRoleHijackingAttempt(userMessage)) {
    let hijackReply = "";
    if (isBengaliScript) {
      hijackReply = `আমি ${merchantName}-এর অফিশিয়াল সহকারী। আমি ভূমিকা পরিবর্তন করতে পারি না। কীভাবে আমাদের সেবা বা প্রজেক্টে সাহায্য করতে পারি?`;
    } else if (isBanglish) {
      hijackReply = `Ami ${merchantName}-er official AI assistant hishebe kaj kori. Identity ba role change kora sombhov noy। Bolun, amader website ba services niye kivabe help korte pari?`;
    } else {
      hijackReply = `I am the official AI assistant dedicated exclusively to ${merchantName}. I cannot change my role or act as a personal assistant. How can I help you with our services today?`;
    }

    onThought(`🛡️ Security Guard: Prevented role hijacking attempt.`);
    onToken(hijackReply);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: hijackReply,
      },
    });

    return {
      sessionId,
      reply: hijackReply,
      thoughts: [`🛡️ Security Guard: Prevented role hijacking attempt.`],
      cartAction: undefined,
      products: [],
    };
  }

  // Fast-path 3: Out of Scope Guard
  if (isOutOfScopeRequest(userMessage)) {
    let declineReply = "";
    if (isBengaliScript) {
      declineReply = `আমি ${merchantName}-এর এআই সহকারী। আমি শুধুমাত্র আমাদের প্রজেক্ট, সেবা ও ওয়েবসাইট সম্পর্কিত তথ্যে সাহায্য করতে পারি।`;
    } else if (isBanglish) {
      declineReply = `Ami ${merchantName}-er AI assistant. Ami sudhu amader services, projects ebong company information niye help korte pari.`;
    } else {
      declineReply = `I am the AI assistant dedicated to ${merchantName}. I can only assist you with our services, portfolio projects, and company information.`;
    }

    onThought(`🛡️ Policy Guard: Declining out-of-scope request.`);
    onToken(declineReply);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: declineReply,
      },
    });

    return {
      sessionId,
      reply: declineReply,
      thoughts: [`🛡️ Policy Guard: Declining out-of-scope request.`],
      cartAction: undefined,
      products: [],
    };
  }

  // Save user message to database
  const cleanUserText =
    userMessage || (imageUrl ? "Analyzing attached image." : "");
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: cleanUserText,
      toolCalls: imageUrl ? { imageUrl } : undefined,
    },
  });

  // Fast-path 4: Cached Response
  const cached = !imageUrl ? getCachedResponse(merchantId, userMessage) : null;
  if (cached) {
    onThought("⚡ Instant High-Speed Cached Response (~2ms).");
    onToken(cached.reply);

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: cached.reply,
        tokensUsed: 5,
        toolCalls:
          cached.products && cached.products.length > 0
            ? { recommendedProducts: cached.products }
            : undefined,
      },
    });

    return {
      sessionId,
      reply: cached.reply,
      products: cached.products || [],
      cartAction: null,
      thoughts: [
        "⚡ Instant High-Speed Cached Response (~2ms).",
        ...cached.thoughts,
      ],
    };
  }

  let recommendedProducts: any[] = [];
  let retrievedProducts: any[] = [];
  let ragContext = "";
  const thoughts: string[] = [];

  const addThought = (t: string) => {
    thoughts.push(t);
    onThought(t);
  };

  if (isBengaliScript) {
    addThought(`Analyzed user inquiry in Bengali`);
  } else if (isBanglish) {
    addThought(`Understood user inquiry in Banglish`);
  } else {
    addThought(`Understood user inquiry`);
  }

  if (imageUrl) {
    addThought(`Analyzed attached image for visual context`);
  }

  // Perform Catalog & Knowledge RAG Search
  try {
    const ragTimeout = new Promise<[any[], any[]]>((resolve) =>
      setTimeout(() => resolve([[], []]), 1200),
    );

    let [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.race([
      Promise.all([
        searchProductsTool(
          merchantId,
          userMessage || "general",
          undefined,
          6,
          effectiveDomain,
        ),
        searchKnowledgeTool(merchantId, userMessage || "general", 8),
      ]),
      ragTimeout,
    ]);

    retrievedProducts = retrievedProductsRes;

    if (retrievedProducts.length === 0) {
      retrievedProducts = await prisma.product.findMany({
        where: { merchantId },
        take: 8,
      });
    }

    if (retrievedProducts.length > 0) {
      addThought(
        `Found matching products in store catalog (${retrievedProducts.length} items)`,
      );
      ragContext +=
        `\n\n### Store Catalog & Available Products:\n` +
        retrievedProducts
          .map((p) => {
            const optStr =
              p.options && Array.isArray(p.options) && p.options.length > 0
                ? (p.options as any[])
                    .map(
                      (o: any) => `${o.name} (${(o.values || []).join(", ")})`,
                    )
                    .join("; ")
                : "None";
            return `- **[${p.title}](${p.productUrl || `/products/${p.id}`})** | ID: \`${p.id}\` | Price: **$${p.price} ${p.currency || "USD"}** | Options: ${optStr} | Category: ${p.category || "General"} | Description: ${p.description || p.title}`;
          })
          .join("\n") +
        `\n\nInstructions: Use the catalog items above to recommend items, verify options/sizes, or provide details. Include product page links where appropriate.`;
    }

    if (retrievedKnowledgeRes.length > 0) {
      addThought(`Retrieved relevant website knowledge and policies`);
      ragContext +=
        `\n\n### Website Knowledge Base (Scraped Content):\n` +
        retrievedKnowledgeRes
          .map((k) => `[Source: ${k.url}]\n${k.content}`)
          .join("\n\n") +
        `\n\nInstructions: Use the scraped website knowledge above to answer the user's questions about company info, portfolio, policies, FAQs, or general site services.`;
    } else if (
      userMessage &&
      userMessage.trim().length > 3 &&
      !isSimpleGreeting(userMessage)
    ) {
      addThought(`Searched real-time web information`);
      const webSearchTimeout = new Promise<any[]>((resolve) =>
        setTimeout(() => resolve([]), 1500),
      );
      const webResults = await Promise.race([
        webSearchTool(userMessage, 3),
        webSearchTimeout,
      ]);
      if (webResults.length > 0) {
        addThought(`Incorporated latest web insights`);
        ragContext +=
          `\n\n### Live Web Search Results (Real-Time Internet Search):\n` +
          webResults
            .map((w) => `[Source: ${w.title}](${w.url})\n${w.snippet}`)
            .join("\n\n") +
          `\n\nInstructions: Use the live web search results above to answer the user's real-time internet query with up-to-date information. Always include source links where appropriate.`;
      }
    }

    if (
      retrievedProducts.length === 0 &&
      retrievedKnowledgeRes.length === 0 &&
      !ragContext.includes("Live Web Search Results")
    ) {
      ragContext = `\n\n### Website Context:
Company/Website Name: ${merchantName}${effectiveDomain ? ` (${effectiveDomain})` : ""}.
Currently, no specific catalog items or knowledge base articles matched this query. Continue assisting the user based on your primary persona and website identity.`;
    }
  } catch (err) {
    logger.error("RAG Search Error:", err);
  }

  const hasStoreProducts = retrievedProducts.length > 0;
  const systemPrompt = buildSystemPrompt(
    merchantName,
    effectiveDomain,
    botMode,
    customPrompt,
    template,
    hasStoreProducts,
  );

  // Execute Streaming LLM Cascade
  const llmResult = await executeLlmCascadeStream(
    merchantId,
    userMessage,
    systemPrompt + ragContext,
    conversation.messages,
    onToken,
    imageUrl,
    provider,
    botMode,
    template,
  );

  thoughts.push(...llmResult.thoughts);
  if (llmResult.retrievedProducts?.length > 0) {
    retrievedProducts = llmResult.retrievedProducts;
  }

  let finalReply = sanitizeReplyText(llmResult.finalReply);
  let cartAction: any = null;

  // Parse Cart Action tags
  const parsedCart = await parseCartActionFromReply(
    finalReply,
    merchantId,
    isBengaliScript,
    isBanglish,
  );
  finalReply = parsedCart.cleanedReply;
  if (parsedCart.cartAction) cartAction = parsedCart.cartAction;
  if (
    parsedCart.product &&
    !recommendedProducts.some((p) => p.id === parsedCart.product.id)
  ) {
    recommendedProducts.push(parsedCart.product);
  }

  // Fail-safe Smart Action Extractor if no tag was found
  if (!cartAction && finalReply) {
    const smartCart = await smartExtractCartAction(
      finalReply,
      userMessage,
      merchantId,
    );
    if (smartCart.cartAction) cartAction = smartCart.cartAction;
    if (
      smartCart.product &&
      !recommendedProducts.some((p) => p.id === smartCart.product.id)
    ) {
      recommendedProducts.push(smartCart.product);
    }
  }

  finalReply = sanitizeReplyText(finalReply);

  if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
    recommendedProducts = retrievedProducts;
  }

  let estimatedTokens = llmResult.estimatedTokens;
  if (!estimatedTokens) {
    estimatedTokens = Math.max(
      15,
      Math.ceil(((userMessage || "").length + (finalReply || "").length) / 3.6),
    );
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: finalReply,
      tokensUsed: estimatedTokens,
      toolCalls:
        recommendedProducts.length > 0 || cartAction
          ? { recommendedProducts, cartAction }
          : undefined,
    },
  });

  setCachedResponse(
    merchantId,
    userMessage,
    finalReply,
    thoughts,
    recommendedProducts,
  );

  return {
    sessionId,
    reply: finalReply,
    products: recommendedProducts.map((p) => ({
      id: p.id,
      externalId: p.externalId,
      title: p.title,
      price: p.price,
      currency: p.currency || "USD",
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      inStock: p.inStock,
      options: p.options,
      variants: p.variants,
    })),
    cartAction,
    thoughts,
  };
}
