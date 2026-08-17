import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from './logger';

export class KeyRotator {
  private groqClients: { client: OpenAI; key: string }[] = [];
  private openRouterClients: { client: OpenAI; key: string }[] = [];
  private geminiClients: { client: OpenAI; key: string }[] = [];
  private anthropicClients: { client: Anthropic; key: string }[] = [];

  private groqIndex = 0;
  private openRouterIndex = 0;
  private geminiIndex = 0;
  private anthropicIndex = 0;

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys() {
    const groqKeys = env.GROQ_API_KEYS;
    this.groqClients = groqKeys.map((key) => ({
      key,
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
    }));

    const openRouterKeys = env.OPENROUTER_API_KEYS;
    this.openRouterClients = openRouterKeys.map((key) => ({
      key,
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://labto.ai',
          'X-Title': 'Labto AI Widget',
        },
      }),
    }));

    const geminiKeys = env.GEMINI_API_KEYS;
    this.geminiClients = geminiKeys.map((key) => ({
      key,
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
    }));

    const anthropicKeys = env.ANTHROPIC_API_KEYS;
    this.anthropicClients = anthropicKeys.map((key) => ({
      key,
      client: new Anthropic({ apiKey: key }),
    }));

    logger.info(
      `[KeyRotator] Initialized API pools — Groq: ${this.groqClients.length}, OpenRouter: ${this.openRouterClients.length}, Gemini: ${this.geminiClients.length}, Anthropic: ${this.anthropicClients.length}`
    );
  }

  /**
   * Execute Groq OpenAI-compatible completion.
   */
  public async executeGroqCompletion(
    model: string,
    messages: any[],
    maxTokens: number = 380
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.groqClients.length === 0) {
      throw new Error('No Groq API keys available');
    }

    const attempts = this.groqClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.groqClients[this.groqIndex];
      this.groqIndex = (this.groqIndex + 1) % this.groqClients.length;

      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        });

        const content = completion.choices[0]?.message?.content || '';
        const tokensUsed = completion.usage?.total_tokens || 0;
        return { content, tokensUsed };
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');
        logger.warn(
          `[KeyRotator] Groq key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? '(429 Rate Limit)' : ''
          }. Retrying with next key in pool...`
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error('All Groq API keys failed');
  }

  /**
   * Execute Google Gemini completion using multi-key pool with automatic model rotation.
   */
  public async executeGeminiCompletion(
    model: string = 'gemini-3.6-flash',
    messages: any[],
    maxTokens: number = 180
  ): Promise<{ content: string; tokensUsed: number }> {
    const geminiKeys = env.GEMINI_API_KEYS;
    if (geminiKeys.length === 0) {
      throw new Error('No Gemini API keys available');
    }

    const targetModels = [model, 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.7-flash'];
    const uniqueModels = Array.from(new Set(targetModels));

    // Convert standard OpenAI messages to Google Generative format
    let systemText = '';
    const contents: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + (msg.content || '');
      } else if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content || '' }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content || '' }] });
      }
    }

    for (const currentModel of uniqueModels) {
      const attempts = geminiKeys.length;
      for (let i = 0; i < attempts; i++) {
        const key = geminiKeys[this.geminiIndex];
        this.geminiIndex = (this.geminiIndex + 1) % geminiKeys.length;

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
          const bodyPayload: any = {
            contents,
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.3,
            },
          };
          if (systemText) {
            bodyPayload.systemInstruction = { parts: [{ text: systemText }] };
          }

          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
          });

          if (resp.ok) {
            const data: any = await resp.json();
            const candidate = data.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            // Filter out internal thinking parts to get the final generated text
            const textParts = parts.filter((p: any) => p.text && !p.thought);
            const content = (textParts.length > 0 ? textParts.map((p: any) => p.text).join('') : parts[parts.length - 1]?.text || '').trim();
            const tokensUsed = data.usageMetadata?.totalTokenCount || 0;
            if (content) {
              return { content, tokensUsed };
            }
          }

          const errData: any = await resp.json().catch(() => ({}));
          const isRateLimit = resp.status === 429 || resp.status === 503;
          logger.warn(
            `[KeyRotator] Gemini key (${key.substring(0, 10)}...) on model ${currentModel} returned ${resp.status} ${
              isRateLimit ? '(Rate Limit/High Demand)' : errData.error?.message || ''
            }. Trying next key/model...`
          );
        } catch (error: any) {
          logger.warn(
            `[KeyRotator] Gemini key (${key.substring(0, 10)}...) on model ${currentModel} network error: ${
              error.message || error
            }`
          );
        }
      }
    }

    throw new Error('All Gemini API keys and model fallbacks failed');
  }

  /**
   * Execute OpenRouter completion.
   */
  public async executeOpenRouterCompletion(
    model: string,
    messages: any[],
    maxTokens: number = 380
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.openRouterClients.length === 0) {
      throw new Error('No OpenRouter API keys available');
    }

    const attempts = this.openRouterClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.openRouterClients[this.openRouterIndex];
      this.openRouterIndex = (this.openRouterIndex + 1) % this.openRouterClients.length;

      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        });

        const content = completion.choices[0]?.message?.content || '';
        const tokensUsed = completion.usage?.total_tokens || 0;
        return { content, tokensUsed };
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');
        logger.warn(
          `[KeyRotator] OpenRouter key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? '(429 Rate Limit)' : ''
          }. Retrying with next key in pool...`
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error('All OpenRouter API keys failed');
  }

  /**
   * Execute Anthropic completion.
   */
  public async executeAnthropicCompletion(
    model: string,
    systemPrompt: string,
    messages: any[],
    maxTokens: number = 380
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.anthropicClients.length === 0) {
      throw new Error('No Anthropic API keys available');
    }

    const attempts = this.anthropicClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.anthropicClients[this.anthropicIndex];
      this.anthropicIndex = (this.anthropicIndex + 1) % this.anthropicClients.length;

      try {
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature: 0.3,
          system: systemPrompt,
          messages,
        });

        const textBlock = response.content.find((c) => c.type === 'text');
        const content = textBlock && 'text' in textBlock ? textBlock.text : '';
        return { content, tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0 };
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');
        logger.warn(
          `[KeyRotator] Anthropic key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? '(429 Rate Limit)' : ''
          }. Retrying with next key...`
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error('All Anthropic API keys failed');
  }

  public hasGroqKeys(): boolean {
    return this.groqClients.length > 0;
  }

  public hasGeminiKeys(): boolean {
    return this.geminiClients.length > 0;
  }

  public hasOpenRouterKeys(): boolean {
    return this.openRouterClients.length > 0;
  }

  public hasAnthropicKeys(): boolean {
    return this.anthropicClients.length > 0;
  }
}

export const keyRotator = new KeyRotator();
