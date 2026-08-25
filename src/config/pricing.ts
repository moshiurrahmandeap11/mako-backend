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

export function getBillingPeriodStart(merchant: {
  planTier: string;
  createdAt?: Date;
  subscriptionStart?: Date | null;
}): Date | null {
  const normalized = (merchant.planTier || 'FREE').toUpperCase();

  // FREE plan is 1500 credits lifetime (no start date boundary, count all lifetime messages)
  if (normalized === 'FREE') {
    return null;
  }

  // For paid plans: calculate start date of current rolling monthly billing cycle
  const anchorDate = merchant.subscriptionStart || merchant.createdAt || new Date();
  const now = new Date();

  // Start with anchorDate's day of month in current month
  let cycleStart = new Date(now.getFullYear(), now.getMonth(), anchorDate.getDate());

  // If current date is before this month's anchor date, cycle started last month
  if (now < cycleStart) {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, anchorDate.getDate());
  }

  return cycleStart;
}
