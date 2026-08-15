"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const better_auth_1 = require("better-auth");
const prisma_1 = require("better-auth/adapters/prisma");
const plugins_1 = require("better-auth/plugins");
const db_1 = require("./db");
const env_1 = require("./env");
const email_1 = require("../utils/email");
exports.auth = (0, better_auth_1.betterAuth)({
    database: (0, prisma_1.prismaAdapter)(db_1.prisma, {
        provider: 'postgresql',
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
        (0, plugins_1.emailOTP)({
            async sendVerificationOTP({ email, otp, type }) {
                await (0, email_1.sendOtpEmail)({ to: email, otp, type });
            },
            sendVerificationOnSignUp: true,
            otpLength: 6,
            expiresIn: 300, // 5 minutes
        }),
    ],
    socialProviders: {
        google: {
            clientId: env_1.env.GOOGLE_CLIENT_ID,
            clientSecret: env_1.env.GOOGLE_CLIENT_SECRET,
        },
        github: {
            clientId: env_1.env.GITHUB_CLIENT_ID,
            clientSecret: env_1.env.GITHUB_CLIENT_SECRET,
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    try {
                        // Seed a default widget configuration for new merchants
                        await db_1.prisma.widgetConfig.create({
                            data: {
                                merchantId: user.id,
                                primaryColor: '#111111',
                                greetingMessage: 'Hi! How can I help you shop today?',
                                botName: 'Shop Assistant',
                                position: 'bottom-right',
                                addToCartEnabled: true,
                            },
                        });
                    }
                    catch (err) {
                        console.error('Failed to create default widget config on user creation:', err);
                    }
                },
            },
        },
    },
    advanced: {
        defaultCookieAttributes: {
            sameSite: 'none',
            secure: true,
            httpOnly: true,
        },
    },
    trustedOrigins: [
        env_1.env.FRONTEND_URL,
        'https://mako-frontend.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
    ].filter(Boolean),
    secret: env_1.env.JWT_SECRET || 'fallback_jwt_secret_dev_key_32chars_min',
});
