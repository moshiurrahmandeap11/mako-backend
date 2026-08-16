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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSafeUrl = isSafeUrl;
exports.scrapeWebsite = scrapeWebsite;
exports.scrapeSingleUrl = scrapeSingleUrl;
exports.addManualKnowledgeChunk = addManualKnowledgeChunk;
const cheerio = __importStar(require("cheerio"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const db_1 = require("../config/db");
const embeddings_1 = require("../utils/embeddings");
const logger_1 = require("../utils/logger");
function isSafeUrl(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
    }
    const hostname = url.hostname.toLowerCase();
    // Reject local and private hostnames
    if (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.lan')) {
        return false;
    }
    // Reject private and link-local IPv4 ranges
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname))
        return false;
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname))
        return false;
    if (/^192\.168\.\d+\.\d+$/.test(hostname))
        return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(hostname))
        return false;
    if (/^169\.254\.\d+\.\d+$/.test(hostname))
        return false; // Cloud metadata IP
    return true;
}
/**
 * Fetch and extract sitemap declarations from robots.txt
 */
async function fetchRobotsSitemaps(origin) {
    const sitemapUrls = [];
    try {
        const robotsUrl = `${origin}/robots.txt`;
        const res = await fetch(robotsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)' },
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const text = await res.text();
            const matches = text.matchAll(/Sitemap:\s*(https?:\/\/[^\s\r\n]+)/gi);
            for (const m of matches) {
                if (m[1])
                    sitemapUrls.push(m[1].trim());
            }
        }
    }
    catch {
        // robots.txt optional
    }
    return sitemapUrls;
}
/**
 * Recursively parse sitemap XML or sitemap index files for page and product URLs
 */
async function fetchSitemapUrls(sitemapUrl, maxDepth = 2, visitedSitemaps = new Set()) {
    if (maxDepth <= 0 || visitedSitemaps.has(sitemapUrl))
        return [];
    visitedSitemaps.add(sitemapUrl);
    const discoveredUrls = [];
    try {
        const res = await fetch(sitemapUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)',
                'Accept': 'application/xml,text/xml,*/*',
            },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok)
            return [];
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        // Check for nested sitemaps in <sitemapindex>
        const subSitemaps = [];
        $('sitemap > loc').each((_, el) => {
            const loc = $(el).text().trim();
            if (loc)
                subSitemaps.push(loc);
        });
        for (const sub of subSitemaps.slice(0, 10)) {
            const subUrls = await fetchSitemapUrls(sub, maxDepth - 1, visitedSitemaps);
            discoveredUrls.push(...subUrls);
        }
        // Check for URLs in <urlset>
        $('url > loc').each((_, el) => {
            const loc = $(el).text().trim();
            if (loc && (loc.startsWith('http://') || loc.startsWith('https://'))) {
                discoveredUrls.push(loc);
            }
        });
    }
    catch (e) {
        logger_1.logger.debug(`Optional sitemap check failed for ${sitemapUrl}`);
    }
    return discoveredUrls;
}
/**
 * Discover all potential sitemaps from robots.txt and standard locations
 */
