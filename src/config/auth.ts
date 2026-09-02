import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { sendOtpEmail } from "../utils/email";
import { prisma } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL || "https://mako-frontend.vercel.app/api/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        await sendOtpEmail({ to: email, otp, type });
      },
      sendVerificationOnSignUp: true,
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),
  ],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
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
                primaryColor: "#111111",
                greetingMessage: "Hi! How can I help you shop today?",
                botName: "AI Assistant",
                position: "bottom-right",
                addToCartEnabled: true,
              },
            });
          } catch (err) {
            console.error(
              "Failed to create default widget config on user creation:",
              err,
            );
          }
        },
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  trustedOrigins: [
    env.FRONTEND_URL,
    "https://labtoai.com",
    "https://www.labtoai.com",
    "https://api.labtoai.com",
    "https://mako-frontend.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3005",
    "http://127.0.0.1:3005",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ].filter(Boolean),
  secret:
    env.BETTER_AUTH_SECRET ||
    env.JWT_SECRET ||
    "fallback_jwt_secret_dev_key_32chars_min",
});
