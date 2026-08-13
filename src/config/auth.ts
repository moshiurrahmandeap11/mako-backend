import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';
import { env } from './env';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            // Seed a default widget configuration for new merchants
            await prisma.widgetConfig.create({
              data: {
                merchantId: user.id,
                primaryColor: '#111111',
                greetingMessage: 'Hi! How can I help you shop today?',
                botName: 'Shop Assistant',
                position: 'bottom-right',
                addToCartEnabled: true,
              },
            });
          } catch (err) {
            console.error('Failed to create default widget config on user creation:', err);
          }
        },
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: process.env.COOKIE_SAME_SITE as any || (env.NODE_ENV === 'production' ? 'none' : 'lax'),
      secure: process.env.COOKIE_SECURE === 'false' ? false : env.NODE_ENV === 'production',
      httpOnly: true,
    },
  },
  trustedOrigins: [
    env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://localhost:3000',
  ].filter(Boolean),
  secret: env.JWT_SECRET || 'fallback_jwt_secret_dev_key_32chars_min',
});
