"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is not set!');
    process.exit(1);
}
function executeQuery(query) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ query });
        const req = https_1.default.request('https://ep-long-cell-ay5y8og7-pooler.c-5.us-east-2.aws.neon.tech/sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Neon-Connection-String': connectionString,
                'Content-Length': Buffer.byteLength(data),
            },
            family: 4, // Force IPv4
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch (e) {
                        resolve(body);
                    }
                }
                else {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
    });
}
async function setupSchema() {
    console.log('Connecting to Neon Database via HTTPS with forced IPv4...');
    // 1. Enable pgvector
    await executeQuery('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✔ pgvector extension enabled');
    // 2. Create Enum PlanTier
    await executeQuery(`
    DO $$ BEGIN
        CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);
    console.log('✔ PlanTier enum created');
    // 3. Create Merchant table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "Merchant" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "planTier" "PlanTier" NOT NULL DEFAULT 'FREE'::"PlanTier",
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ Merchant table created');
    // 4. Create ApiKey table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "ApiKey" (
        "id" TEXT NOT NULL,
        "merchantId" TEXT NOT NULL,
        "keyPrefix" TEXT NOT NULL,
        "hashedKey" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastUsedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ ApiKey table created');
    // 5. Create Product table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "Product" (
        "id" TEXT NOT NULL,
        "merchantId" TEXT NOT NULL,
        "externalId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "price" DECIMAL(10,2) NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'USD',
        "imageUrl" TEXT,
        "productUrl" TEXT NOT NULL,
        "category" TEXT,
        "inStock" BOOLEAN NOT NULL DEFAULT true,
        "embedding" vector(1536),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ Product table created');
    // 6. Create WidgetConfig table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "WidgetConfig" (
        "id" TEXT NOT NULL,
        "merchantId" TEXT NOT NULL,
        "primaryColor" TEXT NOT NULL DEFAULT '#111111',
        "greetingMessage" TEXT NOT NULL DEFAULT 'Hi! How can I help you shop today?',
        "botName" TEXT NOT NULL DEFAULT 'Shop Assistant',
        "position" TEXT NOT NULL DEFAULT 'bottom-right',
        "addToCartEnabled" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "WidgetConfig_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ WidgetConfig table created');
    // 7. Create Conversation table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "Conversation" (
        "id" TEXT NOT NULL,
        "merchantId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ Conversation table created');
    // 8. Create Message table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "Message" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "toolCalls" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ Message table created');
    // 9. Create KnowledgeChunk table
    await executeQuery(`
    CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
        "id" TEXT NOT NULL,
        "merchantId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "embedding" vector(1536),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
    );
  `);
    console.log('✔ KnowledgeChunk table created');
    // 10. Indexes
    await executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS "Merchant_email_key" ON "Merchant"("email");');
    await executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");');
    await executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS "Product_merchantId_externalId_key" ON "Product"("merchantId", "externalId");');
    await executeQuery('CREATE UNIQUE INDEX IF NOT EXISTS "WidgetConfig_merchantId_key" ON "WidgetConfig"("merchantId");');
    await executeQuery('CREATE INDEX IF NOT EXISTS "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");');
    await executeQuery('CREATE INDEX IF NOT EXISTS "Product_merchantId_idx" ON "Product"("merchantId");');
    await executeQuery('CREATE INDEX IF NOT EXISTS "Conversation_merchantId_sessionId_idx" ON "Conversation"("merchantId", "sessionId");');
    await executeQuery('CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");');
    await executeQuery('CREATE INDEX IF NOT EXISTS "KnowledgeChunk_merchantId_idx" ON "KnowledgeChunk"("merchantId");');
    console.log('✔ Indexes created');
    console.log('🚀 ALL TABLES PROVISIONED SUCCESSFULLY ON NEON DB!');
}
setupSchema().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
