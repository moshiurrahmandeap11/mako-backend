import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
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
  let basePrompt = '';
  if (customPrompt) {
    basePrompt = customPrompt;
  } else if (botMode === 'support') {
    basePrompt = `You are a polite, direct customer support agent. Help the user with FAQs, shipping info, refunds, or website issues. Do NOT actively pitch or sell products.`;
  } else if (botMode === 'sales') {
    basePrompt = `You are a highly enthusiastic and persuasive Sales Agent. Pitch products from our catalog aggressively, suggest matching accessories, mention imaginary limited-time deals, and guide them to buy.`;
  } else {
    basePrompt = `You are a helpful, polite, and knowledgeable AI Shopping Assistant for an e-commerce storefront.
Your goal is to help shoppers find products, answer store questions, provide recommendations, and help them add items to their cart.`;
  }

  return `${basePrompt}

Strict Output Rules:
1. Dynamic Length: Adjust your response length dynamically based on the complexity of the user's question. For simple greetings (e.g. "hi", "kemon achis"), casual comments, or thank yous, reply with a very short, friendly sentence. For product requests, explanations, or customer queries, provide a complete, clear, and helpful answer.
2. NEVER mention function names, code blocks, JSON parameters, or coding schemas (e.g. do not output "<function=...>" or "search_products").
3. Respond in the same language or tone as the user. If the user greets you briefly, greet them back briefly.
4. When the user explicitly wants to add a product to their cart or buy it, append the following special tag at the very end of your response text (do not use code blocks): [ADD_TO_CART: productId]`;
}

export async function processChatMessage(
  merchantId: string,
  sessionId: string,
  userMessage: string,
  botMode: string = 'shopping',
  provider?: string,
  customPrompt?: string,
  template?: string
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
      content: userMessage,
    },
  });

  let recommendedProducts: any[] = [];
  let retrievedProducts: any[] = [];
  let ragContext = '';
  let cartAction: any = null;
  let finalReply = '';

  // Only perform product retrieval (RAG) for shopping configuration and non-greetings
  const isShopping = template === 'E-commerce Shopping' || (!template && botMode === 'shopping');
  if (isShopping && !isSimpleGreeting(userMessage)) {
    try {
      retrievedProducts = await searchProductsTool(merchantId, userMessage, undefined, 5);
      if (retrievedProducts.length > 0) {
        ragContext = `\n\nRetrieved Products from Catalog (RAG Context):\n` +
          retrievedProducts.map(p =>
            `- Product ID: ${p.id} | Title: ${p.title} | Price: ${p.price} ${p.currency || 'USD'} | URL: ${p.productUrl || `/products/${p.id}`} | Stock: ${p.inStock ? 'In Stock' : 'Out of Stock'}`
          ).join('\n') +
          `\n\nInstructions: Recommend only the matching products from the retrieved catalog above. Do not invent products.`;
      }
    } catch (err) {
      logger.error('RAG Product Search Error:', err);
    }
  }

  // Resolve LLM Provider
  let selectedProvider = provider || '';
  if (!selectedProvider) {
    if (env.GROQ_API_KEY) selectedProvider = 'groq';
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
      
      const messagesParam = conversation.messages.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
      messagesParam.push({ role: 'user' as const, content: userMessage });

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
