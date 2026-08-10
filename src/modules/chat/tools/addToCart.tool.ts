import { prisma } from '../../../config/db';

export async function addToCartTool(merchantId: string, productId: string, quantity: number = 1) {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      OR: [{ id: productId }, { externalId: productId }],
    },
  });

  if (!product) {
    return { success: false, message: 'Product not found.' };
  }

  return {
    success: true,
    message: `Added ${quantity} x '${product.title}' to cart!`,
    cartAction: {
      productId: product.externalId || product.id,
      quantity,
    },
    product: {
      id: product.id,
      title: product.title,
      price: Number(product.price),
      currency: product.currency,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
    },
  };
}
