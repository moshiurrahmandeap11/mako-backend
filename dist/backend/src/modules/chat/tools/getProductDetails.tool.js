"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductDetailsTool = getProductDetailsTool;
const db_1 = require("../../../config/db");
async function getProductDetailsTool(merchantId, productId) {
    const product = await db_1.prisma.product.findFirst({
        where: {
            merchantId,
            OR: [{ id: productId }, { externalId: productId }],
        },
    });
    if (!product)
        return null;
    return {
        id: product.id,
        title: product.title,
        description: product.description,
        price: Number(product.price),
        currency: product.currency,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        category: product.category,
        inStock: product.inStock,
    };
}
