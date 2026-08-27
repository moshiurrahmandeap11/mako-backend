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
exports.generateDeterministicExternalId = generateDeterministicExternalId;
exports.isSafeUrl = isSafeUrl;
exports.decodeCloudflareEmail = decodeCloudflareEmail;
exports.fetchRenderedHtmlWithPuppeteer = fetchRenderedHtmlWithPuppeteer;
exports.scrapeWebsite = scrapeWebsite;
exports.scrapeSingleUrl = scrapeSingleUrl;
exports.addManualKnowledgeChunk = addManualKnowledgeChunk;
exports.getScrapeStatus = getScrapeStatus;
exports.triggerBackgroundCrawl = triggerBackgroundCrawl;
const cheerio = __importStar(require("cheerio"));
const crypto_1 = __importDefault(require("crypto"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const db_1 = require("../config/db");
const embeddings_1 = require("../utils/embeddings");
const logger_1 = require("../utils/logger");
function generateDeterministicExternalId(productUrl, title, sku) {
    if (sku && String(sku).trim().length > 0 && !/^scrape-/i.test(String(sku))) {
        return String(sku).trim();
    }
    const urlMatch = productUrl.match(/\/product[s]?\/([^\/\?#]+)/i) ||
        productUrl.match(/\/item\/([^\/\?#]+)/i) ||
        productUrl.match(/\/p\/([^\/\?#]+)/i);
    if (urlMatch && urlMatch[1] && urlMatch[1].length > 1) {
        return urlMatch[1].trim();
    }
    const cleanUrl = productUrl.split("?")[0].split("#")[0].toLowerCase().trim();
    const cleanTitle = (title || "").toLowerCase().trim();
    const hash = crypto_1.default
        .createHash("md5")
        .update(`${cleanUrl}#${cleanTitle}`)
        .digest("hex")
        .slice(0, 12);
    return `PROD-${hash}`;
}
function isSafeUrl(url) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return false;
    }
    const hostname = url.hostname.toLowerCase();
    // Reject local and private hostnames
    if (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "0.0.0.0" ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".lan")) {
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
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)",
            },
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
                "User-Agent": "Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)",
                Accept: "application/xml,text/xml,*/*",
            },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok)
            return [];
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        // Check for nested sitemaps in <sitemapindex>
        const subSitemaps = [];
        $("sitemap > loc").each((_, el) => {
            const loc = $(el).text().trim();
            if (loc)
                subSitemaps.push(loc);
        });
        for (const sub of subSitemaps.slice(0, 10)) {
            const subUrls = await fetchSitemapUrls(sub, maxDepth - 1, visitedSitemaps);
            discoveredUrls.push(...subUrls);
        }
        // Check for URLs in <urlset>
        $("url > loc").each((_, el) => {
            const loc = $(el).text().trim();
            if (loc && (loc.startsWith("http://") || loc.startsWith("https://"))) {
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
    robotsSitemaps.forEach((s) => candidateSitemaps.add(s));
    // 2. Common framework and CMS sitemap locations
    const standardLocations = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/wp-sitemap.xml`,
        `${origin}/sitemap_products_1.xml`,
        `${origin}/sitemap_pages_1.xml`,
    ];
    standardLocations.forEach((loc) => candidateSitemaps.add(loc));
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
        const href = $(el).attr("href") ||
            $(el).attr("data-href") ||
            $(el).attr("data-url") ||
            $(el).attr("content");
        if (href && typeof href === "string") {
            const trimmed = href.trim();
            if (!trimmed.startsWith("#") &&
                !trimmed.startsWith("javascript:") &&
                !trimmed.startsWith("mailto:") &&
                !trimmed.startsWith("tel:")) {
                try {
                    const fullUrl = new URL(trimmed, origin);
                    if (fullUrl.hostname === baseUrl.hostname) {
                        fullUrl.hash = "";
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
            const cleanPath = m[0].replace(/["'`]/g, "");
            const formattedPath = cleanPath.startsWith("/")
                ? cleanPath
                : `/${cleanPath}`;
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
    $("script").each((_, el) => {
        const scriptContent = $(el).html() || "";
        if (scriptContent.includes("__NEXT_DATA__") ||
            scriptContent.includes("self.__next_f") ||
            scriptContent.includes("/_next/")) {
            const routeMatches = scriptContent.matchAll(/"(\/(?:projects|products|casestudies|services|pricing|about|contact)[^"\\?#]+)"/g);
            for (const rm of routeMatches) {
                if (rm[1] && !rm[1].includes(".js") && !rm[1].includes(".css")) {
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
function decodeCloudflareEmail(encodedHex) {
    try {
        let email = "";
        const r = parseInt(encodedHex.substring(0, 2), 16);
        for (let n = 2; n < encodedHex.length; n += 2) {
            const charCode = parseInt(encodedHex.substring(n, n + 2), 16) ^ r;
            email += String.fromCharCode(charCode);
        }
        return email;
    }
    catch {
        return "";
    }
}
/**
 * Indexes a single page's markdown and structured items into KnowledgeChunk and Product
 */
async function indexPageContent(currentUrlStr, html, merchantId, origin, isMainDomain = false) {
    // Pre-process Cloudflare Email Protection tokens into plaintext emails
    let cleanHtml = html.replace(/\/cdn-cgi\/l\/email-protection#([a-fA-F0-9]+)/g, (match, hex) => {
        const decoded = decodeCloudflareEmail(hex);
        return decoded ? `mailto:${decoded}` : match;
    });
    cleanHtml = cleanHtml.replace(/data-cfemail="([a-fA-F0-9]+)"/g, (match, hex) => {
        const decoded = decodeCloudflareEmail(hex);
        return decoded ? `data-email="${decoded}"` : match;
    });
    const $ = cheerio.load(cleanHtml);
    // Replace any remaining [email protected] spans with decoded text
    $('a[href^="mailto:"], [data-email]').each((_, el) => {
        const mailto = $(el)
            .attr("href")
            ?.replace(/^mailto:/i, "")
            .trim();
        const dataEmail = $(el).attr("data-email")?.trim();
        const email = mailto || dataEmail;
        if (email && email.includes("@")) {
            if ($(el).text().includes("[email") || $(el).text().trim() === "") {
                $(el).text(email);
            }
        }
    });
    const pageTitle = $("title").text().trim() ||
        $("h1").first().text().trim() ||
        $('meta[property="og:title"]').attr("content") ||
        new URL(currentUrlStr).pathname;
    const metaDescription = $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        "";
    const ogImage = $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        "";
    const productsFound = [];
    // 1. Shopify Embedded Product JSON extraction (Highest fidelity variant mapping)
    $('script[type="application/json"][id*="ProductJson"], script[type="application/json"][data-product-json], script[id*="product-json"]').each((_, el) => {
        try {
            const jsonText = $(el).html();
            if (!jsonText)
                return;
            const pData = JSON.parse(jsonText);
            if (pData &&
                (pData.title || pData.name) &&
                (pData.variants || pData.options)) {
                const pTitle = pData.title || pData.name;
                const pDesc = pData.description || metaDescription || pTitle;
                const pPrice = pData.price
                    ? typeof pData.price === "number"
                        ? pData.price > 1000
                            ? pData.price / 100
                            : pData.price
                        : parseFloat(pData.price)
                    : 0;
                const pImg = pData.featured_image ||
                    (Array.isArray(pData.images) ? pData.images[0] : "") ||
                    ogImage;
                const pUrl = pData.url
                    ? new URL(pData.url, origin).href
                    : currentUrlStr;
                const pId = String(pData.id || `SHOPIFY-${Date.now()}`);
                const extractedOptions = Array.isArray(pData.options)
                    ? pData.options.map((opt) => typeof opt === "string"
                        ? { name: opt, values: [] }
                        : { name: opt.name || "Option", values: opt.values || [] })
                    : [];
                const extractedVariants = Array.isArray(pData.variants)
                    ? pData.variants.map((v) => ({
                        id: String(v.id),
                        title: v.title || v.name,
                        price: v.price
                            ? typeof v.price === "number"
                                ? v.price > 1000
                                    ? v.price / 100
                                    : v.price
                                : parseFloat(v.price)
                            : pPrice,
                        available: v.available !== undefined ? Boolean(v.available) : true,
                        sku: v.sku,
                        options: v.options
                            ? Array.isArray(v.options)
                                ? Object.fromEntries(v.options.map((val, idx) => [
                                    extractedOptions[idx]?.name || `Option ${idx + 1}`,
                                    val,
                                ]))
                                : v.options
                            : {},
                    }))
                    : [];
                productsFound.push({
                    externalId: pId,
                    title: String(pTitle).trim(),
                    description: String(pDesc).trim(),
                    price: pPrice,
                    currency: "USD",
                    imageUrl: String(pImg),
                    productUrl: pUrl,
                    category: pData.type || "Product",
                    inStock: true,
                    options: extractedOptions.length > 0 ? extractedOptions : undefined,
                    variants: extractedVariants.length > 0 ? extractedVariants : undefined,
                });
            }
        }
        catch { }
    });
    // 2. WooCommerce Variations Form extraction
    $("form.variations_form[data-product_variations]").each((_, el) => {
        try {
            const rawVariations = $(el).attr("data-product_variations");
            if (!rawVariations)
                return;
            const vData = JSON.parse(rawVariations);
            if (Array.isArray(vData) && vData.length > 0) {
                const firstVar = vData[0];
                const pPrice = parseFloat(firstVar.display_price || firstVar.price || "0") || 0;
                const pUrl = currentUrlStr;
                const pId = String(firstVar.variation_id || `WOO-${Date.now()}`);
                const extractedVariants = vData.map((v) => ({
                    id: String(v.variation_id || v.id),
                    price: parseFloat(v.display_price || v.price || "0") || pPrice,
                    available: v.is_in_stock !== undefined ? Boolean(v.is_in_stock) : true,
                    sku: v.sku,
                    options: v.attributes || {},
                }));
                const optionsMap = {};
                vData.forEach((v) => {
                    if (v.attributes) {
                        Object.entries(v.attributes).forEach(([k, val]) => {
                            const cleanKey = k.replace(/^attribute_pa_|^attribute_/i, "");
                            if (!optionsMap[cleanKey])
                                optionsMap[cleanKey] = new Set();
                            if (val)
                                optionsMap[cleanKey].add(String(val));
                        });
                    }
                });
                const extractedOptions = Object.entries(optionsMap).map(([name, set]) => ({
                    name,
                    values: Array.from(set),
                }));
                if (productsFound.length > 0) {
                    productsFound[0].options = extractedOptions;
                    productsFound[0].variants = extractedVariants;
                }
            }
        }
        catch { }
    });
    // 3. JSON-LD structured product metadata
    if (productsFound.length === 0) {
        $('script[type="application/ld+json"]').each((_, element) => {
            try {
                const jsonText = $(element).html();
                if (!jsonText)
                    return;
                const data = JSON.parse(jsonText);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    if (item["@type"] === "Product" ||
                        item["@type"] === "http://schema.org/Product" ||
                        item["@type"] === "Service" ||
                        item["@type"] === "http://schema.org/Service") {
                        const baseTitle = String(item.name || pageTitle).trim();
                        const description = String(item.description || metaDescription || baseTitle).trim();
                        const rawOffers = item.offers || {};
                        const offers = Array.isArray(rawOffers)
                            ? rawOffers
                            : Array.isArray(rawOffers.offers)
                                ? rawOffers.offers
                                : [rawOffers];
                        const imageUrl = Array.isArray(item.image)
                            ? item.image[0]
                            : item.image || ogImage || "";
                        const productUrl = item.url
                            ? new URL(item.url, origin).href
                            : currentUrlStr;
                        const category = item.category || "General";
                        // If there are multiple distinct named offers/plans (e.g. Free Plan, Starter Plan, Pro Plan)
                        const hasMultipleNamedOffers = offers.length > 1 &&
                            offers.some((o) => Boolean(o.name && o.name.trim().length > 0));
                        if (hasMultipleNamedOffers) {
                            for (let i = 0; i < offers.length; i++) {
                                const off = offers[i];
                                const offName = String(off.name || `Option ${i + 1}`).trim();
                                const fullItemTitle = baseTitle
                                    .toLowerCase()
                                    .includes(offName.toLowerCase())
                                    ? baseTitle
                                    : `${baseTitle} - ${offName}`;
                                const offPrice = parseFloat(off.price || off.lowPrice || "0") || 0;
                                const offCurrency = off.priceCurrency || "USD";
                                const offSku = generateDeterministicExternalId(productUrl, fullItemTitle, off.sku || off.identifier);
                                productsFound.push({
                                    externalId: offSku,
                                    title: fullItemTitle,
                                    description: `${fullItemTitle} - ${description}`,
                                    price: offPrice,
                                    currency: offCurrency,
                                    imageUrl: String(imageUrl),
                                    productUrl: String(productUrl),
                                    category: String(category),
                                    inStock: off.availability
                                        ? !off.availability.includes("OutOfStock")
                                        : true,
                                });
                            }
                        }
                        else {
                            const primaryOffer = offers[0] || {};
                            const price = parseFloat(primaryOffer.price || primaryOffer.lowPrice || "0") || 0;
                            const currency = primaryOffer.priceCurrency || "USD";
                            const sku = generateDeterministicExternalId(productUrl, baseTitle, item.sku || item.mpn);
                            productsFound.push({
                                externalId: String(sku),
                                title: baseTitle,
                                description,
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
            }
            catch { }
        });
    }
    // 4. DOM Product / Portfolio Card extraction
    if (productsFound.length === 0) {
        $('.product-card, .product-item, .grid-item, [itemtype*="Product"], .project-card, article').each((idx, el) => {
            const card = $(el);
            const title = card
                .find('.product-title, .title, h2, h3, h4, [itemprop="name"]')
                .first()
                .text()
                .trim();
            const link = card.find("a").first().attr("href");
            const img = card.find("img").first().attr("src") ||
                card.find("img").first().attr("data-src");
            const priceText = card
                .find('.price, [itemprop="price"]')
                .first()
                .text()
                .trim();
            const numericPrice = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;
            if (title && title.length > 2 && (link || img)) {
                const fullUrl = link ? new URL(link, origin).href : currentUrlStr;
                const fullImg = img ? new URL(img, origin).href : ogImage;
                const extId = generateDeterministicExternalId(fullUrl, title);
                productsFound.push({
                    externalId: extId,
                    title,
                    description: `${title} - Details available at ${fullUrl}`,
                    price: numericPrice,
                    currency: "USD",
                    imageUrl: fullImg,
                    productUrl: fullUrl,
                    category: "Showcase & Products",
                    inStock: true,
                });
            }
        });
    }
    // 5. Single Product Page Extraction (e.g., /product/:id or /products/:slug)
    if (productsFound.length === 0) {
        const isSingleProductPage = /\/product[s]?\/|\/item\/|\/p\//i.test(currentUrlStr) ||
            $('button, input[type="submit"]').filter((_, el) => /add\s*to\s*cart|buy\s*now|order\s*now/i.test($(el).text() || String($(el).val() || ""))).length > 0;
        const isArchiveOrUtilityPage = /\/shop\/?$|\/cart\/?$|\/checkout\/?$|\/my-account\/?$|\/product-category\/|\/category\//i.test(currentUrlStr);
        if (isSingleProductPage && !isArchiveOrUtilityPage) {
            const singleTitle = $("h1").first().text().trim() || pageTitle.split(/[-–|]/)[0].trim();
            let singlePrice = 0;
            // 1. Try WooCommerce and standard ecommerce price DOM selectors
            const wcPriceEl = $('.woocommerce-Price-amount bdi, .woocommerce-Price-amount, ins .amount, .price ins, .price .amount, [class*="product-price" i], .summary .price, [itemprop="price"], [data-price]').first();
            if (wcPriceEl.length > 0) {
                const wcText = (wcPriceEl.attr("data-price") || wcPriceEl.text())
                    .replace(/,/g, "")
                    .trim();
                const m = wcText.match(/(\d+(?:\.\d{1,2})?)/);
                if (m) {
                    singlePrice = parseFloat(m[1]);
                }
            }
            // 2. Fallback to full body currency regex
            if (singlePrice === 0) {
                const priceMatch = $("body")
                    .text()
                    .match(/(?:\$|USD|৳|Tk|€|£|₹)\s*(\d+(?:\.\d{1,2})?)/i);
                if (priceMatch) {
                    singlePrice = parseFloat(priceMatch[1]);
                }
            }
            const singleImg = $('meta[property="og:image"]').attr("content") ||
                $("main img, .product-image img, img").first().attr("src") ||
                ogImage;
            const fullImg = singleImg
                ? singleImg.startsWith("http")
                    ? singleImg
                    : new URL(singleImg, origin).href
                : "";
            const extractedOptions = [];
            // Helper to add unique option names and values cleanly
            const addExtractedOption = (name, values) => {
                if (!name || !values || values.length === 0)
                    return;
                const cleanName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
                const uniqueVals = Array.from(new Set(values
                    .map((v) => v.trim())
                    .filter((v) => v.length > 0 &&
                    v.length < 50 &&
                    !/^(add\s*to\s*cart|buy\s*now|checkout|login|signup)$/i.test(v))));
                if (uniqueVals.length === 0)
                    return;
                const existing = extractedOptions.find((o) => o.name.toLowerCase() === cleanName.toLowerCase());
                if (existing) {
                    existing.values = Array.from(new Set([...existing.values, ...uniqueVals]));
                }
                else {
                    extractedOptions.push({ name: cleanName, values: uniqueVals });
                }
            };
            // 1. Universal Semantic Heading & Sibling Container Traversal
            // Matches headings like "Select Size", "Select Color", "Select Storage", "Choose Flavor", "Material:", etc.
            $('p, label, h2, h3, h4, h5, h6, legend, [class*="label" i], [class*="heading" i], [class*="title" i]').each((_, headingEl) => {
                // Skip elements in footer, navigation, or header bars
                if ($(headingEl).closest('footer, header, nav, [class*="footer" i], [class*="header" i], [class*="nav" i]').length > 0) {
                    return;
                }
                if ($(headingEl).find('button, input[type="radio"], [role="radio"]')
                    .length > 0)
                    return;
                const text = $(headingEl).text().trim().replace(/\s+/g, " ");
                if (!text || text.length > 35)
                    return;
                if (/^(company|get\s*in\s*touch|about\s*us|customer\s*service|subscribe|newsletter|follow\s*us|social|links|navigation|copyright)$/i.test(text)) {
                    return;
                }
                const match = text.match(/^(?:Select|Choose|Pick|Available)?\s*([A-Za-z0-9\s_-]+?)(?:\s*:|\s*Options)?$/i);
                if (match && match[1]) {
                    let candidateName = match[1].trim();
                    if (!candidateName || candidateName.split(/\s+/).length > 3)
                        return;
                    if (/^(company|get\s*in\s*touch|product|item|quantity|qty|cart|checkout|price|shipping|review|rating|delivery|details?|description|login|order|related|recommended|category)$/i.test(candidateName)) {
                        return;
                    }
                    const nextEl = $(headingEl).next();
                    let buttonsInContainer = nextEl
                        .find('button, input[type="radio"], [role="radio"], [role="button"], .swatch, .option-btn, li')
                        .filter((_, b) => {
                        const bText = $(b).text().trim();
                        return (bText.length > 0 &&
                            !/add\s*to\s*cart|buy\s*now|checkout|login|signup/i.test(bText));
                    });
                    if (buttonsInContainer.length === 0 &&
                        nextEl.is('button, input[type="radio"], [role="radio"], [role="button"]')) {
                        buttonsInContainer = nextEl;
                    }
                    if (buttonsInContainer.length === 0) {
                        const parentContainer = $(headingEl).parent();
                        buttonsInContainer = parentContainer
                            .find('button, input[type="radio"], [role="radio"], [role="button"], .swatch, .option-btn, li')
                            .filter((_, b) => {
                            const bText = $(b).text().trim();
                            return (bText.length > 0 &&
                                !/add\s*to\s*cart|buy\s*now|checkout|login|signup/i.test(bText));
                        });
                    }
                    if (buttonsInContainer.length > 0) {
                        const vals = buttonsInContainer
                            .map((_, b) => $(b).text().trim())
                            .get();
                        addExtractedOption(candidateName, vals);
                    }
                }
            });
            // 2. Generic <select> option extraction (Dropdowns: Storage, Weight, Flavor, Material, Color, Size, etc.)
            $("select").each((_, sel) => {
                const selectEl = $(sel);
                let optName = selectEl.attr("name") ||
                    selectEl.attr("id") ||
                    selectEl.prev("label").text().trim() ||
                    selectEl.parent().find("label").text().trim() ||
                    selectEl.parent().find("p, span, h4, h5").first().text().trim() ||
                    "Option";
                optName = optName
                    .replace(/[-_]/g, " ")
                    .replace(/attribute/i, "")
                    .replace(/select/i, "")
                    .replace(/choose/i, "")
                    .trim();
                const vals = [];
                selectEl.find("option").each((_, opt) => {
                    const t = $(opt).text().trim();
                    if (t &&
                        !/choose|select|pick/i.test(t) &&
                        t.length > 0 &&
                        t.length < 40) {
                        vals.push(t);
                    }
                });
                if (vals.length > 0) {
                    addExtractedOption(optName, vals);
                }
            });
            // 3. Fallback Pattern Matchers (Sizes, Storage, Weights, Colors)
            const sizeButtons = $("button, .size-btn, [data-size]").filter((_, el) => /^(xs|s|m|l|xl|xxl|2xl|3xl|\d{2})$/i.test($(el).text().trim()));
            if (sizeButtons.length > 0) {
                addExtractedOption("Size", sizeButtons.map((_, el) => $(el).text().trim()).get());
            }
            const storageButtons = $("button, .option-btn, [data-storage]").filter((_, el) => /^\d+\s*(gb|tb|mb)$/i.test($(el).text().trim()));
            if (storageButtons.length > 0) {
                addExtractedOption("Storage", storageButtons.map((_, el) => $(el).text().trim()).get());
            }
            const weightButtons = $("button, .option-btn, [data-weight]").filter((_, el) => /^\d+\s*(g|kg|lb|oz|ml|l)$/i.test($(el).text().trim()));
            if (weightButtons.length > 0) {
                addExtractedOption("Weight", weightButtons.map((_, el) => $(el).text().trim()).get());
            }
            const colorButtons = $("[data-color], .color-swatch, .swatch[data-value], button [style*='background-color'], button [style*='background:']");
            if (colorButtons.length > 0) {
                const colorVals = colorButtons
                    .map((_, el) => {
                    const btnParent = $(el).is("button")
                        ? $(el)
                        : $(el).closest("button");
                    return ($(el).attr("data-color") ||
                        $(el).attr("data-value") ||
                        $(el).attr("title") ||
                        btnParent.text().trim() ||
                        $(el).text().trim());
                })
                    .get()
                    .filter((v) => Boolean(v) && v.length < 30 && !/add\s*to\s*cart/i.test(v));
                if (colorVals.length > 0) {
                    addExtractedOption("Color", colorVals);
                }
            }
            const extractedId = generateDeterministicExternalId(currentUrlStr, singleTitle);
            if (singleTitle && singleTitle.length > 2) {
                productsFound.push({
                    externalId: extractedId,
                    title: singleTitle,
                    description: metaDescription || `${singleTitle} - Available at ${currentUrlStr}`,
                    price: singlePrice,
                    currency: "USD",
                    imageUrl: fullImg,
                    productUrl: currentUrlStr,
                    category: "Products",
                    inStock: true,
                    options: extractedOptions.length > 0 ? extractedOptions : undefined,
                });
            }
        }
    }
    // 6. Collection / Catalog Page Link Extraction
    if (productsFound.length === 0) {
        $('a[href*="/product/"], a[href*="/products/"]').each((idx, el) => {
            const link = $(el);
            const href = link.attr("href");
            if (!href)
                return;
            const fullUrl = href.startsWith("http")
                ? href
                : new URL(href, origin).href;
            const title = link.find("h2, h3, h4, p, span").first().text().trim() ||
                link.text().trim();
            const img = link.find("img").attr("src") || link.find("img").attr("data-src");
            const priceText = link.text().match(/\$\s*(\d+(?:\.\d{1,2})?)/);
            const price = priceText ? parseFloat(priceText[1]) : 0;
            const extId = generateDeterministicExternalId(fullUrl, title);
            if (title &&
                title.length > 2 &&
                !/^(sale|on\s*sale|view|buy\s*now|add\s*to\s*cart|details|read\s*more|quick\s*view)$/i.test(title) &&
                !productsFound.some((p) => p.productUrl === fullUrl)) {
                productsFound.push({
                    externalId: extId,
                    title,
                    description: `${title} - Details available at ${fullUrl}`,
                    price,
                    currency: "USD",
                    imageUrl: img
                        ? img.startsWith("http")
                            ? img
                            : new URL(img, origin).href
                        : "",
                    productUrl: fullUrl,
                    category: "Collection",
                    inStock: true,
                });
            }
        });
    }
    // 3. Extract Knowledge Headings, Semantic Containers, Paragraphs, and Clickable Links
    const headings = [];
    $("h1, h2, h3, h4, h5, h6").each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, " ");
        if (text && text.length > 2)
            headings.push(`### ${text}`);
    });
    const contentBlocks = [];
    const seenBlockTexts = new Set();
    // Deep Semantic Container Traversal across modern SPAs & static sites
    $('p, li, blockquote, [data-description], dd, dt, table tr, td, th, div[class*="desc" i], div[class*="detail" i], div[class*="spec" i], div[class*="feature" i], div[class*="content" i], div[class*="faq" i], div[class*="policy" i], section p, article p').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, " ");
        if (text && text.length > 12 && !seenBlockTexts.has(text.toLowerCase())) {
            seenBlockTexts.add(text.toLowerCase());
            contentBlocks.push(text);
        }
    });
    const pageLinksSet = new Set();
    $("a").each((_, el) => {
        const linkText = $(el).text().trim().replace(/\s+/g, " ");
        const href = $(el).attr("href");
        if (linkText &&
            href &&
            linkText.length > 1 &&
            !href.startsWith("#") &&
            !href.startsWith("javascript:")) {
            try {
                const fullUrl = new URL(href, currentUrlStr).href;
                pageLinksSet.add(`- [${linkText}](${fullUrl})`);
            }
            catch { }
        }
    });
    const pageLinks = Array.from(pageLinksSet).slice(0, 40);
    const headerPrefix = `# Page Title: ${pageTitle}\nPage URL: ${currentUrlStr}\n${metaDescription ? `Description: ${metaDescription}\n` : ""}`;
    const linksSection = pageLinks.length > 0
        ? `\n\n### Page Links & Navigation:\n${pageLinks.join("\n")}`
        : "";
    const pageMarkdown = `${headerPrefix}\n\n${headings.join("\n")}\n\n${contentBlocks.slice(0, 30).join("\n\n")}${linksSection}`;
    // Clean previous chunks for this specific page atomically before inserting new ones
    await db_1.prisma
        .$executeRawUnsafe(`DELETE FROM "KnowledgeChunk" WHERE "merchantId" = $1 AND "url" = $2`, merchantId, currentUrlStr)
        .catch(() => { });
    // 4. Save Granular Structured Chunks (~380-450 chars) to KnowledgeChunk with vector embeddings
    let chunksCreated = 0;
    let currentChunk = `${headerPrefix}\n\n`;
    const elementsToChunk = [...headings, ...contentBlocks, ...pageLinks];
    for (const el of elementsToChunk) {
        currentChunk += el + "\n\n";
        if (currentChunk.length >= 380) {
            try {
                const kChunk = await db_1.prisma.knowledgeChunk.create({
                    data: {
                        merchantId,
                        url: currentUrlStr,
                        content: currentChunk.trim(),
                    },
                });
                chunksCreated++;
                try {
                    const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                    if (emb && emb.some((v) => v !== 0)) {
                        await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(",")}]`, kChunk.id);
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
    if (currentChunk.trim().length > headerPrefix.length + 10) {
        try {
            const kChunk = await db_1.prisma.knowledgeChunk.create({
                data: { merchantId, url: currentUrlStr, content: currentChunk.trim() },
            });
            chunksCreated++;
            try {
                const emb = await (0, embeddings_1.generateEmbedding)(currentChunk);
                if (emb && emb.some((v) => v !== 0)) {
                    await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(",")}]`, kChunk.id);
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
                    options: prod.options ? prod.options : undefined,
                    variants: prod.variants ? prod.variants : undefined,
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
                    ...(prod.options ? { options: prod.options } : {}),
                    ...(prod.variants ? { variants: prod.variants } : {}),
                },
            });
            const vectorStr = `[${embedding.join(",")}]`;
            await db_1.prisma
                .$executeRawUnsafe(`UPDATE "Product" SET embedding = $1::vector WHERE id = $2`, vectorStr, savedProduct.id)
                .catch(() => { });
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
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
            ],
        });
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0");
        // Save memory & speed up crawl by blocking images, media, stylesheets, and fonts
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const type = req.resourceType();
            if (["image", "media", "font"].includes(type)) {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        await page
            .goto(url, { waitUntil: "networkidle2", timeout: 20000 })
            .catch(() => {
            return page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 15000,
            });
        });
        // Sleep for React/Next.js client state hydration
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const content = await page.content();
        if (content.includes("This page couldn’t load") ||
            content.includes("This page couldn't load")) {
            logger_1.logger.warn(`[Puppeteer] Page rendered WebGL fallback error, preserving static HTML`);
            return "";
        }
        logger_1.logger.info(`[Puppeteer] Rendered SPA HTML successfully (${content.length} bytes) for ${url}`);
        return content;
    }
    catch (err) {
        logger_1.logger.warn(`[Puppeteer] Headless render skipped or failed on ${url}: ${err?.message || err}`);
        return "";
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
        parsedUrl = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
    }
    catch (err) {
        throw new Error(`Invalid target URL: ${targetUrl}`);
    }
    if (!isSafeUrl(parsedUrl)) {
        throw new Error(`Target URL '${targetUrl}' is invalid or resolves to a restricted/private network address.`);
    }
    const visitedUrls = new Set();
    const queue = [parsedUrl.href];
    const maxPages = 100;
    // ── Tier 1 & Tier 2: Opportunistic Sitemaps & robots.txt Discovery ──
    try {
        const sitemapUrls = await discoverAllSitemapUrls(parsedUrl.origin);
        for (const url of sitemapUrls) {
            try {
                const u = new URL(url);
                if (u.hostname === parsedUrl.hostname &&
                    !visitedUrls.has(u.href) &&
                    !queue.includes(u.href)) {
                    queue.push(u.href);
                }
            }
            catch { }
        }
        logger_1.logger.info(`Scraper: Sitemap/robots discovery found ${sitemapUrls.length} potential URLs`);
    }
    catch (err) {
        logger_1.logger.debug("Sitemap discovery skipped or unavailable");
    }
    const allProductsFound = [];
    let totalKnowledgeChunks = 0;
    let mainPageTitle = parsedUrl.hostname;
    let mainMarkdown = "";
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
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(10000), // 10s timeout per page
            });
            if (!response.ok)
                continue;
            let html = await response.text();
            // Detect Client-Side React/Next.js SPA or SSR Bailout
            const isSpaBailout = html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING") ||
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
            const currentJob = activeScrapeJobs.get(merchantId);
            if (currentJob && currentJob.isScraping) {
                currentJob.pagesCrawled = visitedUrls.size;
                currentJob.lastUpdated = Date.now();
            }
            // Discover internal links from current page
            const $ = cheerio.load(html);
            $("a[href]").each((_, el) => {
                const href = $(el).attr("href");
                if (href &&
                    !href.startsWith("#") &&
                    !href.startsWith("mailto:") &&
                    !href.startsWith("tel:") &&
                    !href.startsWith("javascript:")) {
                    try {
                        const nextUrl = new URL(href, parsedUrl.origin);
                        if (nextUrl.hostname === parsedUrl.hostname &&
                            !visitedUrls.has(nextUrl.href) &&
                            !queue.includes(nextUrl.href)) {
                            if (!nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|woff|woff2)$/i)) {
                                queue.push(nextUrl.href);
                            }
                        }
                    }
                    catch { }
                }
            });
        }
        catch (err) {
            logger_1.logger.error(`Error scraping page ${currentUrlStr}:`, err);
        }
    }
    // Create Master Site Index Chunk for comprehensive site-wide awareness
    try {
        const siteMapOverview = `[Site Master Index: ${parsedUrl.hostname}]\nWebsite Title: ${mainPageTitle}\nTotal Indexed Pages (${visitedUrls.size}):\n` +
            Array.from(visitedUrls)
                .map((u) => `- ${u}`)
                .join("\n") +
            (allProductsFound.length > 0
                ? `\nDiscovered Projects & Showcase Items:\n` +
                    allProductsFound
                        .map((p) => `- [${p.title}](${p.productUrl}) - ${p.description || p.category || ""}`)
                        .join("\n")
                : "");
        const indexChunk = await db_1.prisma.knowledgeChunk.create({
            data: {
                merchantId,
                url: `${parsedUrl.origin}/#site-master-index`,
                content: siteMapOverview,
            },
        });
        totalKnowledgeChunks++;
        const emb = await (0, embeddings_1.generateEmbedding)(siteMapOverview);
        if (emb && emb.some((v) => v !== 0)) {
            await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(",")}]`, indexChunk.id);
        }
    }
    catch (err) {
        logger_1.logger.error("Failed to generate site master index chunk:", err);
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
        parsedUrl = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
    }
    catch {
        throw new Error(`Invalid URL: ${targetUrl}`);
    }
    if (!isSafeUrl(parsedUrl)) {
        throw new Error("Target URL resolves to a restricted/private address.");
    }
    const response = await fetch(parsedUrl.href, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LabtoBot/2.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
    }
    let html = await response.text();
    const isSpaBailout = html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING") ||
        html.includes('data-dgst="BAILOUT') ||
        (html.includes('id="__next"') && html.length < 2500) ||
        (html.includes('id="root"') && html.length < 1500);
    if (isSpaBailout) {
        const hydratedHtml = await fetchRenderedHtmlWithPuppeteer(parsedUrl.href);
        if (hydratedHtml && hydratedHtml.length > html.length) {
            html = hydratedHtml;
        }
    }
    return await indexPageContent(parsedUrl.href, html, merchantId, parsedUrl.origin, false);
}
/**
 * Add a manual custom text/FAQ knowledge chunk
 */
async function addManualKnowledgeChunk(merchantId, title, content, sourceUrl) {
    const formattedContent = `# ${title}\nSource: ${sourceUrl || "Merchant Dashboard Note"}\n\n${content}`;
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
            await db_1.prisma.$executeRawUnsafe(`UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`, `[${emb.join(",")}]`, chunk.id);
        }
    }
    catch { }
    return chunk;
}
const activeScrapeJobs = new Map();
function getScrapeStatus(merchantId) {
    return (activeScrapeJobs.get(merchantId) || {
        isScraping: false,
        domain: "",
        pagesCrawled: 0,
        maxPages: 100,
        status: "completed",
        startTime: 0,
        lastUpdated: Date.now(),
    });
}
function triggerBackgroundCrawl(domains, merchantId) {
    const domainList = Array.isArray(domains) ? domains : [domains];
    const existingJob = activeScrapeJobs.get(merchantId);
    if (existingJob && existingJob.isScraping) {
        logger_1.logger.info(`[BackgroundScraper] Scrape already in progress for merchant ${merchantId}`);
        return {
            success: true,
            message: "Crawl already in progress in background",
            isAlreadyRunning: true,
        };
    }
    const primaryDomain = domainList[0] || "all";
    const jobStatus = {
        isScraping: true,
        domain: primaryDomain,
        pagesCrawled: 0,
        maxPages: 100 * domainList.length,
        status: "in_progress",
        startTime: Date.now(),
        lastUpdated: Date.now(),
    };
    activeScrapeJobs.set(merchantId, jobStatus);
    logger_1.logger.info(`[BackgroundScraper] Launching persistent background crawl for merchant ${merchantId} on domains: ${domainList.join(", ")}`);
    (async () => {
        let totalPages = 0;
        for (const dom of domainList) {
            try {
                jobStatus.domain = dom;
                const result = await scrapeWebsite(dom, merchantId);
                totalPages += result.pagesCrawledCount || 0;
                jobStatus.pagesCrawled = totalPages;
                jobStatus.lastUpdated = Date.now();
            }
            catch (err) {
                logger_1.logger.error(`[BackgroundScraper] Persistent background crawl failed for ${dom}:`, err);
            }
        }
        activeScrapeJobs.set(merchantId, {
            isScraping: false,
            domain: primaryDomain,
            pagesCrawled: totalPages,
            maxPages: jobStatus.maxPages,
            status: "completed",
            startTime: jobStatus.startTime,
            lastUpdated: Date.now(),
        });
        logger_1.logger.info(`[BackgroundScraper] Persistent background crawl completed for merchant ${merchantId}`);
    })().catch((err) => {
        activeScrapeJobs.set(merchantId, {
            isScraping: false,
            domain: primaryDomain,
            pagesCrawled: 0,
            maxPages: jobStatus.maxPages,
            status: "failed",
            startTime: jobStatus.startTime,
            lastUpdated: Date.now(),
        });
        logger_1.logger.error(`[BackgroundScraper] Crawl job failed:`, err);
    });
    return { success: true, message: "Background crawl initiated successfully" };
}
