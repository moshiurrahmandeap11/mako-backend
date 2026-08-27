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
                { title: { contains: productId, mode: "insensitive" } },
            ],
        },
    });
    if (!product) {
        return { success: false, message: "Product not found." };
    }
    const productOptions = product.options;
    const productVariants = product.variants;
    // Clean and filter valid provided options
    const cleanSelectedOptions = {};
    if (selectedOptions && typeof selectedOptions === "object") {
        for (const [k, v] of Object.entries(selectedOptions)) {
            if (v &&
                String(v).trim().length > 0 &&
                !/^(null|undefined|none|default)$/i.test(String(v))) {
                cleanSelectedOptions[k] = String(v).trim();
            }
        }
    }
    // Clean and validate variantId
    let cleanVariantId = variantId ? String(variantId).trim() : undefined;
    if (cleanVariantId &&
        /^(size|color|option|quantity|qty|options|null|undefined|none|default|[:,\s]+)$/i.test(cleanVariantId)) {
        cleanVariantId = undefined;
    }
    // Check if options are required and if user has provided all of them
    const hasOptions = Array.isArray(productOptions) && productOptions.length > 0;
    const numProvidedOpts = Object.keys(cleanSelectedOptions).length;
    const requiresSelection = hasOptions && numProvidedOpts < productOptions.length && !cleanVariantId;
    // Resolve specific variant ID if not provided, but matching selected options
    let resolvedVariantId = cleanVariantId;
    if (!resolvedVariantId &&
        numProvidedOpts > 0 &&
        Array.isArray(productVariants) &&
        productVariants.length > 0) {
        const matched = productVariants.find((v) => {
            if (!v.options)
                return false;
            return Object.entries(cleanSelectedOptions).every(([k, val]) => String(v.options[k]).toLowerCase() === String(val).toLowerCase());
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
            title: product.title,
            price: Number(product.price),
            currency: product.currency || "USD",
            imageUrl: product.imageUrl,
            productUrl: product.productUrl,
            variantId: resolvedVariantId,
            quantity,
            selectedOptions: selectedOptions || undefined,
            options: productOptions || undefined,
            variants: productVariants || undefined,
            requiresSelection,
        },
        product: {
            id: product.id,
            externalId: product.externalId,
            title: product.title,
            price: Number(product.price),
            currency: product.currency || "USD",
            imageUrl: product.imageUrl,
            productUrl: product.productUrl,
            options: productOptions || undefined,
            variants: productVariants || undefined,
        },
    };
}
