export function requestAddToCart(
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>
) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('ai-widget:add-to-cart', {
      detail: {
        productId,
        quantity,
        variantId,
        selectedOptions,
        timestamp: new Date().toISOString(),
      },
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }
}
