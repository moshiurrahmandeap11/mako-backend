import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { searchProductsTool } from './tools/searchProducts.tool';
import { searchKnowledgeTool } from './tools/searchKnowledge.tool';
import { addToCartTool } from './tools/addToCart.tool';

const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

const groq = env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

const openrouter = env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Labto AI Widget',
      },
    })
  : null;

// Helper to load YAML prompt configuration based on chosen template
function loadAiPromptsYaml(template?: string): any {
  try {
    let filename = 'customer_support_and_sales.yml'; // Default fallback
    if (template === 'Customer Support') filename = 'customer_support.yml';
    else if (template === 'FAQ / Knowledge Base') filename = 'faq_knowledge_base.yml';
    else if (template === 'Booking & Scheduling') filename = 'booking_and_scheduling.yml';
    else if (template === 'Customer Support & Sales') filename = 'customer_support_and_sales.yml';

    const yamlPath = path.resolve(process.cwd(), `config/prompts/${filename}`);
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf8');
      return yaml.load(content);
    }
  } catch (err) {
    logger.error('Failed to load YAML prompt config:', err);
  }
  return null;
}

function isSimpleGreeting(message: string): boolean {
  const clean = message.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const commonGreetings = [
    'hi', 'hello', 'hey', 'yo', 'sup', 'hola', 'hi there', 'hello there',
    'kemon achis', 'kemon acho', 'kemon aco', 'kire', 'ki khobor', 'bro',
    'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you',
    'kemon acis', 'kemne acho', 'kemon'
  ];
  return commonGreetings.some(g => clean === g || clean.includes(g) && clean.length < 20);
}

function getSystemPrompt(
  merchantName: string,
  primaryDomain: string,
  botMode: string,
  customPrompt?: string,
  template?: string
): string {
  if (customPrompt) {
    return `You are the official AI Assistant representing "${merchantName}"${primaryDomain ? ` (Website: ${primaryDomain})` : ''}.
${customPrompt}`;
  }

  const yamlConfig = loadAiPromptsYaml(template);
  const basePersona = yamlConfig?.system_instructions?.persona || `You are a helpful, polite, and knowledgeable AI Assistant.`;
  const personaPrompt = `You are the official AI Assistant for "${merchantName}"${primaryDomain ? ` (Website: ${primaryDomain})` : ''}. ${basePersona}`;

  const rules = yamlConfig?.system_instructions?.strict_rules;
  const langRule = rules?.language_matching?.instructions || `Respond in the exact same language as the user's message.`;
  const formatRule = rules?.formatting?.instructions || `Use GitHub Flavored Markdown formatting.`;
  const cartRule = rules?.cart_action?.instructions || ``;
  const scopeRule = rules?.scope_lock?.instructions || ``;

  return `${personaPrompt}

Strict Rules:
1. WEBSITE IDENTITY: You represent "${merchantName}"${primaryDomain ? ` (${primaryDomain})` : ''}. When asked for the website name or company name, answer clearly with "${merchantName}".
2. FACTUALITY & REAL CONTENT ONLY: Only mention products, showcase projects, portfolio items, services, or pages that are explicitly present in the provided Website Knowledge Base or Store Catalog. NEVER invent fake project names (e.g., StudioX, Aura, Flow AI, etc.) or non-existent services.
3. STRICT CLICKABLE LINKS RULE: When mentioning any project, portfolio item, service, product, or page from the Website Knowledge Base or Catalog, you MUST ALWAYS format it as a clickable Markdown link with the title: \`[Title of Item](Full_URL)\`. NEVER print raw unformatted URLs like "Name: https://...". Always write \`[Title](https://...)\` directly.
4. LANGUAGE RULE: ${langRule}
5. FORMATTING RULE: ${formatRule}
${cartRule ? `6. CART ACTION RULE: ${cartRule}` : ''}
${scopeRule ? `7. SCOPE LOCK RULE: ${scopeRule}` : ''}`.trim();
}

