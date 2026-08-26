import { keyRotator } from "../../../utils/keyRotator";
import { logger } from "../../../utils/logger";
import { searchProductsTool } from "../tools/searchProducts.tool";

export interface LlmExecutionResult {
  finalReply: string;
  estimatedTokens: number;
  thoughts: string[];
  retrievedProducts: any[];
}

function constructMessagesParam(
  conversationMessages: any[],
  userMessage: string,
  imageUrl?: string,
): any[] {
  const messagesParam: any[] = conversationMessages.map((m) => {
    let text = m.content || "";
    if (text.includes("data:image/")) {
      text = text
        .replace(
          /!\[Uploaded Image\]\(data:image\/[^)]+\)/g,
          "[Image Attached]",
        )
        .replace(
          /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
          "[Image Attached]",
        );
    }
    return {
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: text,
    };
  });

  const formattedUserText = userMessage
    ? `### User Input:\n${userMessage}`
    : `Please analyze this attached image.`;
  const userContent = imageUrl
    ? [
        { type: "text", text: formattedUserText },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : formattedUserText;

  messagesParam.push({ role: "user", content: userContent as any });
  return messagesParam;
}

export async function executeLlmCascade(
  merchantId: string,
  userMessage: string,
  systemPromptWithRag: string,
  conversationMessages: any[],
  imageUrl?: string,
  preferredProvider?: string,
  botMode: string = "shopping",
  template?: string,
): Promise<LlmExecutionResult> {
  const thoughts: string[] = [];
  let finalReply = "";
  let estimatedTokens = 0;
  let executionSuccess = false;
  let retrievedProducts: any[] = [];

  let selectedProvider = preferredProvider || "";
  if (!selectedProvider) {
    if (keyRotator.hasGeminiKeys()) selectedProvider = "gemini";
    else if (keyRotator.hasGroqKeys()) selectedProvider = "groq";
    else if (keyRotator.hasOpenRouterKeys()) selectedProvider = "openrouter";
    else if (keyRotator.hasAnthropicKeys()) selectedProvider = "claude";
  }

  const messagesParam = constructMessagesParam(
    conversationMessages,
    userMessage,
    imageUrl,
  );

  // Attempt 1: Google Gemini 1.5 Flash
  if (
    (selectedProvider === "gemini" || keyRotator.hasGeminiKeys()) &&
    !executionSuccess
  ) {
    try {
      const result = await keyRotator.executeGeminiCompletion(
        "gemini-1.5-flash",
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(`⚡ Synthesized response via Google Gemini Flash (~0.3s).`);
    } catch (error) {
      logger.error(
        "Gemini provider pool failed, falling back to Groq pool:",
        error,
      );
      selectedProvider = "groq";
    }
  }

  // Attempt 2: Groq Pool
  if (
    !executionSuccess &&
    (selectedProvider === "groq" || keyRotator.hasGroqKeys())
  ) {
    try {
      const model = imageUrl
        ? "llama-3.2-11b-vision-preview"
        : "llama-3.3-70b-versatile";
      const result = await keyRotator.executeGroqCompletion(
        model,
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(`⚡ Synthesized response via Groq LLaMA 3.3 70B (~0.4s).`);
    } catch (error) {
      logger.error(
        "Groq provider pool failed, falling back to OpenRouter pool:",
        error,
      );
      selectedProvider = "openrouter";
    }
  }

  // Attempt 3: OpenRouter Pool
  if (
    !executionSuccess &&
    (selectedProvider === "openrouter" || keyRotator.hasOpenRouterKeys())
  ) {
    try {
      const result = await keyRotator.executeOpenRouterCompletion(
        "meta-llama/llama-3.3-70b-instruct",
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(
        `⚡ Synthesized response via OpenRouter LLaMA 3.3 70B (~0.5s).`,
      );
    } catch (error) {
      logger.error(
        "OpenRouter provider pool failed, falling back to Anthropic:",
        error,
      );
      selectedProvider = "claude";
    }
  }

  // Attempt 4: Anthropic Claude 3.5 Sonnet
  if (
    !executionSuccess &&
    (selectedProvider === "claude" || keyRotator.hasAnthropicKeys())
  ) {
    try {
      const anthropicMessages = conversationMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content || "",
      }));
      anthropicMessages.push({ role: "user" as const, content: userMessage });

      const result = await keyRotator.executeAnthropicCompletion(
        "claude-3-5-sonnet-20241022",
        systemPromptWithRag,
        anthropicMessages,
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(
        `⚡ Synthesized response via Anthropic Claude 3.5 Sonnet (~0.7s).`,
      );
    } catch (error) {
      logger.error("Anthropic provider pool failed:", error);
      selectedProvider = "fallback";
    }
  }

  // Fallback to local DB text search when API calls fail or keys are missing
  if (selectedProvider === "fallback" || !finalReply) {
    const searchRes = await searchProductsTool(
      merchantId,
      userMessage,
      undefined,
      5,
    );
    retrievedProducts = searchRes;
    if (searchRes.length > 0) {
      finalReply = `Here are some products matching "${userMessage}":`;
    } else {
      if (botMode === "support" || template === "Customer Support") {
        finalReply = `I am here to assist with questions about our company, services, and projects.`;
      } else if (botMode === "sales") {
        finalReply = `Welcome! How can I assist you with our services and projects today?`;
      } else {
        finalReply = `Welcome! How can I help you explore our website today?`;
      }
    }
  }

  return {
    finalReply,
    estimatedTokens,
    thoughts,
    retrievedProducts,
  };
}

/**
 * Executes LLM Provider Cascade in real-time streaming mode (Gemini -> Groq -> OpenRouter -> Claude).
 */
export async function executeLlmCascadeStream(
  merchantId: string,
  userMessage: string,
  systemPromptWithRag: string,
  conversationMessages: any[],
  onToken: (token: string) => void,
  imageUrl?: string,
  preferredProvider?: string,
  botMode: string = "shopping",
  template?: string,
): Promise<LlmExecutionResult> {
  const thoughts: string[] = [];
  let finalReply = "";
  let estimatedTokens = 0;
  let executionSuccess = false;
  let retrievedProducts: any[] = [];

  let selectedProvider = preferredProvider || "";
  if (!selectedProvider) {
    if (keyRotator.hasGeminiKeys()) selectedProvider = "gemini";
    else if (keyRotator.hasGroqKeys()) selectedProvider = "groq";
    else if (keyRotator.hasOpenRouterKeys()) selectedProvider = "openrouter";
    else if (keyRotator.hasAnthropicKeys()) selectedProvider = "claude";
  }

  const messagesParam = constructMessagesParam(
    conversationMessages,
    userMessage,
    imageUrl,
  );

  // Attempt 1: Google Gemini Flash Stream
  if (
    (selectedProvider === "gemini" || keyRotator.hasGeminiKeys()) &&
    !executionSuccess
  ) {
    try {
      const result = await keyRotator.executeGeminiStream(
        "gemini-1.5-flash",
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        onToken,
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(`⚡ Streamed response live via Google Gemini Flash (~0.15s TTFB).`);
    } catch (error) {
      logger.error(
        "Gemini stream pool failed, falling back to Groq stream:",
        error,
      );
      selectedProvider = "groq";
    }
  }

  // Attempt 2: Groq Stream
  if (
    !executionSuccess &&
    (selectedProvider === "groq" || keyRotator.hasGroqKeys())
  ) {
    try {
      const model = imageUrl
        ? "llama-3.2-11b-vision-preview"
        : "llama-3.3-70b-versatile";
      const result = await keyRotator.executeGroqStream(
        model,
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        onToken,
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(`⚡ Streamed response live via Groq LLaMA 3.3 70B (~0.2s TTFB).`);
    } catch (error) {
      logger.error(
        "Groq stream pool failed, falling back to OpenRouter stream:",
        error,
      );
      selectedProvider = "openrouter";
    }
  }

  // Attempt 3: OpenRouter Stream
  if (
    !executionSuccess &&
    (selectedProvider === "openrouter" || keyRotator.hasOpenRouterKeys())
  ) {
    try {
      const result = await keyRotator.executeOpenRouterStream(
        "meta-llama/llama-3.3-70b-instruct",
        [{ role: "system", content: systemPromptWithRag }, ...messagesParam],
        onToken,
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(
        `⚡ Streamed response live via OpenRouter LLaMA 3.3 70B (~0.3s TTFB).`,
      );
    } catch (error) {
      logger.error(
        "OpenRouter stream pool failed, falling back to Anthropic stream:",
        error,
      );
      selectedProvider = "claude";
    }
  }

  // Attempt 4: Anthropic Claude Stream
  if (
    !executionSuccess &&
    (selectedProvider === "claude" || keyRotator.hasAnthropicKeys())
  ) {
    try {
      const anthropicMessages = conversationMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content || "",
      }));
      anthropicMessages.push({ role: "user" as const, content: userMessage });

      const result = await keyRotator.executeAnthropicStream(
        "claude-3-5-sonnet-20241022",
        systemPromptWithRag,
        anthropicMessages,
        onToken,
        850,
      );
      finalReply = result.content;
      estimatedTokens = result.tokensUsed;
      executionSuccess = true;
      thoughts.push(
        `⚡ Streamed response live via Anthropic Claude 3.5 Sonnet (~0.4s TTFB).`,
      );
    } catch (error) {
      logger.error("Anthropic stream pool failed:", error);
      selectedProvider = "fallback";
    }
  }

  // Fallback to local DB search
  if (selectedProvider === "fallback" || !finalReply) {
    const searchRes = await searchProductsTool(
      merchantId,
      userMessage,
      undefined,
      5,
    );
    retrievedProducts = searchRes;
    if (searchRes.length > 0) {
      finalReply = `Here are some products matching "${userMessage}":`;
    } else {
      if (botMode === "support" || template === "Customer Support") {
        finalReply = `I am here to assist with questions about our company, services, and projects.`;
      } else if (botMode === "sales") {
        finalReply = `Welcome! How can I assist you with our services and projects today?`;
      } else {
        finalReply = `Welcome! How can I help you explore our website today?`;
      }
    }
    onToken(finalReply);
  }

  return {
    finalReply,
    estimatedTokens,
    thoughts,
    retrievedProducts,
  };
}