async function discoverAllSitemapUrls(origin) {
    const candidateSitemaps = new Set();
    // 1. Check robots.txt declared sitemaps
    const robotsSitemaps = await fetchRobotsSitemaps(origin);
    robotsSitemaps.forEach(s => candidateSitemaps.add(s));
    // 2. Common framework and CMS sitemap locations
    const standardLocations = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/wp-sitemap.xml`,
        `${origin}/sitemap_products_1.xml`,
        `${origin}/sitemap_pages_1.xml`,
    ];
    standardLocations.forEach(loc => candidateSitemaps.add(loc));
    const allFoundUrls = [];
    const visitedSitemaps = new Set();
    for (const sitemap of candidateSitemaps) {
        try {
            const urls = await fetchSitemapUrls(sitemap, 2, visitedSitemaps);
            allFoundUrls.push(...urls);
        }
        catch { }
    }
    return Array.from(new Set(allFoundUrls));
}
/**
 * Extract dynamic SPA / Next.js / React / Vue internal route links from HTML and script tags
 */
function extractSpaRoutes(html, baseUrl) {
    const discoveredRoutes = new Set();
    const origin = baseUrl.origin;
    // 1. Regular DOM anchors and interactive links
    const $ = cheerio.load(html);
    $('a[href], button[data-href], [data-url], link[rel="canonical"], meta[property="og:url"]').each((_, el) => {
        const href = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('content');
        if (href && typeof href === 'string') {
            const trimmed = href.trim();
            if (!trimmed.startsWith('#') &&
                !trimmed.startsWith('javascript:') &&
                !trimmed.startsWith('mailto:') &&
                !trimmed.startsWith('tel:')) {
                try {
                    const fullUrl = new URL(trimmed, origin);
                    if (fullUrl.hostname === baseUrl.hostname) {
                        fullUrl.hash = '';
                        discoveredRoutes.add(fullUrl.href);
                    }
                }
                catch { }
            }
        }
    });
    // 2. SPA Embedded Router & Script Payload Scanner
    // Matches internal paths like /projects/slug, /products/item, /casestudies/case, /services/name, etc.
    const pathRegex = /(?:"|'|`|\/)(?:projects|products|services|casestudies|case-studies|portfolio|pricing|about|contact|shop|collection|blogs?|work|features|solutions)\/([a-zA-Z0-9_\-\/]{2,60})(?:"|'|`)/g;
    const matches = html.matchAll(pathRegex);
    for (const m of matches) {
        if (m[0]) {
            const cleanPath = m[0].replace(/["'`]/g, '');
            const formattedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
            try {
                const fullUrl = new URL(formattedPath, origin);
                if (fullUrl.hostname === baseUrl.hostname) {
                    discoveredRoutes.add(fullUrl.href);
                }
            }
            catch { }
        }
    }
    // 3. Next.js App Router Page Manifest & __NEXT_DATA__ scanning
    $('script').each((_, el) => {
        const scriptContent = $(el).html() || '';
        if (scriptContent.includes('__NEXT_DATA__') || scriptContent.includes('self.__next_f') || scriptContent.includes('/_next/')) {
            const routeMatches = scriptContent.matchAll(/"(\/(?:projects|products|casestudies|services|pricing|about|contact)[^"\\?#]+)"/g);
            for (const rm of routeMatches) {
                if (rm[1] && !rm[1].includes('.js') && !rm[1].includes('.css')) {
                    try {
                        const fullUrl = new URL(rm[1], origin);
                        if (fullUrl.hostname === baseUrl.hostname) {
                            discoveredRoutes.add(fullUrl.href);
                        }
                    }
                    catch { }
                }
            }
        }
    });
    return Array.from(discoveredRoutes);
}
/**
 * Indexes a single page's markdown and structured items into KnowledgeChunk and Product
 */
async function indexPageContent(currentUrlStr, html, merchantId, origin, isMainDomain = false) {
    const $ = cheerio.load(html);
    const pageTitle = $('title').text().trim() ||
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        new URL(currentUrlStr).pathname;
    const metaDescription = $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        '';
    const ogImage = $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        '';
    const productsFound = [];
    // 1. JSON-LD structured product metadata
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
                    const productUrl = item.url ? new URL(item.url, origin).href : currentUrlStr;
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
        catch { }
    });
    // 2. DOM Product / Portfolio Card extraction
    if (productsFound.length === 0) {
        $('.product-card, .product-item, .grid-item, [itemtype*="Product"], .project-card, article').each((idx, el) => {
            const card = $(el);
            const title = card.find('.product-title, .title, h2, h3, h4, [itemprop="name"]').first().text().trim();
            const link = card.find('a').first().attr('href');
            const img = card.find('img').first().attr('src') || card.find('img').first().attr('data-src');
            const priceText = card.find('.price, [itemprop="price"]').first().text().trim();
            const numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            if (title && title.length > 2 && (link || img)) {
                const fullUrl = link ? new URL(link, origin).href : currentUrlStr;
                const fullImg = img ? new URL(img, origin).href : ogImage;
                productsFound.push({
                    externalId: `DOM-${idx + 1}-${Buffer.from(title).toString('hex').slice(0, 10)}`,
                    title,
                    description: `${title} - Details available at ${fullUrl}`,
                    price: numericPrice,
                    currency: 'USD',
                    imageUrl: fullImg,
                    productUrl: fullUrl,
                    category: 'Showcase & Products',
                    inStock: true,
                });
            }
        });
    }
    // 3. Extract Knowledge Headings, Paragraphs, and Clickable Links
    const headings = [];
    $('h1, h2, h3, h4').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text && text.length > 2)
            headings.push(`### ${text}`);
    });
    const paragraphs = [];
    $('p, li, blockquote, [data-description]').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text && text.length > 15)
            paragraphs.push(text);
    });
    const pageLinksSet = new Set();
    $('a').each((_, el) => {
        const linkText = $(el).text().trim().replace(/\s+/g, ' ');
        const href = $(el).attr('href');
        if (linkText && href && linkText.length > 1 && !href.startsWith('#') && !href.startsWith('javascript:')) {
            try {
                const fullUrl = new URL(href, currentUrlStr).href;
                pageLinksSet.add(`- [${linkText}](${fullUrl})`);
            }
            catch { }
        }
    });
    const pageLinks = Array.from(pageLinksSet).slice(0, 35);
    const headerPrefix = `# Page Title: ${pageTitle}\nPage URL: ${currentUrlStr}\n${metaDescription ? `Description: ${metaDescription}\n` : ''}`;
    const linksSection = pageLinks.length > 0 ? `\n\n### Page Links & Navigation:\n${pageLinks.join('\n')}` : '';
    const pageMarkdown = `${headerPrefix}\n\n${headings.join('\n')}\n\n${paragraphs.slice(0, 20).join('\n\n')}${linksSection}`;
    // 4. Save structured chunks to KnowledgeChunk with vector embeddings
    let chunksCreated = 0;
    let currentChunk = `${headerPrefix}\n\n`;
    const elementsToChunk = [...headings, ...paragraphs.slice(0, 25), ...pageLinks];
    for (const el of elementsToChunk) {
        currentChunk += el + '\n\n';
        if (currentChunk.length >= 650) {
            try {
                const kChunk = await db_1.prisma.knowledgeChunk.create({
                    data: { merchantId, url: currentUrlStr, content: currentChunk.trim() },
                });
                chunksCreated++;
                try {
                    const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                    if (emb && emb.some((v) => v !== 0)) {
                        await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(',')}]`, kChunk.id);
                    }
                }
                catch { }
            }
            catch (err) {
                logger_1.logger.error(`KnowledgeChunk creation error on ${currentUrlStr}:`, err);
            }
            currentChunk = `${headerPrefix}\n\n`;
        }
    }
    if (currentChunk.trim().length > headerPrefix.length + 15) {
        try {
            const kChunk = await db_1.prisma.knowledgeChunk.create({
                data: { merchantId, url: currentUrlStr, content: currentChunk.trim() },
            });
            chunksCreated++;
            try {
                const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                if (emb && emb.some((v) => v !== 0)) {
                    await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(',')}]`, kChunk.id);
                }
            }
            catch { }
        }
        catch (err) {
            logger_1.logger.error(`KnowledgeChunk final chunk creation error on ${currentUrlStr}:`, err);
        }
    }
    // 5. Upsert discovered products
    for (const prod of productsFound) {
        try {
            const contentToEmbed = `Product/Project: ${prod.title}. Category: ${prod.category}. Price: $${prod.price} ${prod.currency}. Link: ${prod.productUrl}. Description: ${prod.description}`;
            const embedding = await (0, embeddings_1.generateEmbedding)(contentToEmbed);
            const savedProduct = await db_1.prisma.product.upsert({
                where: {
                    merchantId_externalId: { merchantId, externalId: prod.externalId },
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
            const vectorStr = `[${embedding.join(',')}]`;
            await db_1.prisma.$executeRawUnsafe(`UPDATE "Product" SET embedding = $1::vector WHERE id = $2`, vectorStr, savedProduct.id).catch(() => { });
        }
        catch (err) {
            logger_1.logger.error(`Scraper: Failed to index product ${prod.title}:`, err);
        }
    }
    return {
        products: productsFound,
        chunksCount: chunksCreated,
        pageTitle,
        pageMarkdown,
    };
}
/**
 * Headless Browser SPA Hydration (Smart Puppeteer Scraper)
 * Used when a modern client-rendered SPA (Next.js, React, Vue) has missing or client-rendered DOM.
 */
async function fetchRenderedHtmlWithPuppeteer(url) {
    let browser = null;
    try {
        logger_1.logger.info(`[Puppeteer] Launching lightweight headless browser for SPA rendering on ${url}`);
        browser = await puppeteer_1.default.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0');
        // Save memory & speed up crawl by blocking images, media, stylesheets, and fonts
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'media', 'font'].includes(type)) {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        // Brief sleep for React/Next.js hydration
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const content = await page.content();
        if (content.includes("This page couldn’t load") || content.includes("This page couldn't load")) {
            logger_1.logger.warn(`[Puppeteer] Page rendered WebGL fallback error, preserving static HTML`);
            return '';
        }
        logger_1.logger.info(`[Puppeteer] Rendered SPA HTML successfully (${content.length} bytes) for ${url}`);
        return content;
    }
    catch (err) {
        logger_1.logger.warn(`[Puppeteer] Headless render skipped or failed on ${url}: ${err?.message || err}`);
        return '';
    }
    finally {
        if (browser) {
            try {
                await browser.close();
            }
            catch { }
        }
    }
}
/**
 * Main Full Hybrid Web Crawler
 */
async function scrapeWebsite(targetUrl, merchantId) {
    logger_1.logger.info(`Scraper: Starting 4-tier hybrid web crawl for merchant ${merchantId} on ${targetUrl}`);
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    }
    catch (err) {
        throw new Error(`Invalid target URL: ${targetUrl}`);
    }
    if (!isSafeUrl(parsedUrl)) {
        throw new Error(`Target URL '${targetUrl}' is invalid or resolves to a restricted/private network address.`);
    }
    // Clear old knowledge chunks for this merchant to maintain clean fresh data
    try {
        await db_1.prisma.$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE "merchantId" = $1`, merchantId);
    }
    catch (err) {
        logger_1.logger.error('Failed to clear old knowledge chunks:', err);
    }
    const visitedUrls = new Set();
    const queue = [parsedUrl.href];
    const maxPages = 40;
    // ── Tier 1 & Tier 2: Opportunistic Sitemaps & robots.txt Discovery ──
    try {
        const sitemapUrls = await discoverAllSitemapUrls(parsedUrl.origin);
        for (const url of sitemapUrls) {
            try {
                const u = new URL(url);
                if (u.hostname === parsedUrl.hostname && !visitedUrls.has(u.href) && !queue.includes(u.href)) {
                    queue.push(u.href);
                }
            }
            catch { }
        }
        logger_1.logger.info(`Scraper: Sitemap/robots discovery found ${sitemapUrls.length} potential URLs`);
    }
    catch (err) {
        logger_1.logger.debug('Sitemap discovery skipped or unavailable');
    }
    const allProductsFound = [];
    let totalKnowledgeChunks = 0;
    let mainPageTitle = parsedUrl.hostname;
    let mainMarkdown = '';
    // ── Tier 3 & Tier 4: Recursive Deep DOM & SPA Route Crawler ──
    while (queue.length > 0 && visitedUrls.size < maxPages) {
        const currentUrlStr = queue.shift();
        if (visitedUrls.has(currentUrlStr))
            continue;
        visitedUrls.add(currentUrlStr);
        try {
            const currentUrlObj = new URL(currentUrlStr);
            if (!isSafeUrl(currentUrlObj))
                continue;
            logger_1.logger.info(`Scraping page: ${currentUrlStr}`);
            const response = await fetch(currentUrlStr, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                },
                signal: AbortSignal.timeout(10000), // 10s timeout per page
            });
            if (!response.ok)
                continue;
            let html = await response.text();
            // Detect Client-Side React/Next.js SPA or SSR Bailout
            const isSpaBailout = html.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING') ||
                html.includes('data-dgst="BAILOUT') ||
                (html.includes('id="__next"') && html.length < 2500) ||
                (html.includes('id="root"') && html.length < 1500);
            if (isSpaBailout) {
                logger_1.logger.info(`[Scraper] SPA / Client-Side Rendering detected on ${currentUrlStr}. Running Headless Hydration...`);
                const hydratedHtml = await fetchRenderedHtmlWithPuppeteer(currentUrlStr);
                if (hydratedHtml && hydratedHtml.length > html.length) {
                    html = hydratedHtml;
                }
            }
            // Index current page content
            const { products, chunksCount, pageTitle, pageMarkdown } = await indexPageContent(currentUrlStr, html, merchantId, parsedUrl.origin, currentUrlStr === parsedUrl.href);
            if (currentUrlStr === parsedUrl.href) {
                mainPageTitle = pageTitle;
                mainMarkdown = pageMarkdown;
            }
            allProductsFound.push(...products);
            totalKnowledgeChunks += chunksCount;
            // Extract new internal routes & links dynamically
            const newRoutes = extractSpaRoutes(html, parsedUrl);
            for (const r of newRoutes) {
                if (!visitedUrls.has(r) && !queue.includes(r) && queue.length < 100) {
                    queue.push(r);
                }
            }
        }
        catch (err) {
            logger_1.logger.error(`Failed to process ${currentUrlStr}:`, err);
        }
    }
    logger_1.logger.info(`Scraper: Complete! Crawled ${visitedUrls.size} pages. Indexed ${allProductsFound.length} items and ${totalKnowledgeChunks} knowledge chunks.`);
    return {
        url: parsedUrl.href,
        pageTitle: mainPageTitle,
        productsFound: allProductsFound,
        markdownContent: mainMarkdown,
        indexedCount: allProductsFound.length,
        pagesCrawledCount: visitedUrls.size,
        knowledgeChunksCount: totalKnowledgeChunks,
    };
}
/**
 * Scrapes and indexes a specific single URL on demand
 */
async function scrapeSingleUrl(targetUrl, merchantId) {
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    }
    catch {
        throw new Error(`Invalid URL: ${targetUrl}`);
    }
    if (!isSafeUrl(parsedUrl)) {
        throw new Error('Target URL resolves to a restricted/private address.');
    }
    // Delete previous chunks from this specific URL
    await db_1.prisma.$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE "merchantId" = $1 AND "url" = $2`, merchantId, parsedUrl.href).catch(() => { });
    const response = await fetch(parsedUrl.href, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LabtoBot/2.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
    }
    let html = await response.text();
    const isSpaBailout = html.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING') ||
        html.includes('data-dgst="BAILOUT') ||
        (html.includes('id="__next"') && html.length < 2500) ||
        (html.includes('id="root"') && html.length < 1500);
    if (isSpaBailout) {
        logger_1.logger.info(`[Scraper] Single URL SPA detected on ${parsedUrl.href}. Hydrating via Puppeteer...`);
        const hydratedHtml = await fetchRenderedHtmlWithPuppeteer(parsedUrl.href);
        if (hydratedHtml && hydratedHtml.length > html.length) {
            html = hydratedHtml;
        }
    }
    return await indexPageContent(parsedUrl.href, html, merchantId, parsedUrl.origin);
}
/**
 * Add a manual custom text/FAQ knowledge chunk
 */
async function addManualKnowledgeChunk(merchantId, title, content, sourceUrl) {
    const formattedContent = `# ${title}\nSource: ${sourceUrl || 'Merchant Dashboard Note'}\n\n${content}`;
    const chunk = await db_1.prisma.knowledgeChunk.create({
        data: {
            merchantId,
            url: sourceUrl || `custom-note-${Date.now()}`,
            content: formattedContent,
        },
    });
    try {
        const emb = await (0, embeddings_1.generateEmbedding)(formattedContent);
        if (emb && emb.some((v) => v !== 0)) {
            await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(',')}]`, chunk.id);
        }
    }
    catch { }
    return chunk;
}
