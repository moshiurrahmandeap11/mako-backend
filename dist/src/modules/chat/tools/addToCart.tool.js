"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToCartTool = addToCartTool;
const db_1 = require("../../../config/db");
async function addToCartTool(merchantId, productId, quantity = 1, variantId, selectedOptions) {
    const product = await db_1.prisma.product.findFirst({
        where: {
            merchantId,
            OR: [
                { id: productId },
                { externalId: productId },
                { productUrl: { contains: productId } },
                { title: { contains: productId, mode: 'insensitive' } },
            ],
        },
    });
    if (!product) {
        return { success: false, message: 'Product not found.' };
    }
    // Resolve specific variant ID if not provided, but matching selected options
    let resolvedVariantId = variantId;
    const productVariants = product.variants;
    if (!resolvedVariantId && selectedOptions && Array.isArray(productVariants) && productVariants.length > 0) {
        const matched = productVariants.find((v) => {
            if (!v.options)
                return false;
            return Object.entries(selectedOptions).every(([k, val]) => String(v.options[k]).toLowerCase() === String(val).toLowerCase());
        });
        if (matched) {
            resolvedVariantId = String(matched.id);
        }
    }
    return {
        success: true,
        message: `Added ${quantity} x '${product.title}' to cart!`,
        cartAction: {
            productId: product.externalId || product.id,
            variantId: resolvedVariantId,
            quantity,
            selectedOptions,
            options: product.options || undefined,
            variants: product.variants || undefined,
        },
        product: {
            id: product.id,
            externalId: product.externalId,
            title: product.title,
            price: Number(product.price),
            currency: product.currency,
            imageUrl: product.imageUrl,
            productUrl: product.productUrl,
            options: product.options || undefined,
            variants: product.variants || undefined,
        },
    };
}
