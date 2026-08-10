import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { searchProductsTool } from './tools/searchProducts.tool';
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
        'X-Title': 'Labto AI Shopping Widget',
      },
    })
  : null;

// Helper to load YAML prompt configuration
function loadAiPromptsYaml(): any {
  try {
    const yamlPath = path.resolve(process.cwd(), 'config/ai-prompts.yml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf8');
      return yaml.load(content);
    }
  } catch (err) {
    logger.error('Failed to load config/ai-prompts.yml:', err);
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

function getSystemPrompt(botMode: string, customPrompt?: string): string {
  const yamlConfig = loadAiPromptsYaml();
  
  if (customPrompt) {
    return customPrompt;
  }

  let personaPrompt = '';
  if (yamlConfig?.system_instructions?.personas?.[botMode]) {
    personaPrompt = yamlConfig.system_instructions.personas[botMode];
  } else {
    personaPrompt = yamlConfig?.system_instructions?.base_role || `You are a helpful AI Shopping Assistant for this storefront.`;
  }

  const rules = yamlConfig?.system_instructions?.strict_rules;
  const langRule = rules?.language_matching?.instructions || `Respond in the exact same language as the user's message.`;
  const formatRule = rules?.formatting?.instructions || `Use GitHub Flavored Markdown formatting.`;
  const cartRule = rules?.cart_action?.instructions || `Append [ADD_TO_CART: productId] when user asks to buy item.`;
  const scopeRule = rules?.scope_lock?.instructions || `Stick strictly to storefront queries.`;

  return `${personaPrompt}

Strict Rules (Loaded from config/ai-prompts.yml):
1. LANGUAGE RULE: ${langRule}
2. FORMATTING RULE: ${formatRule}
3. CART ACTION RULE: ${cartRule}
4. SCOPE LOCK RULE: ${scopeRule}`;
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

  // Perform Catalog RAG Search
  try {
    retrievedProducts = await searchProductsTool(merchantId, userMessage, undefined, 5);

    // Fallback: If query search returned 0 items, fetch top catalog items for context
    if (retrievedProducts.length === 0) {
      retrievedProducts = await prisma.product.findMany({
        where: { merchantId },
        take: 8,
      });
    }

    if (retrievedProducts.length > 0) {
      ragContext = `\n\n### Store Catalog & Available Products:\n` +
        retrievedProducts.map(p =>
          `- **[${p.title}](${p.productUrl || `/products/${p.id}`})** | ID: \`${p.id}\` | Price: **$${p.price} ${p.currency || 'USD'}** | Category: ${p.category || 'General'} | Description: ${p.description || p.title}`
        ).join('\n') +
        `\n\nInstructions: Use the catalog items above to explain what this website provides or recommend items. Include product page links where appropriate.`;
    } else {
      // Store Context fallback when no products exist yet
      ragContext = `\n\n### Website / Platform Context:
This platform is Labto AI — an AI-powered Shopping & Customer Support Assistant platform for e-commerce websites. It provides merchants with automated AI chat widgets, vector product search, direct add-to-cart integration, and visitor analytics.`;
    }
  } catch (err) {
    logger.error('RAG Product Search Error:', err);
  }

  // Resolve LLM Provider
  let selectedProvider = provider || '';
  if (!selectedProvider) {
    if (env.GROQ_API_KEY && !imageUrl) selectedProvider = 'groq';
    else if (env.OPENROUTER_API_KEY) selectedProvider = 'openrouter';
    else if (env.ANTHROPIC_API_KEY) selectedProvider = 'claude';
  }

  const systemPrompt = getSystemPrompt(botMode, customPrompt);

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
