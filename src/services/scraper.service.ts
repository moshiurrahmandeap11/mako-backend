import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { prisma } from "../config/db";
import { generateEmbedding } from "../utils/embeddings";
import { logger } from "../utils/logger";

export interface ScrapedProduct {
  externalId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  productUrl: string;
  category: string;
  inStock: boolean;
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{
    id: string;
    title?: string;
    price?: number;
    available?: boolean;
    sku?: string;
    options?: Record<string, string>;
  }>;
}

export interface ScrapeResult {
  url: string;
  pageTitle: string;
  productsFound: ScrapedProduct[];
  markdownContent: string;
  indexedCount: number;
  pagesCrawledCount: number;
  knowledgeChunksCount: number;
}

export function isSafeUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const hostname = url.hostname.toLowerCase();

  // Reject local and private hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    return false;
  }

  // Reject private and link-local IPv4 ranges
  if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(hostname)) return false;
  if (/^169\.254\.\d+\.\d+$/.test(hostname)) return false; // Cloud metadata IP

  return true;
}

/**
 * Fetch and extract sitemap declarations from robots.txt
 */
async function fetchRobotsSitemaps(origin: string): Promise<string[]> {
  const sitemapUrls: string[] = [];
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      const matches = text.matchAll(/Sitemap:\s*(https?:\/\/[^\s\r\n]+)/gi);
      for (const m of matches) {
        if (m[1]) sitemapUrls.push(m[1].trim());
      }
    }
  } catch {
    // robots.txt optional
  }
  return sitemapUrls;
}

/**
 * Recursively parse sitemap XML or sitemap index files for page and product URLs
 */
async function fetchSitemapUrls(
  sitemapUrl: string,
  maxDepth = 2,
  visitedSitemaps = new Set<string>(),
): Promise<string[]> {
  if (maxDepth <= 0 || visitedSitemaps.has(sitemapUrl)) return [];
  visitedSitemaps.add(sitemapUrl);

  const discoveredUrls: string[] = [];
  try {
    const res = await fetch(sitemapUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LabtoBot/2.0; +https://labto.ahsanul.dev)",
        Accept: "application/xml,text/xml,*/*",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    // Check for nested sitemaps in <sitemapindex>
    const subSitemaps: string[] = [];
    $("sitemap > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) subSitemaps.push(loc);
    });

    for (const sub of subSitemaps.slice(0, 10)) {
      const subUrls = await fetchSitemapUrls(
        sub,
        maxDepth - 1,
        visitedSitemaps,
      );
      discoveredUrls.push(...subUrls);
    }

    // Check for URLs in <urlset>
    $("url > loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc && (loc.startsWith("http://") || loc.startsWith("https://"))) {
        discoveredUrls.push(loc);
      }
    });
  } catch (e) {
    logger.debug(`Optional sitemap check failed for ${sitemapUrl}`);
  }
  return discoveredUrls;
}

/**
 * Discover all potential sitemaps from robots.txt and standard locations
 */
async function discoverAllSitemapUrls(origin: string): Promise<string[]> {
  const candidateSitemaps = new Set<string>();

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

  const allFoundUrls: string[] = [];
  const visitedSitemaps = new Set<string>();

  for (const sitemap of candidateSitemaps) {
    try {
      const urls = await fetchSitemapUrls(sitemap, 2, visitedSitemaps);
      allFoundUrls.push(...urls);
    } catch {}
  }

  return Array.from(new Set(allFoundUrls));
}

/**
 * Extract dynamic SPA / Next.js / React / Vue internal route links from HTML and script tags
 */