export async function processChatMessage(
  merchantId: string,
  sessionId: string,
  userMessage: string,
  botMode: string = 'shopping',
  provider?: string,
  customPrompt?: string,
  template?: string,
  imageUrl?: string
) {
  // Fetch merchant profile for branding & domain identity
  const merchant = await prisma.user.findUnique({
    where: { id: merchantId },
    select: { name: true, allowedDomains: true, widgetConfig: true },
  });

  const merchantName = merchant?.name || 'our company';
  const primaryDomain = merchant?.allowedDomains?.[0] || '';

  // 1. Get or create conversation record
  let conversation = await prisma.conversation.findFirst({
    where: { merchantId, sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { merchantId, sessionId },
      include: { messages: true },
    });
  }

  // Save user message to database
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: imageUrl ? `${userMessage}\n\n![Uploaded Image](${imageUrl})` : userMessage,
    },
  });

  let recommendedProducts: any[] = [];
  let retrievedProducts: any[] = [];
  let ragContext = '';
  let cartAction: any = null;
  let finalReply = '';

  // Perform Catalog & Knowledge RAG Search
  try {
    const [retrievedProductsRes, retrievedKnowledgeRes] = await Promise.all([
      searchProductsTool(merchantId, userMessage, undefined, 5),
      searchKnowledgeTool(merchantId, userMessage, 3)
    ]);

    retrievedProducts = retrievedProductsRes;

    // Fallback: If query search returned 0 items, fetch top catalog items for context
    if (retrievedProducts.length === 0) {
      retrievedProducts = await prisma.product.findMany({
        where: { merchantId },
        take: 8,
      });
    }

    if (retrievedProducts.length > 0) {
      ragContext += `\n\n### Store Catalog & Available Products:\n` +
        retrievedProducts.map(p =>
          `- **[${p.title}](${p.productUrl || `/products/${p.id}`})** | ID: \`${p.id}\` | Price: **$${p.price} ${p.currency || 'USD'}** | Category: ${p.category || 'General'} | Description: ${p.description || p.title}`
        ).join('\n') +
        `\n\nInstructions: Use the catalog items above to recommend items or provide details. Include product page links where appropriate.`;
    } 

    if (retrievedKnowledgeRes.length > 0) {
      ragContext += `\n\n### Website Knowledge Base (Scraped Content):\n` +
        retrievedKnowledgeRes.map((k, i) => `[Source: ${k.url}]\n${k.content}`).join('\n\n') +
        `\n\nInstructions: Use the scraped website knowledge above to answer the user's questions about company info, portfolio, policies, FAQs, or general site services.`;
    }

    if (retrievedProducts.length === 0 && retrievedKnowledgeRes.length === 0) {
      // Generic fallback context when no specific data is retrieved for this query
      ragContext = `\n\n### Website Context:
Company/Website Name: ${merchantName}${primaryDomain ? ` (${primaryDomain})` : ''}.
Currently, no specific catalog items or knowledge base articles matched this query. Continue assisting the user based on your primary persona and website identity.`;
    }
  } catch (err) {
    logger.error('RAG Search Error:', err);
  }

  // Resolve LLM Provider
  let selectedProvider = provider || '';
  if (!selectedProvider) {
    if (env.GROQ_API_KEY && !imageUrl) selectedProvider = 'groq';
    else if (env.OPENROUTER_API_KEY) selectedProvider = 'openrouter';
    else if (env.ANTHROPIC_API_KEY) selectedProvider = 'claude';
  }

  const systemPrompt = getSystemPrompt(merchantName, primaryDomain, botMode, customPrompt, template);

  // Configure Client
  const openAiConfig =
    selectedProvider === 'groq' && groq
      ? { client: groq, model: 'llama-3.3-70b-versatile' }
      : selectedProvider === 'openrouter' && openrouter
      ? { client: openrouter, model: 'google/gemini-2.5-flash' }
      : null;

  if (openAiConfig) {
    try {
      const { client, model } = openAiConfig;
      
      const messagesParam: any[] = conversation.messages.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
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

      messagesParam.push({ role: 'user', content: userContent as any });

      const completion = await client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt + ragContext },
          ...messagesParam,
        ],
      });

      finalReply = completion.choices[0].message.content || '';
    } catch (error) {
      logger.error(`OpenAI provider (${selectedProvider}) call error, falling back to local:`, error);
      selectedProvider = 'fallback';
    }
  } else if (selectedProvider === 'claude' && anthropic) {
    try {
      const messagesParam = conversation.messages.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
      messagesParam.push({ role: 'user' as const, content: userMessage });

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: systemPrompt + ragContext,
        messages: messagesParam,
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      finalReply = textBlock && 'text' in textBlock ? textBlock.text : '';
    } catch (error) {
      logger.error('Anthropic API Call Error, falling back to local:', error);
      selectedProvider = 'fallback';
    }
  }

  // Fallback to local DB text search when API calls fail or keys are missing
  if (selectedProvider === 'fallback' || !finalReply) {
    const searchRes = await searchProductsTool(merchantId, userMessage, undefined, 5);
    retrievedProducts = searchRes;
    if (searchRes.length > 0) {
      finalReply = `Here are some products matching "${userMessage}":`;
    } else {
      if (botMode === 'support' || template === 'Customer Support') {
        finalReply = `I am here to support you! Let me know if you need help with orders, shipping, or returns.`;
      } else if (botMode === 'sales') {
        finalReply = `Welcome to our store! We have the best deals waiting for you. What are you looking to buy today?`;
      } else {
        finalReply = `Welcome! How can I help you find items in our store today?`;
      }
    }
  }

  // Process Add-to-cart triggers
  const cartMatch = finalReply.match(/\[ADD_TO_CART:\s*([a-zA-Z0-9_-]+)\]/);
  if (cartMatch) {
    try {
      const productId = cartMatch[1];
      const res = await addToCartTool(merchantId, productId, 1);
      if (res.cartAction) cartAction = res.cartAction;
      if (res.product) recommendedProducts.push(res.product);
      // Strip the tag from the user-facing reply text
      finalReply = finalReply.replace(/\[ADD_TO_CART:\s*[a-zA-Z0-9_-]+\]/, '').trim();
    } catch (err) {
      logger.error('Parsing Add to Cart Tag Error:', err);
    }
  }

  // Bind retrieved RAG products to the assistant response metadata
  if (recommendedProducts.length === 0 && retrievedProducts.length > 0) {
    recommendedProducts = retrievedProducts;
  }

  // Save assistant reply to database
  await prisma.message.create({
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
