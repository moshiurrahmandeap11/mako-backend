"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processChatMessage = processChatMessage;
exports.processChatMessageStream = processChatMessageStream;
const db_1 = require("../../config/db");
const logger_1 = require("../../utils/logger");
const chatGuards_1 = require("./guards/chatGuards");
const systemPromptBuilder_1 = require("./prompts/systemPromptBuilder");
const llmRunner_1 = require("./providers/llmRunner");
const searchKnowledge_tool_1 = require("./tools/searchKnowledge.tool");
const searchProducts_tool_1 = require("./tools/searchProducts.tool");
const webSearch_tool_1 = require("./tools/webSearch.tool");
const cartActionParser_1 = require("./utils/cartActionParser");
const chatCache_1 = require("./utils/chatCache");
async function processChatMessage(merchantId, sessionId, userMessage, botMode = "shopping", provider, customPrompt, template, imageUrl, requestDomain) {
    // Enforce strict 250 character limit on all prompts
    userMessage = (userMessage || "").trim().slice(0, 250);
    // Fetch merchant profile for branding & domain identity
    const merchant = await db_1.prisma.user.findUnique({
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
    let conversation = await db_1.prisma.conversation.findFirst({
        where: { merchantId, sessionId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!conversation) {
        conversation = await db_1.prisma.conversation.create({
            data: { merchantId, sessionId },
            include: { messages: true },
        });
    }
    const textSafe = userMessage || "";
    const isBengaliScript = /[\u0980-\u09FF]/.test(textSafe);
    const isBanglish = /\b(koto|ki|koro|tmra|apni|amader|lagbe|project|daw|ache|na|bolo|tumi|kemne|kivabe|dam|taka|bhai|vai|website|bro)\b/i.test(textSafe);
    // FAST PATH 1: Instant Gratitude Responses (<10ms)
    if ((0, chatGuards_1.isGratitude)(userMessage)) {
        let gratitudeReply = "";
        if (isBengaliScript) {
            gratitudeReply = `আপনাকে অনেক ধন্যবাদ! যেকোনো সাহায্যে আমি আছি।`;
        }
        else if (isBanglish) {
            gratitudeReply = `You are most welcome bro! Apnar ar kono sahajjo lagle bolben।`;
        }
        else {
            gratitudeReply = `You are most welcome! Let me know if you need any further assistance.`;
        }
        await db_1.prisma.message.create({
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
    if ((0, chatGuards_1.isRoleHijackingAttempt)(userMessage)) {
        let hijackReply = "";
        if (isBengaliScript) {
            hijackReply = `আমি ${merchantName}-এর অফিশিয়াল সহকারী। আমি ভূমিকা পরিবর্তন করতে পারি না। কীভাবে আমাদের সেবা বা প্রজেক্টে সাহায্য করতে পারি?`;
        }
        else if (isBanglish) {
            hijackReply = `Ami ${merchantName}-er official AI assistant hishebe kaj kori. Identity ba role change kora sombhov noy। Bolun, amader website ba services niye kivabe help korte pari?`;
        }
        else {
            hijackReply = `I am the official AI assistant dedicated exclusively to ${merchantName}. I cannot change my role or act as a personal assistant. How can I help you with our services today?`;
        }
        await db_1.prisma.message.create({
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
    if ((0, chatGuards_1.isOutOfScopeRequest)(userMessage)) {
        let declineReply = "";
        if (isBengaliScript) {
            declineReply = `আমি ${merchantName}-এর এআই সহকারী। আমি শুধুমাত্র আমাদের প্রজেক্ট, সেবা ও ওয়েবসাইট সম্পর্কিত তথ্যে সাহায্য করতে পারি।`;
        }
        else if (isBanglish) {
            declineReply = `Ami ${merchantName}-er AI assistant. Ami sudhu amader services, projects ebong company information niye help korte pari.`;
        }
        else {
            declineReply = `I am the AI assistant dedicated to ${merchantName}. I can only assist you with our services, portfolio projects, and company information.`;
        }
        await db_1.prisma.message.create({
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
    const cleanUserText = userMessage || (imageUrl ? "Analyzing attached image." : "");
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: "user",
            content: cleanUserText,
            toolCalls: imageUrl ? { imageUrl } : undefined,
        },
    });
    // FAST PATH 4: Instant High-Speed FAQ Cache Hit
    const cached = !imageUrl ? (0, chatCache_1.getCachedResponse)(merchantId, userMessage) : null;
    if (cached) {
        await db_1.prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: "assistant",
                content: cached.reply,
                tokensUsed: 5,
                toolCalls: cached.products && cached.products.length > 0
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
    let recommendedProducts = [];
    let retrievedProducts = [];
    let ragContext = "";
    const thoughts = [];
    if (isBengaliScript) {
        thoughts.push(`Analyzed user inquiry in Bengali`);
    }
    else if (isBanglish) {
        thoughts.push(`Understood user inquiry in Banglish`);
    }
    else {
        thoughts.push(`Understood user inquiry`);
    }
    if (imageUrl) {
        thoughts.push(`Analyzed attached image for visual context`);
    }
    // Perform Catalog & Knowledge RAG Search
    try {
        const ragTimeout = new Promise((resolve) => setTimeout(() => resolve([[], []]), 1200));
        let [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.race([
            Promise.all([
                (0, searchProducts_tool_1.searchProductsTool)(merchantId, userMessage || "general", undefined, 6, effectiveDomain),
                (0, searchKnowledge_tool_1.searchKnowledgeTool)(merchantId, userMessage || "general", 8, effectiveDomain),
            ]),
            ragTimeout,
        ]);
        retrievedProducts = retrievedProductsRes;
        if (retrievedProducts.length === 0) {
            retrievedProducts = await db_1.prisma.product.findMany({
                where: { merchantId },
                take: 8,
            });
        }
        if (retrievedProducts.length > 0) {
            thoughts.push(`Found matching products in store catalog (${retrievedProducts.length} items)`);
            ragContext +=
                `\n\n### Store Catalog & Available Products:\n` +
                    retrievedProducts
                        .map((p) => {
                        const optStr = p.options && Array.isArray(p.options) && p.options.length > 0
                            ? p.options
                                .map((o) => `${o.name} (${(o.values || []).join(", ")})`)
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
    }
    catch (err) {
        logger_1.logger.error("RAG Search Error:", err);
    }
    const merchantTotalProducts = await db_1.prisma.product.count({
        where: { merchantId },
    });
    const hasStoreProducts = retrievedProducts.length > 0 || merchantTotalProducts > 0;
    const systemPrompt = (0, systemPromptBuilder_1.buildSystemPrompt)(merchantName, effectiveDomain, botMode, customPrompt, template, hasStoreProducts);
    // Execute Cascading LLM Provider Runner
    const llmResult = await (0, llmRunner_1.executeLlmCascade)(merchantId, userMessage, systemPrompt + ragContext, conversation.messages, imageUrl, provider, botMode, template);
    thoughts.push(...llmResult.thoughts);
    if (llmResult.retrievedProducts?.length > 0) {
        retrievedProducts = llmResult.retrievedProducts;
    }
    let finalReply = (0, cartActionParser_1.sanitizeReplyText)(llmResult.finalReply);
    let cartAction = null;
    // Parse Cart Action tags from reply
    const parsedCart = await (0, cartActionParser_1.parseCartActionFromReply)(finalReply, merchantId, isBengaliScript, isBanglish);
    finalReply = parsedCart.cleanedReply;
    if (parsedCart.cartAction)
        cartAction = parsedCart.cartAction;
    if (parsedCart.product &&
        !recommendedProducts.some((p) => p.id === parsedCart.product.id)) {
        recommendedProducts.push(parsedCart.product);
    }
    // Fail-safe Smart Action Extractor if no tag was found
    if (!cartAction && finalReply) {
        const smartCart = await (0, cartActionParser_1.smartExtractCartAction)(finalReply, userMessage, merchantId);
        if (smartCart.cartAction)
            cartAction = smartCart.cartAction;
        if (smartCart.product &&
            !recommendedProducts.some((p) => p.id === smartCart.product.id)) {
            recommendedProducts.push(smartCart.product);
        }
    }
    finalReply = (0, cartActionParser_1.sanitizeReplyText)(finalReply);
    if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
        recommendedProducts = retrievedProducts;
    }
    let estimatedTokens = llmResult.estimatedTokens;
    if (!estimatedTokens) {
        estimatedTokens = Math.max(15, Math.ceil(((userMessage || "").length + (finalReply || "").length) / 3.6));
    }
    // Save assistant reply to database
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: "assistant",
            content: finalReply,
            tokensUsed: estimatedTokens,
            toolCalls: recommendedProducts.length > 0 || cartAction
                ? { recommendedProducts, cartAction }
                : undefined,
        },
    });
    // Store response in fast cache
    (0, chatCache_1.setCachedResponse)(merchantId, userMessage, finalReply, thoughts, recommendedProducts);
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
async function processChatMessageStream(merchantId, sessionId, userMessage, onThought, onToken, botMode = "shopping", provider, customPrompt, template, imageUrl, requestDomain) {
    userMessage = (userMessage || "").trim().slice(0, 250);
    const merchant = await db_1.prisma.user.findUnique({
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
    let conversation = await db_1.prisma.conversation.findFirst({
        where: { merchantId, sessionId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!conversation) {
        conversation = await db_1.prisma.conversation.create({
            data: { merchantId, sessionId },
            include: { messages: true },
        });
    }
    const textSafe = userMessage || "";
    const isBengaliScript = /[\u0980-\u09FF]/.test(textSafe);
    const isBanglish = /\b(koto|ki|koro|tmra|apni|amader|lagbe|project|daw|ache|na|bolo|tumi|kemne|kivabe|dam|taka|bhai|vai|website|bro)\b/i.test(textSafe);
    // Fast-path 1: Gratitude
    if ((0, chatGuards_1.isGratitude)(userMessage)) {
        let gratitudeReply = "";
        if (isBengaliScript) {
            gratitudeReply = `আপনাকে অনেক ধন্যবাদ! যেকোনো সাহায্যে আমি আছি।`;
        }
        else if (isBanglish) {
            gratitudeReply = `You are most welcome bro! Apnar ar kono sahajjo lagle bolben।`;
        }
        else {
            gratitudeReply = `You are most welcome! Let me know if you need any further assistance.`;
        }
        onToken(gratitudeReply);
        await db_1.prisma.message.create({
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
    if ((0, chatGuards_1.isRoleHijackingAttempt)(userMessage)) {
        let hijackReply = "";
        if (isBengaliScript) {
            hijackReply = `আমি ${merchantName}-এর অফিশিয়াল সহকারী। আমি ভূমিকা পরিবর্তন করতে পারি না। কীভাবে আমাদের সেবা বা প্রজেক্টে সাহায্য করতে পারি?`;
        }
        else if (isBanglish) {
            hijackReply = `Ami ${merchantName}-er official AI assistant hishebe kaj kori. Identity ba role change kora sombhov noy। Bolun, amader website ba services niye kivabe help korte pari?`;
        }
        else {
            hijackReply = `I am the official AI assistant dedicated exclusively to ${merchantName}. I cannot change my role or act as a personal assistant. How can I help you with our services today?`;
        }
        onThought(`🛡️ Security Guard: Prevented role hijacking attempt.`);
        onToken(hijackReply);
        await db_1.prisma.message.create({
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
    if ((0, chatGuards_1.isOutOfScopeRequest)(userMessage)) {
        let declineReply = "";
        if (isBengaliScript) {
            declineReply = `আমি ${merchantName}-এর এআই সহকারী। আমি শুধুমাত্র আমাদের প্রজেক্ট, সেবা ও ওয়েবসাইট সম্পর্কিত তথ্যে সাহায্য করতে পারি।`;
        }
        else if (isBanglish) {
            declineReply = `Ami ${merchantName}-er AI assistant. Ami sudhu amader services, projects ebong company information niye help korte pari.`;
        }
        else {
            declineReply = `I am the AI assistant dedicated to ${merchantName}. I can only assist you with our services, portfolio projects, and company information.`;
        }
        onThought(`🛡️ Policy Guard: Declining out-of-scope request.`);
        onToken(declineReply);
        await db_1.prisma.message.create({
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
    const cleanUserText = userMessage || (imageUrl ? "Analyzing attached image." : "");
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: "user",
            content: cleanUserText,
            toolCalls: imageUrl ? { imageUrl } : undefined,
        },
    });
    // Fast-path 4: Cached Response
    const cached = !imageUrl ? (0, chatCache_1.getCachedResponse)(merchantId, userMessage) : null;
    if (cached) {
        onThought("⚡ Instant High-Speed Cached Response (~2ms).");
        onToken(cached.reply);
        await db_1.prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: "assistant",
                content: cached.reply,
                tokensUsed: 5,
                toolCalls: cached.products && cached.products.length > 0
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
    let recommendedProducts = [];
    let retrievedProducts = [];
    let ragContext = "";
    const thoughts = [];
    const addThought = (t) => {
        thoughts.push(t);
        onThought(t);
    };
    if (isBengaliScript) {
        addThought(`Analyzed user inquiry in Bengali`);
    }
    else if (isBanglish) {
        addThought(`Understood user inquiry in Banglish`);
    }
    else {
        addThought(`Understood user inquiry`);
    }
    if (imageUrl) {
        addThought(`Analyzed attached image for visual context`);
    }
    // Perform Catalog & Knowledge RAG Search
    try {
        const ragTimeout = new Promise((resolve) => setTimeout(() => resolve([[], []]), 1200));
        let [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.race([
            Promise.all([
                (0, searchProducts_tool_1.searchProductsTool)(merchantId, userMessage || "general", undefined, 6, effectiveDomain),
                (0, searchKnowledge_tool_1.searchKnowledgeTool)(merchantId, userMessage || "general", 8),
            ]),
            ragTimeout,
        ]);
        retrievedProducts = retrievedProductsRes;
        if (retrievedProducts.length === 0) {
            retrievedProducts = await db_1.prisma.product.findMany({
                where: { merchantId },
                take: 8,
            });
        }
        if (retrievedProducts.length > 0) {
            addThought(`Found matching products in store catalog (${retrievedProducts.length} items)`);
            ragContext +=
                `\n\n### Store Catalog & Available Products:\n` +
                    retrievedProducts
                        .map((p) => {
                        const optStr = p.options && Array.isArray(p.options) && p.options.length > 0
                            ? p.options
                                .map((o) => `${o.name} (${(o.values || []).join(", ")})`)
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
        }
        else if (userMessage &&
            userMessage.trim().length > 3 &&
            !(0, chatGuards_1.isSimpleGreeting)(userMessage)) {
            addThought(`Searched real-time web information`);
            const webSearchTimeout = new Promise((resolve) => setTimeout(() => resolve([]), 1500));
            const webResults = await Promise.race([
                (0, webSearch_tool_1.webSearchTool)(userMessage, 3),
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
        if (retrievedProducts.length === 0 &&
            retrievedKnowledgeRes.length === 0 &&
            !ragContext.includes("Live Web Search Results")) {
            ragContext = `\n\n### Website Context:
Company/Website Name: ${merchantName}${effectiveDomain ? ` (${effectiveDomain})` : ""}.
Currently, no specific catalog items or knowledge base articles matched this query. Continue assisting the user based on your primary persona and website identity.`;
        }
    }
    catch (err) {
        logger_1.logger.error("RAG Search Error:", err);
    }
    const merchantTotalProducts = await db_1.prisma.product.count({
        where: { merchantId },
    });
    const hasStoreProducts = retrievedProducts.length > 0 || merchantTotalProducts > 0;
    const systemPrompt = (0, systemPromptBuilder_1.buildSystemPrompt)(merchantName, effectiveDomain, botMode, customPrompt, template, hasStoreProducts);
    // Execute Streaming LLM Cascade
    const llmResult = await (0, llmRunner_1.executeLlmCascadeStream)(merchantId, userMessage, systemPrompt + ragContext, conversation.messages, onToken, imageUrl, provider, botMode, template);
    thoughts.push(...llmResult.thoughts);
    if (llmResult.retrievedProducts?.length > 0) {
        retrievedProducts = llmResult.retrievedProducts;
    }
    let finalReply = (0, cartActionParser_1.sanitizeReplyText)(llmResult.finalReply);
    let cartAction = null;
    // Parse Cart Action tags
    const parsedCart = await (0, cartActionParser_1.parseCartActionFromReply)(finalReply, merchantId, isBengaliScript, isBanglish);
    finalReply = parsedCart.cleanedReply;
    if (parsedCart.cartAction)
        cartAction = parsedCart.cartAction;
    if (parsedCart.product &&
        !recommendedProducts.some((p) => p.id === parsedCart.product.id)) {
        recommendedProducts.push(parsedCart.product);
    }
    // Fail-safe Smart Action Extractor if no tag was found
    if (!cartAction && finalReply) {
        const smartCart = await (0, cartActionParser_1.smartExtractCartAction)(finalReply, userMessage, merchantId);
        if (smartCart.cartAction)
            cartAction = smartCart.cartAction;
        if (smartCart.product &&
            !recommendedProducts.some((p) => p.id === smartCart.product.id)) {
            recommendedProducts.push(smartCart.product);
        }
    }
    finalReply = (0, cartActionParser_1.sanitizeReplyText)(finalReply);
    if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
        recommendedProducts = retrievedProducts;
    }
    let estimatedTokens = llmResult.estimatedTokens;
    if (!estimatedTokens) {
        estimatedTokens = Math.max(15, Math.ceil(((userMessage || "").length + (finalReply || "").length) / 3.6));
    }
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: "assistant",
            content: finalReply,
            tokensUsed: estimatedTokens,
            toolCalls: recommendedProducts.length > 0 || cartAction
                ? { recommendedProducts, cartAction }
                : undefined,
        },
    });
    (0, chatCache_1.setCachedResponse)(merchantId, userMessage, finalReply, thoughts, recommendedProducts);
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
