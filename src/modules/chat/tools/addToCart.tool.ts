import { prisma } from '../../../config/db';

export async function addToCartTool(
  merchantId: string,
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>
) {
  const product = await prisma.product.findFirst({
    where: {
      merchantId,
      OR: [{ id: productId }, { externalId: productId }],
    },
  });

  if (!product) {
    return { success: false, message: 'Product not found.' };
  }

  // Resolve specific variant ID if not provided, but matching selected options
  let resolvedVariantId = variantId;
  const productVariants = (product as any).variants as Array<any> | undefined;
  if (!resolvedVariantId && selectedOptions && Array.isArray(productVariants) && productVariants.length > 0) {
    const matched = productVariants.find((v) => {
      if (!v.options) return false;
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
      options: (product as any).options || undefined,
      variants: (product as any).variants || undefined,
    },
    product: {
      id: product.id,
      externalId: product.externalId,
      title: product.title,
      price: Number(product.price),
      currency: product.currency,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      options: (product as any).options || undefined,
      variants: (product as any).variants || undefined,
    },
  };
}
