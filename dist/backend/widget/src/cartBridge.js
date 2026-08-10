"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestAddToCart = requestAddToCart;
function requestAddToCart(productId, quantity = 1) {
    if (typeof window !== 'undefined') {
        const event = new CustomEvent('ai-widget:add-to-cart', {
            detail: {
                productId,
                quantity,
                timestamp: new Date().toISOString(),
            },
            bubbles: true,
            cancelable: true,
        });
        window.dispatchEvent(event);
    }
}