function extractSpaRoutes(html: string, baseUrl: URL): string[] {
  const discoveredRoutes = new Set<string>();
  const origin = baseUrl.origin;

  // 1. Regular DOM anchors and interactive links
  const $ = cheerio.load(html);
  $(
    'a[href], button[data-href], [data-url], link[rel="canonical"], meta[property="og:url"]',
  ).each((_, el) => {
    const href =
      $(el).attr("href") ||
      $(el).attr("data-href") ||
      $(el).attr("data-url") ||
      $(el).attr("content");
    if (href && typeof href === "string") {
      const trimmed = href.trim();
      if (
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("javascript:") &&
        !trimmed.startsWith("mailto:") &&
        !trimmed.startsWith("tel:")
      ) {
        try {
          const fullUrl = new URL(trimmed, origin);
          if (fullUrl.hostname === baseUrl.hostname) {
            fullUrl.hash = "";
            discoveredRoutes.add(fullUrl.href);
          }
        } catch {}
      }
    }
  });

  // 2. SPA Embedded Router & Script Payload Scanner
  // Matches internal paths like /projects/slug, /products/item, /casestudies/case, /services/name, etc.
  const pathRegex =
    /(?:"|'|`|\/)(?:projects|products|services|casestudies|case-studies|portfolio|pricing|about|contact|shop|collection|blogs?|work|features|solutions)\/([a-zA-Z0-9_\-\/]{2,60})(?:"|'|`)/g;

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
      } catch {}
    }
  }

  // 3. Next.js App Router Page Manifest & __NEXT_DATA__ scanning
  $("script").each((_, el) => {
    const scriptContent = $(el).html() || "";
    if (
      scriptContent.includes("__NEXT_DATA__") ||
      scriptContent.includes("self.__next_f") ||
      scriptContent.includes("/_next/")
    ) {
      const routeMatches = scriptContent.matchAll(
        /"(\/(?:projects|products|casestudies|services|pricing|about|contact)[^"\\?#]+)"/g,
      );
      for (const rm of routeMatches) {
        if (rm[1] && !rm[1].includes(".js") && !rm[1].includes(".css")) {
          try {
            const fullUrl = new URL(rm[1], origin);
            if (fullUrl.hostname === baseUrl.hostname) {
              discoveredRoutes.add(fullUrl.href);
            }
          } catch {}
        }
      }
    }
  });

  return Array.from(discoveredRoutes);
}

export function decodeCloudflareEmail(encodedHex: string): string {
  try {
    let email = "";
    const r = parseInt(encodedHex.substring(0, 2), 16);
    for (let n = 2; n < encodedHex.length; n += 2) {
      const charCode = parseInt(encodedHex.substring(n, n + 2), 16) ^ r;
      email += String.fromCharCode(charCode);
    }
    return email;
  } catch {
    return "";
  }
}

/**
 * Indexes a single page's markdown and structured items into KnowledgeChunk and Product
 */
