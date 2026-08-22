import { logger } from '../../../utils/logger';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Performs a real-time internet web search using DuckDuckGo Instant Answer API / HTML parsing.
 * Returns top relevant search snippets with titles and source URLs.
 */
export async function webSearchTool(
  query: string,
  maxResults: number = 4
): Promise<WebSearchResult[]> {
  try {
    const cleanQuery = encodeURIComponent(query.trim());

    // 1. Primary Attempt: DuckDuckGo RelatedTopics / Abstract API
    const apiUrl = `https://api.duckduckgo.com/?q=${cleanQuery}&format=json&no_html=1&no_redirect=1`;
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(1500) });
    
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const results: WebSearchResult[] = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= maxResults) break;
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.slice(0, 60) + '...',
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }

      if (results.length > 0) {
        logger.info(`[WebSearch] Found ${results.length} live results for query: "${query}"`);
        return results;
      }
    }

    // 2. Fallback: DuckDuckGo Lite HTML Scraper
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${cleanQuery}`;
    const htmlRes = await fetch(htmlUrl, {
      signal: AbortSignal.timeout(1500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (htmlRes.ok) {
      const htmlText = await htmlRes.text();
      const results: WebSearchResult[] = [];

      // Extract result links & snippets via regex
      const regex = /<a class="result__url" href="([^"]+)".*?>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet".*?>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(htmlText)) !== null && results.length < maxResults) {
        let rawUrl = match[1].trim();
        // Clean DuckDuckGo redirect URL
        if (rawUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
          const actualUrl = decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] || '');
          if (actualUrl) rawUrl = actualUrl;
        }

        const snippet = match[3].replace(/<[^>]+>/g, '').trim();
        const title = match[2].replace(/<[^>]+>/g, '').trim() || 'Web Result';

        if (snippet && rawUrl) {
          results.push({ title, url: rawUrl, snippet });
        }
      }

      if (results.length > 0) {
        logger.info(`[WebSearch] Extracted ${results.length} web search snippets for query: "${query}"`);
        return results;
      }
    }
  } catch (error) {
    logger.error('[WebSearch] Error performing live web search:', error);
  }

  return [];
}
