"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWebsite = scrapeWebsite;
const cheerio = __importStar(require("cheerio"));
const db_1 = require("../config/db");
const embeddings_1 = require("../utils/embeddings");
const logger_1 = require("../utils/logger");
async function scrapeWebsite(targetUrl, merchantId) {
    logger_1.logger.info(`Scraper: Starting web crawl for merchant ${merchantId} on ${targetUrl}`);
    // Normalize URL
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    }
    catch (err) {
        throw new Error(`Invalid target URL: ${targetUrl}`);
    }
    const response = await fetch(parsedUrl.href, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AI-Shopping-Scraper/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${parsedUrl.href}: HTTP ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || parsedUrl.hostname;
    const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const productsFound = [];
    // 1. Check for JSON-LD structured product metadata
    $('script[type="application/ld+json"]').each((_, element) => {
        try {
            const jsonText = $(element).html();
            if (!jsonText)
                return;
            const data = JSON.parse(jsonText);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (item['@type'] === 'Product' || item['@type'] === 'http://schema.org/Product') {
                    const title = item.name || pageTitle;
                    const description = item.description || metaDescription || title;
                    const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers || {};
                    const price = parseFloat(offer.price || offer.lowPrice || '0') || 0;
                    const currency = offer.priceCurrency || 'USD';
                    const imageUrl = Array.isArray(item.image) ? item.image[0] : item.image || ogImage || '';
                    const productUrl = item.url ? new URL(item.url, parsedUrl.origin).href : parsedUrl.href;
                    const category = item.category || 'General';
                    const sku = item.sku || item.mpn || `SCRAPE-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
                    productsFound.push({
                        externalId: String(sku),
                        title: String(title).trim(),
                        description: String(description).trim(),
                        price,
                        currency,
                        imageUrl: String(imageUrl),
                        productUrl: String(productUrl),
                        category: String(category),
                        inStock: true,
                    });
                }
            }
        }
        catch {
            // Ignore JSON parse errors for non-product structured data
        }
    });
    // 2. Fallback micro-data / HTML DOM product card extraction if JSON-LD missing
    if (productsFound.length === 0) {
        $('.product-card, .product-item, .grid-item, [itemtype*="Product"]').each((idx, el) => {
            const card = $(el);
            const title = card.find('.product-title, .title, h2, h3, [itemprop="name"]').first().text().trim();
            const link = card.find('a').first().attr('href');
            const img = card.find('img').first().attr('src') || card.find('img').first().attr('data-src');
            const priceText = card.find('.price, [itemprop="price"]').first().text().trim();
            const numericPrice = parseFloat(priceText.replace(/[^0.0-9.]/g, '')) || 0;
            if (title && (link || img)) {
                const fullUrl = link ? new URL(link, parsedUrl.origin).href : parsedUrl.href;
                const fullImg = img ? new URL(img, parsedUrl.origin).href : ogImage;
                productsFound.push({
                    externalId: `DOM-PROD-${idx + 1}-${Date.now()}`,
                    title,
                    description: `${title} - Available on ${parsedUrl.hostname}`,
                    price: numericPrice,
                    currency: 'USD',
                    imageUrl: fullImg,
                    productUrl: fullUrl,
                    category: 'Store Item',
                    inStock: true,
                });
            }
        });
    }
    // 3. Convert page HTML into clean Markdown content for store background knowledge
    const headings = [];
    $('h1, h2, h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text)
            headings.push(`### ${text}`);
    });
    const paragraphs = [];
    $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 20)
            paragraphs.push(text);
    });
    const markdownContent = `# ${pageTitle}\n\nURL: ${parsedUrl.href}\n${metaDescription ? `Description: ${metaDescription}\n\n` : ''}${headings.join('\n')}\n\n${paragraphs.slice(0, 15).join('\n\n')}`;
    // 4. Index products into PostgreSQL database with vector embeddings
    let indexedCount = 0;
    for (const prod of productsFound) {
        try {
            const contentToEmbed = `Product: ${prod.title}. Category: ${prod.category}. Price: $${prod.price} ${prod.currency}. Description: ${prod.description}`;
            const embedding = await (0, embeddings_1.generateEmbedding)(contentToEmbed);
            const savedProduct = await db_1.prisma.product.upsert({
                where: {
                    merchantId_externalId: {
                        merchantId,
                        externalId: prod.externalId,
                    },
                },
                create: {
                    merchantId,
                    externalId: prod.externalId,
                    title: prod.title,
                    description: prod.description,
                    price: prod.price,
                    currency: prod.currency,
                    imageUrl: prod.imageUrl,
                    productUrl: prod.productUrl,
                    category: prod.category,
                    inStock: prod.inStock,
                },
                update: {
                    title: prod.title,
                    description: prod.description,
                    price: prod.price,
                    currency: prod.currency,
                    imageUrl: prod.imageUrl,
                    productUrl: prod.productUrl,
                    category: prod.category,
                    inStock: prod.inStock,
                },
            });
            // Save vector embedding if column exists
            const vectorStr = `[${embedding.join(',')}]`;
            await db_1.prisma.$executeRawUnsafe(`UPDATE "Product" SET embedding = $1::vector WHERE id = $2`, vectorStr, savedProduct.id).catch(() => { });
            indexedCount++;
        }
        catch (err) {
            logger_1.logger.error(`Scraper: Failed to index product ${prod.title}:`, err);
        }
    }
    logger_1.logger.info(`Scraper: Complete. Found ${productsFound.length} items, indexed ${indexedCount} products for ${parsedUrl.hostname}`);
    return {
        url: parsedUrl.href,
        pageTitle,
        productsFound,
        markdownContent,
        indexedCount,
    };
}
