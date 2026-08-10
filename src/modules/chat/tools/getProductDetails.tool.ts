import { prisma } from '../../../config/db';

export async function getProductDetailsTool(merchantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      OR: [{ id: productId }, { externalId: productId }],
    },
  });

  if (!product) return null;

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
