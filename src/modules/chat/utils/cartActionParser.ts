import { logger } from "../../../utils/logger";
import { addToCartTool } from "../tools/addToCart.tool";

export interface ParsedCartResult {
  cleanedReply: string;
  cartAction: any | null;
  product?: any;
}

/**
 * Sanitizes LLM text response: removes thoughts, raw headers, and broken trailing fragments.
 */
export function sanitizeReplyText(rawReply: string): string {
  let reply = rawReply
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .trim();

  // Remove raw markdown hashtags (#, ##, ###), convert raw * bullets to •, and clean trailing fragments
  reply = reply
    .replace(/#+\s*/g, "")
    .replace(/^[\t ]*\*[\t ]+/gm, "• ")
    .replace(/\n[\t ]*\*[\t ]+/g, "\n• ")
    .replace(/(\n|---|\s)*(#+\s*[^\n]*)$/gi, "")
    .trim();

  // Strip trailing incomplete bullet item (e.g. "\n5. " or "\n5. E-Commerce" without terminal punctuation)
  reply = reply.replace(/(\n|^)\s*(\d+\.|•|-)\s*[^\n.!?।]*$/g, "").trim();

  // If output was abruptly cut off mid-sentence, trim to last complete sentence
  if (
    reply &&
    (!/[.!?\]\)\u0987\u0988\u0989\u098A\u098B\u098C\u098F\u0990\u0993\u0994।]$/.test(
      reply,
    ) ||
      /\([^\)]*$/.test(reply))
  ) {
    const lastPunctIndex = Math.max(
      reply.lastIndexOf("."),
      reply.lastIndexOf("!"),
      reply.lastIndexOf("?"),
      reply.lastIndexOf("।"),
    );
    if (lastPunctIndex > 50) {
      reply = reply.substring(0, lastPunctIndex + 1).trim();
    }
  }

  return reply;
}

/**
 * Parses Cart Action tags (```json:cart_action or [ADD_TO_CART: ...]) from LLM reply.
 */
export async function parseCartActionFromReply(
  replyText: string,
  merchantId: string,
  isBengaliScript: boolean,
  isBanglish: boolean,
): Promise<ParsedCartResult> {
  let finalReply = replyText;
  let cartAction: any = null;
  let product: any = null;

  const jsonCartMatch =
    finalReply.match(/```json:cart_action\s*([\s\S]*?)\s*```/i) ||
    finalReply.match(/\{[\s\S]*?"productId"\s*:\s*"([^"]+)"[\s\S]*?\}/i);
  const tagCartMatch = finalReply.match(/\[ADD_TO_CART:\s*([^\]]+)\]/i);

  if (jsonCartMatch || tagCartMatch) {
    try {
      let targetProdId = "";
      let targetVariantId: string | undefined = undefined;
      let targetOptions: Record<string, string> | undefined = undefined;
      let targetQty = 1;

      if (jsonCartMatch) {
        if (jsonCartMatch[1] && jsonCartMatch[1].startsWith("{")) {
          const parsed = JSON.parse(jsonCartMatch[1]);
          targetProdId = parsed.productId || parsed.id || "";
          targetVariantId = parsed.variantId;
          targetOptions = parsed.selectedOptions || parsed.options;
          targetQty = parsed.quantity || 1;
        } else if (jsonCartMatch[1]) {
          targetProdId = jsonCartMatch[1].trim();
        }
      } else if (tagCartMatch) {
        const rawContent = tagCartMatch[1].trim();
        const parts = rawContent.split(",").map((s) => s.trim());
        targetProdId = parts[0].replace(/^productId:\s*/i, "").trim();

        if (parts.length > 1) {
          const secondPart = parts.slice(1).join(", ");
          const kvMatches = Array.from(
            secondPart.matchAll(/([a-zA-Z0-9_-]+)\s*:\s*([^,]+)/g),
          );
          if (kvMatches.length > 0) {
            for (const match of kvMatches) {
              const k = match[1].trim();
              const v = match[2].trim();
              targetOptions = { ...(targetOptions || {}), [k]: v };
            }
          } else if (/^(xs|s|m|l|xl|xxl|2xl|3xl|\d{2})$/i.test(secondPart)) {
            targetOptions = {
              ...(targetOptions || {}),
              Size: secondPart.toUpperCase(),
            };
          } else {
            targetVariantId = secondPart;
          }
        }
      }

      // Hard sanitization: Strip all raw tags and markdown blocks from user-visible reply
      finalReply = finalReply
        .replace(/```json:cart_action[\s\S]*?```/gi, "")
        .replace(/\[ADD_TO_CART:\s*[^\]]+\]/gi, "")
        .trim();

      if (targetProdId) {
        const res = await addToCartTool(
          merchantId,
          targetProdId,
          targetQty,
          targetVariantId,
          targetOptions,
        );
        if (res.cartAction) cartAction = res.cartAction;
        if (res.product) product = res.product;

        // If the reply became empty after stripping tag, provide clean message
        if (!finalReply || finalReply.length < 3) {
          const prodTitle = res.product?.title || "Product";
          const prodUrl = res.product?.productUrl || "#";
          const hasUnselectedOptions =
            res.product?.options &&
            (res.product.options as any[]).length > 0 &&
            (!targetOptions || Object.keys(targetOptions).length === 0);

          if (hasUnselectedOptions) {
            const optNames =
              (res.product?.options as any[])
                ?.map((o: any) => o.name)
                .join(" o ") || "Size";
            if (isBengaliScript) {
              finalReply = `[${prodTitle}](${prodUrl})-এর জন্য আপনার কোন ${optNames}টি পছন্দ?`;
            } else if (isBanglish) {
              finalReply = `[${prodTitle}](${prodUrl}) er jonno apnar kon ${optNames} ta lagbe?`;
            } else {
              finalReply = `Which ${optNames} would you prefer for [${prodTitle}](${prodUrl})?`;
            }
          } else {
            const optNote =
              targetOptions && Object.keys(targetOptions).length > 0
                ? ` (${Object.entries(targetOptions)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")})`
                : "";
            if (isBengaliScript) {
              finalReply = `[${prodTitle}](${prodUrl})${optNote} কার্টে যোগ করা হয়েছে! 🛍️`;
            } else if (isBanglish) {
              finalReply = `[${prodTitle}](${prodUrl})${optNote} cart e add kora hoyeche! 🛍️`;
            } else {
              finalReply = `Added [${prodTitle}](${prodUrl})${optNote} to your cart! 🛍️`;
            }
          }
        }
      }
    } catch (parseErr) {
      logger.error("Failed to parse cart action tag:", parseErr);
    }
  }

  // Safe fallback sanitization
  finalReply = finalReply
    .replace(/```json:cart_action[\s\S]*?```/gi, "")
    .replace(/\[ADD_TO_CART:\s*[^\]]+\]/gi, "")
    .trim();

  return { cleanedReply: finalReply, cartAction, product };
}

/**
 * Fallback stub for legacy calls if any.
 * All action decisions are natively driven by the AI's structured tags in parseCartActionFromReply.
 */
export async function smartExtractCartAction(
  _finalReply: string,
  _userMessage: string,
  _merchantId: string,
): Promise<{ cartAction: any | null; product?: any }> {
  return { cartAction: null };
}
