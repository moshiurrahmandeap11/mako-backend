export enum PlanTier {
  FREE = "FREE",
  STARTER = "STARTER",
  PRO = "PRO",
  ENTERPRISE = "ENTERPRISE",
}

export interface Merchant {
  id: string;
  name: string;
  email: string;
  allowedDomains: string[];
  planTier: PlanTier;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  merchantId: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  merchantId: string;
  externalId: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  category?: string;
  inStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetConfig {
  id: string;
  merchantId: string;
  primaryColor: string;
  greetingMessage: string;
  botName: string;
  position: "bottom-right" | "bottom-left";
  addToCartEnabled: boolean;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: any;
  createdAt?: string;
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

export interface CartAction {
  productId: string;
  quantity: number;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  products?: ProductCard[];
  cartAction?: CartAction;
}
