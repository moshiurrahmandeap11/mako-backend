export interface PlanConfig {
  name: string;
  priceFormatted: string;
  monthlyCredits: number;
  creditsPerMessage: number;
  rolloverEnabled: boolean;
  maxApiKeys: number;
  maxDomains: number;
  hideBranding: boolean;
  prioritySupport: boolean;
}

export const CREDITS_PER_MESSAGE = 20;

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  FREE: {
    name: 'Free',
    priceFormatted: '$0',
    monthlyCredits: 1500, // ~75-100 messages
    creditsPerMessage: CREDITS_PER_MESSAGE,
    rolloverEnabled: false,
    maxApiKeys: 1,
    maxDomains: 1,
    hideBranding: false,
    prioritySupport: false,
  },
  STARTER: {
    name: 'Starter',
    priceFormatted: '$2',
    monthlyCredits: 10000, // ~500 messages
    creditsPerMessage: CREDITS_PER_MESSAGE,
    rolloverEnabled: true,
    maxApiKeys: 2,
    maxDomains: 2,
    hideBranding: false,
    prioritySupport: false,
  },
  PRO: {
    name: 'Pro',
    priceFormatted: '$5',
    monthlyCredits: 30000, // ~1,500 messages
    creditsPerMessage: CREDITS_PER_MESSAGE,
    rolloverEnabled: true,
    maxApiKeys: 4,
    maxDomains: 5,
    hideBranding: true,
    prioritySupport: true,
  },
  ENTERPRISE: {
    name: 'Enterprise',
    priceFormatted: 'Custom',
    monthlyCredits: 999999999, // Unlimited
    creditsPerMessage: CREDITS_PER_MESSAGE,
    rolloverEnabled: true,
    maxApiKeys: 999,
    maxDomains: 999,
    hideBranding: true,
    prioritySupport: true,
  },
};

export function getPlanConfig(tier: string = 'FREE'): PlanConfig {
  const normalized = (tier || 'FREE').toUpperCase();
  return PLAN_CONFIGS[normalized] || PLAN_CONFIGS.FREE;
}
