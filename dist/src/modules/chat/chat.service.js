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
        const candidatePaths = [
            path_1.default.resolve(process.cwd(), `config/prompts/${filename}`),
            path_1.default.resolve(__dirname, `../../config/prompts/${filename}`),
            path_1.default.resolve(__dirname, `../../../config/prompts/${filename}`),
            path_1.default.resolve(__dirname, `../../../../config/prompts/${filename}`),
        ];
        for (const yamlPath of candidatePaths) {
            if (fs_1.default.existsSync(yamlPath)) {
                const content = fs_1.default.readFileSync(yamlPath, 'utf8');
                return js_yaml_1.default.load(content);
            }
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
function getSystemPrompt(merchantName, primaryDomain, botMode, customPrompt, template) {
    if (customPrompt) {
        return `You are the official AI Assistant representing "${merchantName}"${primaryDomain ? ` (Website: ${primaryDomain})` : ''}.
${customPrompt}`;
    }
    const yamlConfig = loadAiPromptsYaml(template);
    const basePersona = yamlConfig?.system_instructions?.persona || `You are the official AI Customer Support and Sales Specialist for this business. Help visitors with website inquiries, portfolio projects, store products, pricing, agency services, and company information.`;
    const personaPrompt = `You are the official AI Assistant for "${merchantName}"${primaryDomain ? ` (Website: ${primaryDomain})` : ''}. ${basePersona}`;
    const rules = yamlConfig?.system_instructions?.strict_rules;
    const langRule = rules?.language_matching?.instructions || `Respond in the exact same language as the user's message. If the user writes in English, reply in English. If Bengali or Banglish, reply in Bengali.`;
    const formatRule = rules?.formatting?.instructions || `Use clean GitHub Flavored Markdown formatting with bold titles and clickable link badges.`;
    const cartRule = rules?.cart_action?.instructions || ``;
    const scopeLockRule = `STRICT DOMAIN & SCOPE LOCK:
- You are EXCLUSIVELY the customer assistant and sales representative for "${merchantName}" (${primaryDomain || 'this website'}).
- You must ONLY assist with questions directly related to ${merchantName}'s services, projects, portfolio, store products, pricing, agency capabilities, contact details, or company information.
- NEVER write general programming code (e.g. Python scripts, games, algorithmic solutions, C++/Java code), solve general academic homework, or act as a general AI/ChatGPT.
- If a user asks an out-of-scope query (e.g. "give me a snake game in python", general programming, trivia, recipes, or unrelated topics), you MUST POLITELY DECLINE. State clearly: "I am the AI assistant dedicated to ${merchantName}. I can only help you with questions about our projects, services, and website." and invite them to explore ${merchantName}'s offerings.`;
    const tokenEfficiencyRule = `TOKEN EFFICIENCY & DIRECTNESS (CRITICAL):
- Answer DIRECTLY and concisely. Answer ONLY what the user asked.
- NEVER add introductory filler (e.g. "Certainly!", "I would be happy to help!", "Here is what you requested:").
- NEVER add repetitive conversational filler or closing pleasantries (e.g. "Please let me know if you need anything else!").
- Keep paragraphs brief, high-density, and structured with bold keywords and bullet points.`;
    return `${personaPrompt}

Strict Rules:
1. WEBSITE IDENTITY: You represent "${merchantName}"${primaryDomain ? ` (${primaryDomain})` : ''}. When asked for the website name or company name, answer clearly with "${merchantName}".
2. FACTUALITY & REAL CONTENT ONLY: Only mention products, showcase projects, portfolio items, services, or pages that are explicitly present in the provided Website Knowledge Base or Store Catalog. NEVER invent fake project names or non-existent services.
3. STRICT CLICKABLE LINKS RULE: When mentioning any project, portfolio item, service, product, or page from the Website Knowledge Base or Catalog, you MUST ALWAYS format it as a clickable Markdown link with the title: \`[Title of Item](Full_URL)\`. NEVER print raw unformatted URLs like "Name: https://...". Always write \`[Title](https://...)\` directly.
4. ${tokenEfficiencyRule}
5. ${scopeLockRule}
6. LANGUAGE RULE: ${langRule}
7. FORMATTING RULE: ${formatRule}
${cartRule ? `8. CART ACTION RULE: ${cartRule}` : ''}`.trim();
}
async function processChatMessage(merchantId, sessionId, userMessage, botMode = 'shopping', provider, customPrompt, template, imageUrl) {
    // Fetch merchant profile for branding & domain identity
    const merchant = await db_1.prisma.user.findUnique({
        where: { id: merchantId },
        select: { name: true, allowedDomains: true, widgetConfig: true },
    });
    const merchantName = merchant?.name || 'our company';
    const primaryDomain = merchant?.allowedDomains?.[0] || '';
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
    // Save user message to database (keep content clean without raw 200KB base64 strings)
    const cleanUserText = userMessage || (imageUrl ? 'Analyzing attached image.' : '');
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: 'user',
            content: cleanUserText,
            toolCalls: imageUrl ? { imageUrl } : undefined,
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
            (0, searchProducts_tool_1.searchProductsTool)(merchantId, userMessage || 'general', undefined, 5),
            (0, searchKnowledge_tool_1.searchKnowledgeTool)(merchantId, userMessage || 'general', 3)
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
            ragContext += `\n\n### Website Knowledge Base (Scraped Content):\n` +
                retrievedKnowledgeRes.map((k, i) => `[Source: ${k.url}]\n${k.content}`).join('\n\n') +
                `\n\nInstructions: Use the scraped website knowledge above to answer the user's questions about company info, portfolio, policies, FAQs, or general site services.`;
        }
        if (retrievedProducts.length === 0 && retrievedKnowledgeRes.length === 0) {
            ragContext = `\n\n### Website Context:
Company/Website Name: ${merchantName}${primaryDomain ? ` (${primaryDomain})` : ''}.
Currently, no specific catalog items or knowledge base articles matched this query. Continue assisting the user based on your primary persona and website identity.`;
        }
    }
    catch (err) {
        logger_1.logger.error('RAG Search Error:', err);
    }
    // Resolve LLM Provider & Vision Support
    let selectedProvider = provider || '';
    if (!selectedProvider) {
        if (env_1.env.GROQ_API_KEY)
            selectedProvider = 'groq';
        else if (env_1.env.OPENROUTER_API_KEY)
            selectedProvider = 'openrouter';
        else if (env_1.env.ANTHROPIC_API_KEY)
            selectedProvider = 'claude';
    }
    const systemPrompt = getSystemPrompt(merchantName, primaryDomain, botMode, customPrompt, template);
    // Configure Client & Model (Groq supports llama-3.2-11b-vision-preview for images)
    const openAiConfig = selectedProvider === 'groq' && groq
        ? { client: groq, model: imageUrl ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile' }
        : selectedProvider === 'openrouter' && openrouter
            ? { client: openrouter, model: 'google/gemini-2.5-flash' }
            : null;
    if (openAiConfig) {
        try {
            const { client, model } = openAiConfig;
            // Sanitize historical messages so huge base64 strings never poison the context window
            const messagesParam = conversation.messages.map((m) => {
                let text = m.content || '';
                if (text.includes('data:image/')) {
                    text = text.replace(/!\[Uploaded Image\]\(data:image\/[^)]+\)/g, '[Image Attached]').replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[Image Attached]');
                }
                return {
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: text,
                };
            });
            // Construct user content (Multimodal Vision array if imageUrl present)
            const formattedUserText = userMessage ? `### User Input:\n${userMessage}` : `Please analyze this attached image in the context of ${merchantName}.`;
            const userContent = imageUrl
                ? [
                    { type: 'text', text: formattedUserText },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ]
                : formattedUserText;
            messagesParam.push({ role: 'user', content: userContent });
            let totalTokensUsed = 0;
            const completion = await client.chat.completions.create({
                model: model,
                max_tokens: 380,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: systemPrompt + ragContext },
                    ...messagesParam,
                ],
            });
            finalReply = completion.choices[0].message.content || '';
            if (completion.usage) {
                totalTokensUsed = completion.usage.total_tokens || 0;
            }
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
                max_tokens: 380,
                temperature: 0.3,
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
                finalReply = `I am here to assist with questions about our company, services, and projects.`;
            }
            else if (botMode === 'sales') {
                finalReply = `Welcome! How can I assist you with our services and projects today?`;
            }
            else {
                finalReply = `Welcome! How can I help you explore our website today?`;
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
    // Calculate estimated tokens if not provided by API
    const estimatedTokens = Math.max(15, Math.ceil(((userMessage || '').length + (finalReply || '').length) / 3.6));
    // Save assistant reply to database
    await db_1.prisma.message.create({
        data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: finalReply,
            tokensUsed: estimatedTokens,
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
