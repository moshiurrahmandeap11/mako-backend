import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "../config/env";
import { logger } from "./logger";

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
        baseURL: "https://api.groq.com/openai/v1",
      }),
    }));

    const openRouterKeys = env.OPENROUTER_API_KEYS;
    this.openRouterClients = openRouterKeys.map((key) => ({
      key,
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://labto.ai",
          "X-Title": "Labto AI Widget",
        },
      }),
    }));

    const geminiKeys = env.GEMINI_API_KEYS;
    this.geminiClients = geminiKeys.map((key) => ({
      key,
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
    }));

    const anthropicKeys = env.ANTHROPIC_API_KEYS;
    this.anthropicClients = anthropicKeys.map((key) => ({
      key,
      client: new Anthropic({ apiKey: key }),
    }));

    logger.info(
      `[KeyRotator] Initialized API pools — Groq: ${this.groqClients.length}, OpenRouter: ${this.openRouterClients.length}, Gemini: ${this.geminiClients.length}, Anthropic: ${this.anthropicClients.length}`,
    );
  }

  public getPoolHealth() {
    const formatPool = (
      clients: { key: string }[],
      providerName: string,
      modelName: string,
      speedText: string,
    ) => ({
      provider: providerName,
      model: modelName,
      speed: speedText,
      totalKeys: clients.length,
      activeKeys: clients.length,
      rateLimitedKeys: 0,
      keys: clients.map((c, idx) => ({
        index: idx + 1,
        keyPrefix: c.key
          ? `${c.key.slice(0, Math.min(8, c.key.length))}...${c.key.slice(-4)}`
          : "N/A",
        status: "Active & Ready",
        isRateLimited: false,
        errorCount: 0,
        rateLimitExpiresInSec: 0,
      })),
    });

    return {
      groq: formatPool(
        this.groqClients,
        "Groq LLaMA 3.3",
        "llama-3.3-70b-versatile",
        "~200ms TTFB",
      ),
      openrouter: formatPool(
        this.openRouterClients,
        "OpenRouter Fallback",
        "llama-3.3-70b-instruct",
        "~300ms TTFB",
      ),
      gemini: formatPool(
        this.geminiClients,
        "Google Gemini Flash",
        "gemini-1.5-flash",
        "~150ms TTFB",
      ),
      anthropic: formatPool(
        this.anthropicClients,
        "Anthropic Claude",
        "claude-3-5-sonnet",
        "~500ms TTFB",
      ),
    };
  }

  /**
   * Execute Groq OpenAI-compatible completion.
   */
  public async executeGroqCompletion(
    model: string,
    messages: any[],
    maxTokens: number = 380,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.groqClients.length === 0) {
      throw new Error("No Groq API keys available");
    }

    const attempts = this.groqClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.groqClients[this.groqIndex];
      this.groqIndex = (this.groqIndex + 1) % this.groqClients.length;

      try {
        const targetModel = "llama-3.3-70b-versatile";
        const completion = await client.chat.completions.create(
          {
            model: targetModel,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
          },
          { timeout: 3500 },
        );

        const content = completion.choices[0]?.message?.content || "";
        const tokensUsed = completion.usage?.total_tokens || 0;
        return { content, tokensUsed };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] Groq key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key in pool...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All Groq API keys failed");
  }

  /**
   * Execute Google Gemini completion using multi-key pool with automatic model rotation.
   */
  public async executeGeminiCompletion(
    model: string = "gemini-1.5-flash",
    messages: any[],
    maxTokens: number = 850,
  ): Promise<{ content: string; tokensUsed: number }> {
    const geminiKeys = env.GEMINI_API_KEYS;
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API keys available");
    }

    const validModels = ["gemini-1.5-flash", "gemini-2.0-flash"];

    // Convert standard OpenAI messages to Google Generative format
    let systemText = "";
    const contents: any[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemText += (systemText ? "\n\n" : "") + (msg.content || "");
      } else if (msg.role === "user") {
        contents.push({ role: "user", parts: [{ text: msg.content || "" }] });
      } else if (msg.role === "assistant") {
        contents.push({ role: "model", parts: [{ text: msg.content || "" }] });
      }
    }

    for (const currentModel of validModels) {
      const key = geminiKeys[this.geminiIndex];
      this.geminiIndex = (this.geminiIndex + 1) % geminiKeys.length;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
        const bodyPayload: any = {
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens || 850,
            temperature: 0.3,
          },
        };
        if (systemText) {
          bodyPayload.systemInstruction = { parts: [{ text: systemText }] };
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3500),
          body: JSON.stringify(bodyPayload),
        });

        if (resp.ok) {
          const data: any = await resp.json();
          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const textParts = parts.filter((p: any) => p.text && !p.thought);
          const content = (
            textParts.length > 0
              ? textParts.map((p: any) => p.text).join("")
              : parts[parts.length - 1]?.text || ""
          ).trim();
          const tokensUsed = data.usageMetadata?.totalTokenCount || 0;
          if (content) {
            return { content, tokensUsed };
          }
        }
      } catch (error: any) {
        logger.warn(
          `[KeyRotator] Gemini key (${key.substring(0, 10)}...) model ${currentModel} error: ${error.message || error}`,
        );
      }
    }

    throw new Error("All Gemini API keys and model fallbacks failed");
  }

  /**
   * Execute OpenRouter completion.
   */
  public async executeOpenRouterCompletion(
    model: string,
    messages: any[],
    maxTokens: number = 380,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.openRouterClients.length === 0) {
      throw new Error("No OpenRouter API keys available");
    }

    const attempts = this.openRouterClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.openRouterClients[this.openRouterIndex];
      this.openRouterIndex =
        (this.openRouterIndex + 1) % this.openRouterClients.length;

      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
          },
          { timeout: 3500 },
        );

        const content = completion.choices[0]?.message?.content || "";
        const tokensUsed = completion.usage?.total_tokens || 0;
        return { content, tokensUsed };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] OpenRouter key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key in pool...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All OpenRouter API keys failed");
  }

  /**
   * Execute Anthropic completion.
   */
  public async executeAnthropicCompletion(
    model: string,
    systemPrompt: string,
    messages: any[],
    maxTokens: number = 380,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.anthropicClients.length === 0) {
      throw new Error("No Anthropic API keys available");
    }

    const attempts = this.anthropicClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.anthropicClients[this.anthropicIndex];
      this.anthropicIndex =
        (this.anthropicIndex + 1) % this.anthropicClients.length;

      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            temperature: 0.3,
            system: systemPrompt,
            messages,
          },
          { timeout: 3500 },
        );

        const textBlock = response.content.find((c) => c.type === "text");
        const content = textBlock && "text" in textBlock ? textBlock.text : "";
        return {
          content,
          tokensUsed:
            response.usage?.input_tokens + response.usage?.output_tokens || 0,
        };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] Anthropic key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All Anthropic API keys failed");
  }

  /**
   * Execute Groq streaming completion.
   */
  public async executeGroqStream(
    model: string,
    messages: any[],
    onChunk: (chunk: string) => void,
    maxTokens: number = 550,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.groqClients.length === 0) {
      throw new Error("No Groq API keys available");
    }

    const attempts = this.groqClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.groqClients[this.groqIndex];
      this.groqIndex = (this.groqIndex + 1) % this.groqClients.length;

      try {
        const targetModel = "llama-3.3-70b-versatile";
        const stream = await client.chat.completions.create(
          {
            model: targetModel,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
            stream: true,
          },
          { timeout: 8000 },
        );

        let fullContent = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        }

        const estimatedTokens = Math.ceil(fullContent.length / 3.6);
        return { content: fullContent, tokensUsed: estimatedTokens };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] Groq stream key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key in pool...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All Groq API keys failed");
  }

  /**
   * Execute Google Gemini streaming completion.
   */
  public async executeGeminiStream(
    model: string = "gemini-1.5-flash",
    messages: any[],
    onChunk: (chunk: string) => void,
    maxTokens: number = 850,
  ): Promise<{ content: string; tokensUsed: number }> {
    const geminiKeys = env.GEMINI_API_KEYS;
    if (geminiKeys.length === 0) {
      throw new Error("No Gemini API keys available");
    }

    const validModels = ["gemini-1.5-flash", "gemini-2.0-flash"];

    let systemText = "";
    const contents: any[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemText += (systemText ? "\n\n" : "") + (msg.content || "");
      } else if (msg.role === "user") {
        contents.push({ role: "user", parts: [{ text: msg.content || "" }] });
      } else if (msg.role === "assistant") {
        contents.push({ role: "model", parts: [{ text: msg.content || "" }] });
      }
    }

    for (const currentModel of validModels) {
      const key = geminiKeys[this.geminiIndex];
      this.geminiIndex = (this.geminiIndex + 1) % geminiKeys.length;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse&key=${key}`;
        const bodyPayload: any = {
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens || 850,
            temperature: 0.3,
          },
        };
        if (systemText) {
          bodyPayload.systemInstruction = { parts: [{ text: systemText }] };
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify(bodyPayload),
        });

        if (resp.ok && resp.body) {
          let fullContent = "";
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr) {
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const candidate = parsed.candidates?.[0];
                    const parts = candidate?.content?.parts || [];
                    const textParts = parts.filter(
                      (p: any) => p.text && !p.thought,
                    );
                    for (const p of textParts) {
                      if (p.text) {
                        fullContent += p.text;
                        onChunk(p.text);
                      }
                    }
                  } catch {}
                }
              }
            }
          }

          if (fullContent) {
            const estimatedTokens = Math.ceil(fullContent.length / 3.6);
            return { content: fullContent, tokensUsed: estimatedTokens };
          }
        }
      } catch (error: any) {
        logger.warn(
          `[KeyRotator] Gemini stream key (${key.substring(0, 10)}...) model ${currentModel} error: ${error.message || error}`,
        );
      }
    }

    // Fallback: If streaming failed, execute standard non-streaming completion and emit as one chunk
    const nonStream = await this.executeGeminiCompletion(
      model,
      messages,
      maxTokens,
    );
    if (nonStream.content) {
      onChunk(nonStream.content);
    }
    return nonStream;
  }

  /**
   * Execute OpenRouter streaming completion.
   */
  public async executeOpenRouterStream(
    model: string,
    messages: any[],
    onChunk: (chunk: string) => void,
    maxTokens: number = 550,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.openRouterClients.length === 0) {
      throw new Error("No OpenRouter API keys available");
    }

    const attempts = this.openRouterClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.openRouterClients[this.openRouterIndex];
      this.openRouterIndex =
        (this.openRouterIndex + 1) % this.openRouterClients.length;

      try {
        const stream = await client.chat.completions.create(
          {
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
            stream: true,
          },
          { timeout: 8000 },
        );

        let fullContent = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        }

        const estimatedTokens = Math.ceil(fullContent.length / 3.6);
        return { content: fullContent, tokensUsed: estimatedTokens };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] OpenRouter stream key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key in pool...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All OpenRouter API keys failed");
  }

  /**
   * Execute Anthropic streaming completion.
   */
  public async executeAnthropicStream(
    model: string,
    systemPrompt: string,
    messages: any[],
    onChunk: (chunk: string) => void,
    maxTokens: number = 550,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (this.anthropicClients.length === 0) {
      throw new Error("No Anthropic API keys available");
    }

    const attempts = this.anthropicClients.length;
    for (let i = 0; i < attempts; i++) {
      const { client, key } = this.anthropicClients[this.anthropicIndex];
      this.anthropicIndex =
        (this.anthropicIndex + 1) % this.anthropicClients.length;

      try {
        const stream = await client.messages.stream({
          model,
          max_tokens: maxTokens,
          temperature: 0.3,
          system: systemPrompt,
          messages,
        });

        let fullContent = "";
        stream.on("text", (text) => {
          fullContent += text;
          onChunk(text);
        });

        const finalMsg = await stream.finalMessage();
        const tokensUsed =
          (finalMsg.usage?.input_tokens || 0) +
          (finalMsg.usage?.output_tokens || 0);
        return { content: fullContent, tokensUsed };
      } catch (error: any) {
        const isRateLimit =
          error?.status === 429 || error?.message?.includes("429");
        logger.warn(
          `[KeyRotator] Anthropic stream key (${key.substring(0, 10)}...) failed ${
            isRateLimit ? "(429 Rate Limit)" : ""
          }. Retrying with next key...`,
        );

        if (i === attempts - 1) {
          throw error;
        }
      }
    }

    throw new Error("All Anthropic API keys failed");
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
