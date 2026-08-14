"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processChatMessage = processChatMessage;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../config/db");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const searchProducts_tool_1 = require("./tools/searchProducts.tool");
const searchKnowledge_tool_1 = require("./tools/searchKnowledge.tool");
const addToCart_tool_1 = require("./tools/addToCart.tool");
const anthropic = env_1.env.ANTHROPIC_API_KEY ? new sdk_1.default({ apiKey: env_1.env.ANTHROPIC_API_KEY }) : null;
const groq = env_1.env.GROQ_API_KEY
    ? new openai_1.default({
        apiKey: env_1.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
    })
    : null;
const openrouter = env_1.env.OPENROUTER_API_KEY
    ? new openai_1.default({
        apiKey: env_1.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Labto AI Widget',
        },
    })
    : null;
// Helper to load YAML prompt configuration based on chosen template
function loadAiPromptsYaml(template) {
    try {
        let filename = 'customer_support_and_sales.yml'; // Default fallback
        if (template === 'Customer Support')
            filename = 'customer_support.yml';
        else if (template === 'FAQ / Knowledge Base')
            filename = 'faq_knowledge_base.yml';
        else if (template === 'Booking & Scheduling')
            filename = 'booking_and_scheduling.yml';
        else if (template === 'Customer Support & Sales')
            filename = 'customer_support_and_sales.yml';
        const yamlPath = path_1.default.resolve(process.cwd(), `config/prompts/${filename}`);
        if (fs_1.default.existsSync(yamlPath)) {
            const content = fs_1.default.readFileSync(yamlPath, 'utf8');
            return js_yaml_1.default.load(content);
        }
    }
    catch (err) {
        logger_1.logger.error('Failed to load YAML prompt config:', err);
    }
    return null;
}
function isSimpleGreeting(message) {
    const clean = message.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    const commonGreetings = [
        'hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'hi there', 'hello there',
        'kemon achis', 'kemon acho', 'kemon aco', 'kire', 'ki khobor', 'bro',
        'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you',
        'kemon acis', 'kemne acho', 'kemon'
    ];
    return commonGreetings.some(g => clean === g || clean.includes(g) && clean.length < 20);
}
function getSystemPrompt(botMode, customPrompt, template) {
    if (customPrompt) {
        return customPrompt; // User provided custom prompt completely overrides YAML
    }
    const yamlConfig = loadAiPromptsYaml(template);
    const personaPrompt = yamlConfig?.system_instructions?.persona || `You are a helpful, polite, and knowledgeable Labto AI Assistant.`;
    const rules = yamlConfig?.system_instructions?.strict_rules;
    const langRule = rules?.language_matching?.instructions || `Respond in the exact same language as the user's message.`;
    const formatRule = rules?.formatting?.instructions || `Use GitHub Flavored Markdown formatting.`;
    const cartRule = rules?.cart_action?.instructions || ``;
    const scopeRule = rules?.scope_lock?.instructions || ``;
    return `${personaPrompt}

Strict Rules:
1. LANGUAGE RULE: ${langRule}
2. FORMATTING RULE: ${formatRule}
${cartRule ? `3. CART ACTION RULE: ${cartRule}` : ''}
${scopeRule ? `4. SCOPE LOCK RULE: ${scopeRule}` : ''}`.trim();
}
async function processChatMessage(merchantId, sessionId, userMessage, botMode = 'shopping', provider, customPrompt, template, imageUrl) {
    // 1. Get or create conversation record
    let conversation = await db_1.prisma.conversation.findFirst({
        where: { merchantId, sessionId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });
    if (!conversation) {
        conversation = await db_1.prisma.conversation.create({
            data: { merchantId, sessionId },
            include: { messages: true },
        });
    }
    // Save user message to database
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: 'user',
            content: imageUrl ? `${userMessage}\n\n![Uploaded Image](${imageUrl})` : userMessage,
        },
    });
    let recommendedProducts = [];
    let retrievedProducts = [];
    let ragContext = '';
    let cartAction = null;
    let finalReply = '';
    // Perform Catalog & Knowledge RAG Search
    try {
        const [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.all([
            (0, searchProducts_tool_1.searchProductsTool)(merchantId, userMessage, undefined, 5),
            (0, searchKnowledge_tool_1.searchKnowledgeTool)(merchantId, userMessage, 3)
        ]);
        retrievedProducts = retrievedProductsRes;
        // Fallback: If query search returned 0 items, fetch top catalog items for context
        if (retrievedProducts.length === 0) {
            retrievedProducts = await db_1.prisma.product.findMany({
                where: { merchantId },
                take: 8,
            });
        }
        if (retrievedProducts.length > 0) {
            ragContext += `\n\n### Store Catalog & Available Products:\n` +
                retrievedProducts.map(p => `- **[${p.title}](${p.productUrl || `/products/${p.id}`})** | ID: \`${p.id}\` | Price: **$${p.price} ${p.currency || 'USD'}** | Category: ${p.category || 'General'} | Description: ${p.description || p.title}`).join('\n') +
                `\n\nInstructions: Use the catalog items above to recommend items or provide details. Include product page links where appropriate.`;
        }
        if (retrievedKnowledgeRes.length > 0) {
            ragContext += `\n\n### Store Knowledge Base (Scraped from Website):\n` +
                retrievedKnowledgeRes.map((k, i) => `[Source: ${k.url}]\n${k.content}`).join('\n\n') +
                `\n\nInstructions: Use the scraped knowledge above to answer the user's questions about policies, FAQs, or general website info.`;
        }
        if (retrievedProducts.length === 0 && retrievedKnowledgeRes.length === 0) {
            // Generic fallback context when no specific data is retrieved for this query
            ragContext = `\n\n### Store Context:
Currently, no specific products or knowledge base articles were found for this query. Continue assisting the user based on your primary persona and instructions.`;
        }
    }
    catch (err) {
        logger_1.logger.error('RAG Search Error:', err);
    }
    // Resolve LLM Provider
    let selectedProvider = provider || '';
    if (!selectedProvider) {
        if (env_1.env.GROQ_API_KEY && !imageUrl)
            selectedProvider = 'groq';
        else if (env_1.env.OPENROUTER_API_KEY)
            selectedProvider = 'openrouter';
        else if (env_1.env.ANTHROPIC_API_KEY)
            selectedProvider = 'claude';
    }
    const systemPrompt = getSystemPrompt(botMode, customPrompt, template);
    // Configure Client
    const openAiConfig = selectedProvider === 'groq' && groq
        ? { client: groq, model: 'llama-3.3-70b-versatile' }
        : selectedProvider === 'openrouter' && openrouter
            ? { client: openrouter, model: 'google/gemini-2.5-flash' }
            : null;
    if (openAiConfig) {
        try {
            const { client, model } = openAiConfig;
            const messagesParam = conversation.messages.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content,
            }));
            // Construct user content (Multimodal Vision array if imageUrl present)
            const formattedUserText = `### User Input:\n${userMessage || 'Analyzing attached image.'}`;
            const userContent = imageUrl
                ? [
                    { type: 'text', text: formattedUserText },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ]
                : formattedUserText;
            messagesParam.push({ role: 'user', content: userContent });
            const completion = await client.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt + ragContext },
                    ...messagesParam,
                ],
            });
            finalReply = completion.choices[0].message.content || '';
        }
        catch (error) {
            logger_1.logger.error(`OpenAI provider (${selectedProvider}) call error, falling back to local:`, error);
            selectedProvider = 'fallback';
        }
    }
    else if (selectedProvider === 'claude' && anthropic) {
        try {
            const messagesParam = conversation.messages.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content,
            }));
            messagesParam.push({ role: 'user', content: userMessage });
            const response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                system: systemPrompt + ragContext,
                messages: messagesParam,
            });
            const textBlock = response.content.find((c) => c.type === 'text');
            finalReply = textBlock && 'text' in textBlock ? textBlock.text : '';
        }
        catch (error) {
            logger_1.logger.error('Anthropic API Call Error, falling back to local:', error);
            selectedProvider = 'fallback';
        }
    }
    // Fallback to local DB text search when API calls fail or keys are missing
    if (selectedProvider === 'fallback' || !finalReply) {
        const searchRes = await (0, searchProducts_tool_1.searchProductsTool)(merchantId, userMessage, undefined, 5);
        retrievedProducts = searchRes;
        if (searchRes.length > 0) {
            finalReply = `Here are some products matching "${userMessage}":`;
        }
        else {
            if (botMode === 'support' || template === 'Customer Support') {
                finalReply = `I am here to support you! Let me know if you need help with orders, shipping, or returns.`;
            }
            else if (botMode === 'sales') {
                finalReply = `Welcome to our store! We have the best deals waiting for you. What are you looking to buy today?`;
            }
            else {
                finalReply = `Welcome! How can I help you find items in our store today?`;
            }
        }
    }
    // Process Add-to-cart triggers
    const cartMatch = finalReply.match(/\[ADD_TO_CART:\s*([a-zA-Z0-9_-]+)\]/);
    if (cartMatch) {
        try {
            const productId = cartMatch[1];
            const res = await (0, addToCart_tool_1.addToCartTool)(merchantId, productId, 1);
            if (res.cartAction)
                cartAction = res.cartAction;
            if (res.product)
                recommendedProducts.push(res.product);
            // Strip the tag from the user-facing reply text
            finalReply = finalReply.replace(/\[ADD_TO_CART:\s*[a-zA-Z0-9_-]+\]/, '').trim();
        }
        catch (err) {
            logger_1.logger.error('Parsing Add to Cart Tag Error:', err);
        }
    }
    // Bind retrieved RAG products to the assistant response metadata
    if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
        recommendedProducts = retrievedProducts;
    }
    // Save assistant reply to database
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: finalReply,
            toolCalls: recommendedProducts.length > 0 || cartAction ? { recommendedProducts, cartAction } : undefined,
        },
    });
    return {
        sessionId,
        reply: finalReply,
        products: recommendedProducts.map((p) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            currency: p.currency || 'USD',
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
            inStock: p.inStock,
        })),
        cartAction,
    };
}