async function indexPageContent(
  currentUrlStr: string,
  html: string,
  merchantId: string,
  origin: string,
  isMainDomain = false,
): Promise<{
  products: ScrapedProduct[];
  chunksCount: number;
  pageTitle: string;
  pageMarkdown: string;
}> {
  // Pre-process Cloudflare Email Protection tokens into plaintext emails
  let cleanHtml = html.replace(
    /\/cdn-cgi\/l\/email-protection#([a-fA-F0-9]+)/g,
    (match, hex) => {
      const decoded = decodeCloudflareEmail(hex);
      return decoded ? `mailto:${decoded}` : match;
    },
  );

  cleanHtml = cleanHtml.replace(
    /data-cfemail="([a-fA-F0-9]+)"/g,
    (match, hex) => {
      const decoded = decodeCloudflareEmail(hex);
      return decoded ? `data-email="${decoded}"` : match;
    },
  );

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

  const pageTitle =
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    new URL(currentUrlStr).pathname;

  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    "";

  const productsFound: ScrapedProduct[] = [];

  // 1. Shopify Embedded Product JSON extraction (Highest fidelity variant mapping)
  $(
    'script[type="application/json"][id*="ProductJson"], script[type="application/json"][data-product-json], script[id*="product-json"]',
  ).each((_, el) => {
    try {
      const jsonText = $(el).html();
      if (!jsonText) return;
      const pData = JSON.parse(jsonText);
      if (
        pData &&
        (pData.title || pData.name) &&
        (pData.variants || pData.options)
      ) {
        const pTitle = pData.title || pData.name;
        const pDesc = pData.description || metaDescription || pTitle;
        const pPrice = pData.price
          ? typeof pData.price === "number"
            ? pData.price > 1000
              ? pData.price / 100
              : pData.price
            : parseFloat(pData.price)
          : 0;
        const pImg =
          pData.featured_image ||
          (Array.isArray(pData.images) ? pData.images[0] : "") ||
          ogImage;
        const pUrl = pData.url
          ? new URL(pData.url, origin).href
          : currentUrlStr;
        const pId = String(pData.id || `SHOPIFY-${Date.now()}`);

        const extractedOptions = Array.isArray(pData.options)
          ? pData.options.map((opt: any) =>
              typeof opt === "string"
                ? { name: opt, values: [] }
                : { name: opt.name || "Option", values: opt.values || [] },
            )
          : [];

        const extractedVariants = Array.isArray(pData.variants)
          ? pData.variants.map((v: any) => ({
              id: String(v.id),
              title: v.title || v.name,
              price: v.price
                ? typeof v.price === "number"
                  ? v.price > 1000
                    ? v.price / 100
                    : v.price
                  : parseFloat(v.price)
                : pPrice,
              available:
                v.available !== undefined ? Boolean(v.available) : true,
              sku: v.sku,
              options: v.options
                ? Array.isArray(v.options)
                  ? Object.fromEntries(
                      v.options.map((val: string, idx: number) => [
                        extractedOptions[idx]?.name || `Option ${idx + 1}`,
                        val,
                      ]),
                    )
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
          variants:
            extractedVariants.length > 0 ? extractedVariants : undefined,
        });
      }
    } catch {}
  });

  // 2. WooCommerce Variations Form extraction
  $("form.variations_form[data-product_variations]").each((_, el) => {
    try {
      const rawVariations = $(el).attr("data-product_variations");
      if (!rawVariations) return;
      const vData = JSON.parse(rawVariations);
      if (Array.isArray(vData) && vData.length > 0) {
        const firstVar = vData[0];
        const pPrice =
          parseFloat(firstVar.display_price || firstVar.price || "0") || 0;
        const pUrl = currentUrlStr;
        const pId = String(firstVar.variation_id || `WOO-${Date.now()}`);

        const extractedVariants = vData.map((v: any) => ({
          id: String(v.variation_id || v.id),
          price: parseFloat(v.display_price || v.price || "0") || pPrice,
          available:
            v.is_in_stock !== undefined ? Boolean(v.is_in_stock) : true,
          sku: v.sku,
          options: v.attributes || {},
        }));

        const optionsMap: Record<string, Set<string>> = {};
        vData.forEach((v: any) => {
          if (v.attributes) {
            Object.entries(v.attributes).forEach(([k, val]) => {
              const cleanKey = k.replace(/^attribute_pa_|^attribute_/i, "");
              if (!optionsMap[cleanKey]) optionsMap[cleanKey] = new Set();
              if (val) optionsMap[cleanKey].add(String(val));
            });
          }
        });

        const extractedOptions = Object.entries(optionsMap).map(
          ([name, set]) => ({
            name,
            values: Array.from(set),
          }),
        );

        if (productsFound.length > 0) {
          productsFound[0].options = extractedOptions;
          productsFound[0].variants = extractedVariants;
        }
      }
    } catch {}
  });

  // 3. JSON-LD structured product metadata
  if (productsFound.length === 0) {
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (!jsonText) return;
        const data = JSON.parse(jsonText);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (
            item["@type"] === "Product" ||
            item["@type"] === "http://schema.org/Product"
          ) {
            const title = item.name || pageTitle;
            const description = item.description || metaDescription || title;
            const offers = Array.isArray(item.offers)
              ? item.offers
              : [item.offers || {}];
            const primaryOffer = offers[0] || {};
            const price =
              parseFloat(primaryOffer.price || primaryOffer.lowPrice || "0") ||
              0;
            const currency = primaryOffer.priceCurrency || "USD";
            const imageUrl = Array.isArray(item.image)
              ? item.image[0]
              : item.image || ogImage || "";
            const productUrl = item.url
              ? new URL(item.url, origin).href
              : currentUrlStr;
            const category = item.category || "General";
            const sku =
              item.sku ||
              item.mpn ||
              `SCRAPE-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

            let parsedVariants: any[] | undefined = undefined;
            if (offers.length > 1) {
              parsedVariants = offers.map((off: any, idx: number) => ({
                id: String(off.sku || off.identifier || `VAR-${idx + 1}`),
                title: off.name || `Option ${idx + 1}`,
                price: parseFloat(off.price || "0") || price,
                available: off.availability
                  ? !off.availability.includes("OutOfStock")
                  : true,
                sku: off.sku,
              }));
            }

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
              variants: parsedVariants,
            });
          }
        }
      } catch {}
    });
  }

  // 4. DOM Product / Portfolio Card extraction
  if (productsFound.length === 0) {
    $(
      '.product-card, .product-item, .grid-item, [itemtype*="Product"], .project-card, article',
    ).each((idx, el) => {
      const card = $(el);
      const title = card
        .find('.product-title, .title, h2, h3, h4, [itemprop="name"]')
        .first()
        .text()
        .trim();
      const link = card.find("a").first().attr("href");
      const img =
        card.find("img").first().attr("src") ||
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

        productsFound.push({
          externalId: `DOM-${idx + 1}-${Buffer.from(title).toString("hex").slice(0, 10)}`,
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
    const isSingleProductPage =
      /\/product[s]?\/|\/item\/|\/p\//i.test(currentUrlStr) ||
      $('button, input[type="submit"]').filter((_, el) =>
        /add\s*to\s*cart|buy\s*now|order\s*now/i.test(
          $(el).text() || String($(el).val() || ""),
        ),
      ).length > 0;

    if (isSingleProductPage) {
      const singleTitle =
        $("h1").first().text().trim() || pageTitle.split(/[-–|]/)[0].trim();

      let singlePrice = 0;
      const priceMatch = $("body")
        .text()
        .match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      if (priceMatch) {
        singlePrice = parseFloat(priceMatch[1]);
      }

      const singleImg =
        $('meta[property="og:image"]').attr("content") ||
        $("main img, .product-image img, img").first().attr("src") ||
        ogImage;
      const fullImg = singleImg
        ? singleImg.startsWith("http")
          ? singleImg
          : new URL(singleImg, origin).href
        : "";

      const extractedOptions: Array<{ name: string; values: string[] }> = [];

      // 1. Generic <select> option extraction (Dropdowns: Storage, Weight, Flavor, Material, Color, Size, etc.)
      $("select").each((_, sel) => {
        const selectEl = $(sel);
        let optName =
          selectEl.attr("name") ||
          selectEl.attr("id") ||
          selectEl.prev("label").text().trim() ||
          selectEl.parent().find("label").text().trim() ||
          "Option";
        optName = optName
          .replace(/[-_]/g, " ")
          .replace(/attribute/i, "")
          .replace(/select/i, "")
          .trim();
        optName = optName.charAt(0).toUpperCase() + optName.slice(1);

        const vals: string[] = [];
        selectEl.find("option").each((_, opt) => {
          const t = $(opt).text().trim();
          if (
            t &&
            !/choose|select|pick/i.test(t) &&
            t.length > 0 &&
            t.length < 40
          ) {
            vals.push(t);
          }
        });

        if (
          vals.length > 0 &&
          !extractedOptions.some(
            (o) => o.name.toLowerCase() === optName.toLowerCase(),
          )
        ) {
          extractedOptions.push({ name: optName, values: vals });
        }
      });

      // 2. Generic Button Groups, Pills, & Swatches (Sizes, Storage, Weights, Colors)
      const sizeButtons = $("button, .size-btn, [data-size]").filter((_, el) =>
        /^(xs|s|m|l|xl|xxl|\d{2})$/i.test($(el).text().trim()),
      );
      if (
        sizeButtons.length > 0 &&
        !extractedOptions.some((o) => o.name.toLowerCase() === "size")
      ) {
        extractedOptions.push({
          name: "Size",
          values: Array.from(
            new Set(sizeButtons.map((_, el) => $(el).text().trim()).get()),
          ),
        });
      }

      const storageButtons = $("button, .option-btn, [data-storage]").filter(
        (_, el) => /^\d+\s*(gb|tb|mb)$/i.test($(el).text().trim()),
      );
      if (
        storageButtons.length > 0 &&
        !extractedOptions.some((o) => o.name.toLowerCase() === "storage")
      ) {
        extractedOptions.push({
          name: "Storage",
          values: Array.from(
            new Set(storageButtons.map((_, el) => $(el).text().trim()).get()),
          ),
        });
      }

      const weightButtons = $("button, .option-btn, [data-weight]").filter(
        (_, el) => /^\d+\s*(g|kg|lb|oz|ml|l)$/i.test($(el).text().trim()),
      );
      if (
        weightButtons.length > 0 &&
        !extractedOptions.some((o) => o.name.toLowerCase() === "weight")
      ) {
        extractedOptions.push({
          name: "Weight",
          values: Array.from(
            new Set(weightButtons.map((_, el) => $(el).text().trim()).get()),
          ),
        });
      }

      const colorButtons = $(
        "[data-color], .color-swatch, .swatch[data-value]",
      );
      if (
        colorButtons.length > 0 &&
        !extractedOptions.some((o) => o.name.toLowerCase() === "color")
      ) {
        const colorVals = colorButtons
          .map(
            (_, el) =>
              $(el).attr("data-color") ||
              $(el).attr("data-value") ||
              $(el).attr("title") ||
              $(el).text().trim(),
          )
          .get()
          .filter(Boolean);
        if (colorVals.length > 0) {
          extractedOptions.push({
            name: "Color",
            values: Array.from(new Set(colorVals)),
          });
        }
      }

      const urlMatch = currentUrlStr.match(/\/product[s]?\/([^\/\?#]+)/i);
      const extractedId = urlMatch
        ? urlMatch[1]
        : `PROD-${Buffer.from(singleTitle).toString("hex").slice(0, 10)}`;

      if (singleTitle && singleTitle.length > 2) {
        productsFound.push({
          externalId: extractedId,
          title: singleTitle,
          description:
            metaDescription || `${singleTitle} - Available at ${currentUrlStr}`,
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
      if (!href) return;
      const fullUrl = href.startsWith("http")
        ? href
        : new URL(href, origin).href;

      const title =
        link.find("h2, h3, h4, p, span").first().text().trim() ||
        link.text().trim();
      const img =
        link.find("img").attr("src") || link.find("img").attr("data-src");
      const priceText = link.text().match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      const price = priceText ? parseFloat(priceText[1]) : 0;

      const urlMatch = href.match(/\/product[s]?\/([^\/\?#]+)/i);
      const extId = urlMatch ? urlMatch[1] : `PROD-${idx + 1}`;

      if (
        title &&
        title.length > 2 &&
        !productsFound.some((p) => p.productUrl === fullUrl)
      ) {
        productsFound.push({
          externalId: extId,
          title,
          description: `${title} - Details at ${fullUrl}`,
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
  const headings: string[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text && text.length > 2) headings.push(`### ${text}`);
  });

  const contentBlocks: string[] = [];
  const seenBlockTexts = new Set<string>();

  // Deep Semantic Container Traversal across modern SPAs & static sites
  $(
    'p, li, blockquote, [data-description], dd, dt, table tr, td, th, div[class*="desc" i], div[class*="detail" i], div[class*="spec" i], div[class*="feature" i], div[class*="content" i], div[class*="faq" i], div[class*="policy" i], section p, article p'
  ).each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text && text.length > 12 && !seenBlockTexts.has(text.toLowerCase())) {
      seenBlockTexts.add(text.toLowerCase());
      contentBlocks.push(text);
    }
  });

  const pageLinksSet = new Set<string>();
  $("a").each((_, el) => {
    const linkText = $(el).text().trim().replace(/\s+/g, " ");
    const href = $(el).attr("href");
    if (
      linkText &&
      href &&
      linkText.length > 1 &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:")
    ) {
      try {
        const fullUrl = new URL(href, currentUrlStr).href;
        pageLinksSet.add(`- [${linkText}](${fullUrl})`);
      } catch {}
    }
  });
  const pageLinks = Array.from(pageLinksSet).slice(0, 40);

  const headerPrefix = `# Page Title: ${pageTitle}\nPage URL: ${currentUrlStr}\n${metaDescription ? `Description: ${metaDescription}\n` : ""}`;
  const linksSection =
    pageLinks.length > 0
      ? `\n\n### Page Links & Navigation:\n${pageLinks.join("\n")}`
      : "";
  const pageMarkdown = `${headerPrefix}\n\n${headings.join("\n")}\n\n${contentBlocks.slice(0, 30).join("\n\n")}${linksSection}`;

  // Clean previous chunks for this specific page atomically before inserting new ones
  await prisma
    .$executeRawUnsafe(
      `DELETE FROM "KnowledgeChunk" WHERE "merchantId" = $1 AND "url" = $2`,
      merchantId,
      currentUrlStr,
    )
    .catch(() => {});

  // 4. Save Granular Structured Chunks (~380-450 chars) to KnowledgeChunk with vector embeddings
  let chunksCreated = 0;
  let currentChunk = `${headerPrefix}\n\n`;
  const elementsToChunk = [
    ...headings,
    ...contentBlocks,
    ...pageLinks,
  ];

  for (const el of elementsToChunk) {
    currentChunk += el + "\n\n";
    if (currentChunk.length >= 380) {
      try {
        const kChunk = await (prisma as any).knowledgeChunk.create({
          data: {
            merchantId,
            url: currentUrlStr,
            content: currentChunk.trim(),
          },
        });
        chunksCreated++;

        try {
          const emb = await generateEmbedding(currentChunk);
          if (emb && emb.some((v) => v !== 0)) {
            await prisma.$executeRawUnsafe(
              `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
              `[${emb.join(",")}]`,
              kChunk.id,
            );
          }
        } catch {}
      } catch (err) {
        logger.error(`KnowledgeChunk creation error on ${currentUrlStr}:`, err);
      }
      currentChunk = `${headerPrefix}\n\n`;
    }
  }

  if (currentChunk.trim().length > headerPrefix.length + 10) {
    try {
      const kChunk = await (prisma as any).knowledgeChunk.create({
        data: { merchantId, url: currentUrlStr, content: currentChunk.trim() },
      });
      chunksCreated++;

      try {
        const emb = await generateEmbedding(currentChunk);
        if (emb && emb.some((v) => v !== 0)) {
          await prisma.$executeRawUnsafe(
            `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
            `[${emb.join(",")}]`,
            kChunk.id,
          );
        }
      } catch {}
    } catch (err) {
      logger.error(
        `KnowledgeChunk final chunk creation error on ${currentUrlStr}:`,
        err,
      );
    }
  }

  // 5. Upsert discovered products
  for (const prod of productsFound) {
    try {
      const contentToEmbed = `Product/Project: ${prod.title}. Category: ${prod.category}. Price: $${prod.price} ${prod.currency}. Link: ${prod.productUrl}. Description: ${prod.description}`;
      const embedding = await generateEmbedding(contentToEmbed);

      const savedProduct = await prisma.product.upsert({
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
          options: prod.options ? (prod.options as any) : undefined,
          variants: prod.variants ? (prod.variants as any) : undefined,
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
          ...(prod.options ? { options: prod.options as any } : {}),
          ...(prod.variants ? { variants: prod.variants as any } : {}),
        },
      });

      const vectorStr = `[${embedding.join(",")}]`;
      await prisma
        .$executeRawUnsafe(
          `UPDATE "Product" SET embedding = $1::vector WHERE id = $2`,
          vectorStr,
          savedProduct.id,
        )
        .catch(() => {});
    } catch (err) {
      logger.error(`Scraper: Failed to index product ${prod.title}:`, err);
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
async function fetchRenderedHtmlWithPuppeteer(url: string): Promise<string> {
  let browser: any = null;
  try {
    logger.info(
      `[Puppeteer] Launching lightweight headless browser for SPA rendering on ${url}`,
    );
    browser = await puppeteer.launch({
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
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0",
    );

    // Save memory & speed up crawl by blocking images, media, stylesheets, and fonts
    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const type = req.resourceType();
      if (["image", "media", "font"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Brief sleep for React/Next.js hydration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const content = await page.content();
    if (
      content.includes("This page couldn’t load") ||
      content.includes("This page couldn't load")
    ) {
      logger.warn(
        `[Puppeteer] Page rendered WebGL fallback error, preserving static HTML`,
      );
      return "";
    }

    logger.info(
      `[Puppeteer] Rendered SPA HTML successfully (${content.length} bytes) for ${url}`,
    );
    return content;
  } catch (err: any) {
    logger.warn(
      `[Puppeteer] Headless render skipped or failed on ${url}: ${err?.message || err}`,
    );
    return "";
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

/**
 * Main Full Hybrid Web Crawler
 */
export async function scrapeWebsite(
  targetUrl: string,
  merchantId: string,
): Promise<ScrapeResult> {
  logger.info(
    `Scraper: Starting 4-tier hybrid web crawl for merchant ${merchantId} on ${targetUrl}`,
  );

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(
      targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`,
    );
  } catch (err) {
    throw new Error(`Invalid target URL: ${targetUrl}`);
  }

  if (!isSafeUrl(parsedUrl)) {
    throw new Error(
      `Target URL '${targetUrl}' is invalid or resolves to a restricted/private network address.`,
    );
  }

  const visitedUrls = new Set<string>();
  const queue: string[] = [parsedUrl.href];
  const maxPages = 100;

  // ── Tier 1 & Tier 2: Opportunistic Sitemaps & robots.txt Discovery ──
  try {
    const sitemapUrls = await discoverAllSitemapUrls(parsedUrl.origin);
    for (const url of sitemapUrls) {
      try {
        const u = new URL(url);
        if (
          u.hostname === parsedUrl.hostname &&
          !visitedUrls.has(u.href) &&
          !queue.includes(u.href)
        ) {
          queue.push(u.href);
        }
      } catch {}
    }
    logger.info(
      `Scraper: Sitemap/robots discovery found ${sitemapUrls.length} potential URLs`,
    );
  } catch (err) {
    logger.debug("Sitemap discovery skipped or unavailable");
  }

  const allProductsFound: ScrapedProduct[] = [];
  let totalKnowledgeChunks = 0;
  let mainPageTitle = parsedUrl.hostname;
  let mainMarkdown = "";

  // ── Tier 3 & Tier 4: Recursive Deep DOM & SPA Route Crawler ──
  while (queue.length > 0 && visitedUrls.size < maxPages) {
    const currentUrlStr = queue.shift()!;
    if (visitedUrls.has(currentUrlStr)) continue;
    visitedUrls.add(currentUrlStr);

    try {
      const currentUrlObj = new URL(currentUrlStr);
      if (!isSafeUrl(currentUrlObj)) continue;

      logger.info(`Scraping page: ${currentUrlStr}`);
      const response = await fetch(currentUrlStr, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LabtoBot/2.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10000), // 10s timeout per page
      });

      if (!response.ok) continue;

      let html = await response.text();

      // Detect Client-Side React/Next.js SPA or SSR Bailout
      const isSpaBailout =
        html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING") ||
        html.includes('data-dgst="BAILOUT') ||
        (html.includes('id="__next"') && html.length < 2500) ||
        (html.includes('id="root"') && html.length < 1500);

      if (isSpaBailout) {
        logger.info(
          `[Scraper] SPA / Client-Side Rendering detected on ${currentUrlStr}. Running Headless Hydration...`,
        );
        const hydratedHtml =
          await fetchRenderedHtmlWithPuppeteer(currentUrlStr);
        if (hydratedHtml && hydratedHtml.length > html.length) {
          html = hydratedHtml;
        }
      }

      // Index current page content
      const { products, chunksCount, pageTitle, pageMarkdown } =
        await indexPageContent(
          currentUrlStr,
          html,
          merchantId,
          parsedUrl.origin,
          currentUrlStr === parsedUrl.href,
        );

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
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
          try {
            const nextUrl = new URL(href, parsedUrl.origin);
            if (nextUrl.hostname === parsedUrl.hostname && !visitedUrls.has(nextUrl.href) && !queue.includes(nextUrl.href)) {
              if (!nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|woff|woff2)$/i)) {
                queue.push(nextUrl.href);
              }
            }
          } catch {}
        }
      });
    } catch (err) {
      logger.error(`Error scraping page ${currentUrlStr}:`, err);
    }
  }

  // Create Master Site Index Chunk for comprehensive site-wide awareness
  try {
    const siteMapOverview =
      `[Site Master Index: ${parsedUrl.hostname}]\nWebsite Title: ${mainPageTitle}\nTotal Indexed Pages (${visitedUrls.size}):\n` +
      Array.from(visitedUrls)
        .map((u) => `- ${u}`)
        .join("\n") +
      (allProductsFound.length > 0
        ? `\nDiscovered Projects & Showcase Items:\n` +
          allProductsFound
            .map(
              (p) =>
                `- [${p.title}](${p.productUrl}) - ${p.description || p.category || ""}`,
            )
            .join("\n")
        : "");

    const indexChunk = await (prisma as any).knowledgeChunk.create({
      data: {
        merchantId,
        url: `${parsedUrl.origin}/#site-master-index`,
        content: siteMapOverview,
      },
    });
    totalKnowledgeChunks++;

    const emb = await generateEmbedding(siteMapOverview);
    if (emb && emb.some((v) => v !== 0)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
        `[${emb.join(",")}]`,
        indexChunk.id,
      );
    }
  } catch (err) {
    logger.error("Failed to generate site master index chunk:", err);
  }

  logger.info(
    `Scraper: Complete! Crawled ${visitedUrls.size} pages. Indexed ${allProductsFound.length} items and ${totalKnowledgeChunks} knowledge chunks.`,
  );

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
export async function scrapeSingleUrl(targetUrl: string, merchantId: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(
      targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`,
    );
  } catch {
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
    throw new Error(
      `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
    );
  }

  let html = await response.text();

  const isSpaBailout =
    html.includes("BAILOUT_TO_CLIENT_SIDE_RENDERING") ||
    html.includes('data-dgst="BAILOUT') ||
    (html.includes('id="__next"') && html.length < 2500) ||
    (html.includes('id="root"') && html.length < 1500);

  if (isSpaBailout) {
    const hydratedHtml = await fetchRenderedHtmlWithPuppeteer(parsedUrl.href);
    if (hydratedHtml && hydratedHtml.length > html.length) {
      html = hydratedHtml;
    }
  }

  return await indexPageContent(
    parsedUrl.href,
    html,
    merchantId,
    parsedUrl.origin,
    false,
  );
}

/**
 * Add a manual custom text/FAQ knowledge chunk
 */
export async function addManualKnowledgeChunk(
  merchantId: string,
  title: string,
  content: string,
  sourceUrl?: string,
) {
  const formattedContent = `# ${title}\nSource: ${sourceUrl || "Merchant Dashboard Note"}\n\n${content}`;

  const chunk = await (prisma as any).knowledgeChunk.create({
    data: {
      merchantId,
      url: sourceUrl || `custom-note-${Date.now()}`,
      content: formattedContent,
    },
  });

  try {
    const emb = await generateEmbedding(formattedContent);
    if (emb && emb.some((v) => v !== 0)) {
      await prisma.$executeRawUnsafe(
        `UPDATE "KnowledgeChunk" SET embedding = $1::vector WHERE id = $2`,
        `[${emb.join(",")}]`,
        chunk.id,
      );
    }
  } catch {}

  return chunk;
}

export interface ScrapeJobStatus {
  isScraping: boolean;
  domain: string;
  pagesCrawled: number;
  maxPages: number;
  status: "in_progress" | "completed" | "failed";
  startTime: number;
  lastUpdated: number;
}

const activeScrapeJobs = new Map<string, ScrapeJobStatus>();

export function getScrapeStatus(merchantId: string): ScrapeJobStatus {
  return (
    activeScrapeJobs.get(merchantId) || {
      isScraping: false,
      domain: "",
      pagesCrawled: 0,
      maxPages: 100,
      status: "completed",
      startTime: 0,
      lastUpdated: Date.now(),
    }
  );
}

export function triggerBackgroundCrawl(
  domains: string | string[],
  merchantId: string,
): { success: boolean; message: string; isAlreadyRunning?: boolean } {
  const domainList = Array.isArray(domains) ? domains : [domains];
  const existingJob = activeScrapeJobs.get(merchantId);
  if (existingJob && existingJob.isScraping) {
    logger.info(`[BackgroundScraper] Scrape already in progress for merchant ${merchantId}`);
    return { success: true, message: 'Crawl already in progress in background', isAlreadyRunning: true };
  }

  const primaryDomain = domainList[0] || 'all';
  const jobStatus: ScrapeJobStatus = {
    isScraping: true,
    domain: primaryDomain,
    pagesCrawled: 0,
    maxPages: 100 * domainList.length,
    status: "in_progress",
    startTime: Date.now(),
    lastUpdated: Date.now(),
  };
  activeScrapeJobs.set(merchantId, jobStatus);

  logger.info(
    `[BackgroundScraper] Launching persistent background crawl for merchant ${merchantId} on domains: ${domainList.join(', ')}`,
  );

  (async () => {
    let totalPages = 0;
    for (const dom of domainList) {
      try {
        jobStatus.domain = dom;
        const result = await scrapeWebsite(dom, merchantId);
        totalPages += result.pagesCrawledCount || 0;
        jobStatus.pagesCrawled = totalPages;
        jobStatus.lastUpdated = Date.now();
      } catch (err) {
        logger.error(`[BackgroundScraper] Persistent background crawl failed for ${dom}:`, err);
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
    logger.info(
      `[BackgroundScraper] Persistent background crawl completed for merchant ${merchantId}`,
    );
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
    logger.error(`[BackgroundScraper] Crawl job failed:`, err);
  });

  return { success: true, message: 'Background crawl initiated successfully' };
}
