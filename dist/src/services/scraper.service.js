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
    logger_1.logger.info(`Scraper: Starting deep web crawl for merchant ${merchantId} on ${targetUrl}`);
    // Clear old knowledge chunks for this merchant to prevent duplicates and keep data fresh
    try {
        await db_1.prisma.$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE "merchantId" = $1`, merchantId);
    }
    catch (err) {
        logger_1.logger.error('Failed to clear old knowledge chunks:', err);
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    }
    catch (err) {
        throw new Error(`Invalid target URL: ${targetUrl}`);
    }
    const visitedUrls = new Set();
    const queue = [parsedUrl.href];
    const maxPages = 50;
    const allProductsFound = [];
    let totalIndexedProducts = 0;
    let totalKnowledgeChunks = 0;
    let mainPageTitle = parsedUrl.hostname;
    let mainMarkdown = '';
    while (queue.length > 0 && visitedUrls.size < maxPages) {
        const currentUrlStr = queue.shift();
        if (visitedUrls.has(currentUrlStr))
            continue;
        visitedUrls.add(currentUrlStr);
        try {
            logger_1.logger.info(`Scraping page: ${currentUrlStr}`);
            const response = await fetch(currentUrlStr, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Shopping-Scraper/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            if (!response.ok)
                continue;
            const html = await response.text();
            const $ = cheerio.load(html);
            const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || new URL(currentUrlStr).pathname;
            const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
            const ogImage = $('meta[property="og:image"]').attr('content') || '';
            if (currentUrlStr === parsedUrl.href) {
                mainPageTitle = pageTitle;
            }
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
                            const productUrl = item.url ? new URL(item.url, parsedUrl.origin).href : currentUrlStr;
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
                    // Ignore JSON parse errors
                }
            });
            // 2. Fallback micro-data HTML extraction
            if (productsFound.length === 0) {
                $('.product-card, .product-item, .grid-item, [itemtype*="Product"]').each((idx, el) => {
                    const card = $(el);
                    const title = card.find('.product-title, .title, h2, h3, [itemprop="name"]').first().text().trim();
                    const link = card.find('a').first().attr('href');
                    const img = card.find('img').first().attr('src') || card.find('img').first().attr('data-src');
                    const priceText = card.find('.price, [itemprop="price"]').first().text().trim();
                    const numericPrice = parseFloat(priceText.replace(/[^0.0-9.]/g, '')) || 0;
                    if (title && (link || img)) {
                        const fullUrl = link ? new URL(link, parsedUrl.origin).href : currentUrlStr;
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
            // 3. Extract Knowledge Markdown
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
            const markdownContent = `# ${pageTitle}\n\nURL: ${currentUrlStr}\n${metaDescription ? `Description: ${metaDescription}\n\n` : ''}${headings.join('\n')}\n\n${paragraphs.join('\n\n')}`;
            if (currentUrlStr === parsedUrl.href)
                mainMarkdown = markdownContent;
            // Split markdown into chunks (approx 500 chars) and save to KnowledgeChunk
            let currentChunk = '';
            const elementsToChunk = [...headings, ...paragraphs];
            for (const el of elementsToChunk) {
                currentChunk += el + '\n\n';
                if (currentChunk.length >= 500) {
                    const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                    const kChunk = await db_1.prisma.knowledgeChunk.create({
                        data: { merchantId, url: currentUrlStr, content: currentChunk.trim() }
                    });
                    await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(',')}]`, kChunk.id);
                    totalKnowledgeChunks++;
                    currentChunk = '';
                }
            }
            if (currentChunk.trim().length > 0) {
                const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                const kChunk = await db_1.prisma.knowledgeChunk.create({
                    data: { merchantId, url: currentUrlStr, content: currentChunk.trim() }
                });
                await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(',')}]`, kChunk.id);
                totalKnowledgeChunks++;
            }
            // 4. Index Products
            for (const prod of productsFound) {
                allProductsFound.push(prod);
                try {
                    const contentToEmbed = `Product: ${prod.title}. Category: ${prod.category}. Price: $${prod.price} ${prod.currency}. Description: ${prod.description}`;
                    const embedding = await (0, embeddings_1.generateEmbedding)(contentToEmbed);
                    const savedProduct = await db_1.prisma.product.upsert({
                        where: {
                            merchantId_externalId: { merchantId, externalId: prod.externalId },
                        },
                        create: {
                            merchantId, externalId: prod.externalId, title: prod.title,
                            description: prod.description, price: prod.price, currency: prod.currency,
                            imageUrl: prod.imageUrl, productUrl: prod.productUrl, category: prod.category, inStock: prod.inStock,
                        },
                        update: {
                            title: prod.title, description: prod.description, price: prod.price, currency: prod.currency,
                            imageUrl: prod.imageUrl, productUrl: prod.productUrl, category: prod.category, inStock: prod.inStock,
                        },
                    });
                    const vectorStr = `[${embedding.join(',')}]`;
                    await db_1.prisma.$executeRawUnsafe(`UPDATE "Product" SET embedding = $1::vector WHERE id = $2`, vectorStr, savedProduct.id).catch(() => { });
                    totalIndexedProducts++;
                }
                catch (err) {
                    logger_1.logger.error(`Scraper: Failed to index product ${prod.title}:`, err);
                }
            }
            // 5. Extract links for deep crawling
            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (href) {
                    try {
                        const newUrl = new URL(href, parsedUrl.origin);
                        if (newUrl.hostname === parsedUrl.hostname) {
                            newUrl.hash = ''; // strip hash for dedup
                            if (!visitedUrls.has(newUrl.href) && !queue.includes(newUrl.href)) {
                                queue.push(newUrl.href);
                            }
                        }
                    }
                    catch { /* ignore invalid URLs */ }
                }
            });
        }
        catch (err) {
            logger_1.logger.error(`Failed to process ${currentUrlStr}:`, err);
        }
    }
    logger_1.logger.info(`Scraper: Deep crawl complete. Visited ${visitedUrls.size} pages. Indexed ${totalIndexedProducts} products and ${totalKnowledgeChunks} knowledge chunks.`);
    return {
        url: parsedUrl.href,
        pageTitle: mainPageTitle,
        productsFound: allProductsFound,
        markdownContent: mainMarkdown,
        indexedCount: totalIndexedProducts,
    };
}
