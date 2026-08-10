export interface WidgetConfig {
  primaryColor: string;
  greetingMessage: string;
  botName: string;
  position: 'bottom-right' | 'bottom-left';
  addToCartEnabled: boolean;
  hideBranding?: boolean;
  eventBridgeEnabled?: boolean;
}

export interface ProductCard {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  inStock: boolean;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  products?: ProductCard[];
  cartAction?: {
    productId: string;
    quantity: number;
  };
}

export class WidgetAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      ...(options.headers || {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async createSession(): Promise<string> {
    const data = await this.fetch<{ sessionId: string }>('/api/widget/session', {
      method: 'POST',
    });
    return data.sessionId;
  }

  async getConfig(): Promise<WidgetConfig> {
    return this.fetch<WidgetConfig>('/api/widget/config', { method: 'GET' });
  }

  async sendMessage(
    sessionId: string,
    message: string,
    botMode?: string,
    provider?: string,
    imageUrl?: string
  ): Promise<ChatResponse> {
    return this.fetch<ChatResponse>('/api/widget/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message, botMode, provider, imageUrl }),
    });
  }

  async pingVisitor(visitorId: string): Promise<any> {
    return this.fetch<any>('/api/widget/ping', {
      method: 'POST',
      body: JSON.stringify({ visitorId }),
    });
  }
}
