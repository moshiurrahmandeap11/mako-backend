import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "4000", 10),
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET:
    process.env.JWT_SECRET || "fallback_jwt_secret_dev_key_32chars_min",
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "localhost",
  API_BASE_URL: process.env.API_BASE_URL || "http://localhost:4000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  WIDGET_CDN_URL:
    process.env.WIDGET_CDN_URL || "http://localhost:4000/widget.js",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",

  get ANTHROPIC_API_KEYS(): string[] {
    const raw =
      process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY || "";
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("..."));
  },
  get OPENAI_API_KEYS(): string[] {
    const raw = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || "";
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("..."));
  },
  get OPENROUTER_API_KEYS(): string[] {
    const raw =
      process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "";
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("..."));
  },
  get GROQ_API_KEYS(): string[] {
    const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("..."));
  },
  get GEMINI_API_KEYS(): string[] {
    const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !k.includes("..."));
  },
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  POLAR_SERVER:
    (process.env.POLAR_SERVER as "sandbox" | "production") || "sandbox",
  POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN || "",
  POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET || "",
  POLAR_STARTER_PRODUCT_ID: process.env.POLAR_STARTER_PRODUCT_ID || "",
  POLAR_PRO_PRODUCT_ID: process.env.POLAR_PRO_PRODUCT_ID || "",
  POLAR_STARTER_ONETIME_PRODUCT_ID:
    process.env.POLAR_STARTER_ONETIME_PRODUCT_ID || "",
  POLAR_PRO_ONETIME_PRODUCT_ID: process.env.POLAR_PRO_ONETIME_PRODUCT_ID || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL:
    process.env.BETTER_AUTH_URL || "http://localhost:4000/api/auth",
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "Labto AI Assistant <no-reply@labto.ai>",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
};
