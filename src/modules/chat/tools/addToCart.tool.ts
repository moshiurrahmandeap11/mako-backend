import { prisma } from "../../../config/db";

export async function addToCartTool(
  merchantId: string,
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>,
) {
  const product = await prisma.product.findFirst({
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

  const productOptions = (product as any).options as
    | Array<{ name: string; values: string[] }>
    | undefined;
  const productVariants = (product as any).variants as Array<any> | undefined;

  // Check if options are required and if user has provided all of them
  const hasOptions = Array.isArray(productOptions) && productOptions.length > 0;
  const numProvidedOpts = selectedOptions
    ? Object.keys(selectedOptions).length
    : 0;
  const requiresSelection =
    hasOptions &&
    (!selectedOptions || numProvidedOpts < productOptions.length) &&
    !variantId;

  // Resolve specific variant ID if not provided, but matching selected options
  let resolvedVariantId = variantId;
  if (
    !resolvedVariantId &&
    selectedOptions &&
    Array.isArray(productVariants) &&
    productVariants.length > 0
  ) {
    const matched = productVariants.find((v) => {
      if (!v.options) return false;
      return Object.entries(selectedOptions).every(
        ([k, val]) =>
          String(v.options[k]).toLowerCase() === String(val).toLowerCase(),
      );
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
