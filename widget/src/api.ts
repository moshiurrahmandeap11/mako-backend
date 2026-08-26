export interface WidgetConfig {
  primaryColor: string;
  headerBgColor?: string;
  headerTextColor?: string;
  launcherBgColor?: string;
  launcherIconColor?: string;
  greetingMessage: string;
  botName: string;
  position: "bottom-right" | "bottom-left";
  addToCartEnabled: boolean;
  suggestionChips?: string[];
  hideBranding?: boolean;
  eventBridgeEnabled?: boolean;
  botAvatarUrl?: string;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  title?: string;
  price?: number;
  inStock?: boolean;
  options?: Record<string, string>;
}

export interface ProductCard {
  id: string;
  externalId?: string;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  inStock: boolean;
  options?: ProductOption[];
  variants?: ProductVariant[];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  products?: ProductCard[];
  cartAction?: {
    productId: string;
    quantity: number;
    variantId?: string;
    selectedOptions?: Record<string, string>;
    options?: ProductOption[];
    variants?: ProductVariant[];
  };
  thoughts?: string[];
}

export class WidgetAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      ...(options.headers || {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: "Network response was not ok" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async createSession(): Promise<string> {
    const data = await this.fetch<{ sessionId: string }>(
      "/api/widget/session",
      {
        method: "POST",
      },
    );
    return data.sessionId;
  }

  async getConfig(): Promise<WidgetConfig> {
    return this.fetch<WidgetConfig>("/api/widget/config", { method: "GET" });
  }

  async getHistory(sessionId: string): Promise<{ messages: any[] }> {
    return this.fetch<{ messages: any[] }>(
      `/api/widget/history?sessionId=${encodeURIComponent(sessionId)}`,
      { method: "GET" },
    );
  }

  async sendMessage(
    sessionId: string,
    message: string,
    botMode?: string,
    provider?: string,
    imageUrl?: string,
  ): Promise<ChatResponse> {
    return this.fetch<ChatResponse>("/api/widget/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId, message, botMode, provider, imageUrl }),
    });
  }

  async streamMessage(
    sessionId: string,
    message: string,
    onThought: (thought: string) => void,
    onToken: (token: string) => void,
    onDone: (response: ChatResponse) => void,
    onError: (err: any) => void,
    botMode?: string,
    provider?: string,
    imageUrl?: string,
  ): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/widget/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          sessionId,
          message,
          botMode,
          provider,
          imageUrl,
          stream: true,
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body for streaming");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          const lines = eventBlock.split("\n");
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6).trim();
            }
          }

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === "thought" && parsed.thought) {
                onThought(parsed.thought);
              } else if (eventType === "token" && parsed.token) {
                onToken(parsed.token);
              } else if (eventType === "done") {
                onDone(parsed);
              } else if (eventType === "error") {
                onError(new Error(parsed.error || "Streaming error"));
              }
            } catch (jsonErr) {
              console.error("Failed to parse SSE event:", jsonErr, eventData);
            }
          }
        }
      }
    } catch (err: any) {
      onError(err);
    }
  }

  async pingVisitor(visitorId: string): Promise<any> {
    return this.fetch<any>("/api/widget/ping", {
      method: "POST",
      body: JSON.stringify({ visitorId }),
    });
  }
}
