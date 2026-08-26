"use strict";
/**
 * Universal 4-Tier Zero-Config Cart Bridge
 * Executes Add-to-Cart seamlessly across Shopify, WooCommerce, Custom Headless, and PHP/HTML stores.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isShopifyStore = isShopifyStore;
exports.isWooCommerceStore = isWooCommerceStore;
exports.isHeadlessBridgeActive = isHeadlessBridgeActive;
exports.initAutoAddWatcher = initAutoAddWatcher;
exports.requestAddToCart = requestAddToCart;
/**
 * Checks if the current host page is running on Shopify
 */
function isShopifyStore() {
    if (typeof window === 'undefined')
        return false;
    const win = window;
    if (win.Shopify && (win.Shopify.shop || win.Shopify.theme || win.Shopify.routes)) {
        return true;
    }
    // Check if meta tags or script tags exist
    if (document.querySelector('meta[name="shopify-digital-wallet"]') || document.querySelector('link[href*="cdn.shopify.com"]')) {
        return true;
    }
    return false;
}
/**
 * Checks if the current host page is running on WooCommerce / WordPress
 */
function isWooCommerceStore() {
    if (typeof window === 'undefined')
        return false;
    const win = window;
    if (win.wc_add_to_cart_params || win.woocommerce_params || win.wc_cart_fragments_params) {
        return true;
    }
    if (document.body && (document.body.classList.contains('woocommerce') || document.body.classList.contains('woocommerce-page'))) {
        return true;
    }
    if (document.querySelector('.woocommerce, [class*="woocommerce"], form.variations_form')) {
        return true;
    }
    return false;
}
/**
 * Tier 1: Shopify Native Ajax Cart Addition
 */
async function executeShopifyAddToCart(itemIdentifier, quantity = 1, properties) {
    try {
        const rawId = itemIdentifier.replace(/[^0-9]/g, '');
        const variantId = rawId ? Number(rawId) : itemIdentifier;
        const payload = {
            items: [
                {
                    id: variantId,
                    quantity: quantity || 1,
                    ...(properties ? { properties } : {}),
                },
            ],
        };
        const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.description || errJson.message || `Shopify responded with status ${res.status}`);
        }
        const data = await res.json();
        // Fetch fresh cart state & dispatch standard theme cart events
        fetch('/cart.js')
            .then((r) => r.json())
            .then((cartData) => {
            document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: cartData }, bubbles: true }));
            document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart: cartData }, bubbles: true }));
            document.dispatchEvent(new CustomEvent('cart:change', { detail: { cart: cartData }, bubbles: true }));
            window.dispatchEvent(new CustomEvent('shopify:cart:updated', { detail: { cart: cartData } }));
        })
            .catch(() => { });
        // Try opening the Shopify Theme Cart Drawer if present
        setTimeout(() => {
            const drawerSelectors = [
                '[data-cart-drawer-toggle]',
                '[aria-controls="CartDrawer"]',
                '.cart-drawer-open',
                '.js-drawer-open-cart',
                '.header__icon--cart',
                'cart-drawer',
                '#cart-icon-bubble',
                'a[href="/cart"]',
            ];
            for (const sel of drawerSelectors) {
                const elem = document.querySelector(sel);
                if (elem && typeof elem.click === 'function') {
                    // Trigger theme drawer
                    if (elem.tagName.toLowerCase() === 'cart-drawer' && typeof elem.open === 'function') {
                        elem.open();
                        break;
                    }
                }
            }
        }, 150);
        return {
            success: true,
            platform: 'shopify',
            message: 'Item added to Shopify cart successfully!',
        };
    }
    catch (err) {
        console.warn('[Labto AI Cart] Shopify Ajax Add failed, falling back to DOM/events:', err);
        return {
            success: false,
            platform: 'shopify',
            message: err.message || 'Failed to add item to Shopify cart',
        };
    }
}
/**
 * Tier 2: WooCommerce Native Ajax Cart Addition
 */
async function executeWooCommerceAddToCart(productId, quantity = 1, variantId, selectedOptions) {
    try {
        const formData = new URLSearchParams();
        const cleanProductId = productId.replace(/[^0-9]/g, '') || productId;
        formData.append('product_id', cleanProductId);
        formData.append('quantity', String(quantity || 1));
        if (variantId) {
            const cleanVarId = variantId.replace(/[^0-9]/g, '') || variantId;
            formData.append('variation_id', cleanVarId);
        }
        if (selectedOptions) {
            Object.entries(selectedOptions).forEach(([k, v]) => {
                const key = k.toLowerCase().replace(/\s+/g, '_');
                formData.append(`attribute_${key}`, v);
            });
        }
        // Try standard WooCommerce AJAX endpoint
        const res = await fetch('/?wc-ajax=add_to_cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
            body: formData,
        });
        if (res.ok) {
            const win = window;
            if (win.jQuery) {
                win.jQuery(document.body).trigger('added_to_cart');
                win.jQuery(document.body).trigger('wc_fragment_refresh');
            }
            return {
                success: true,
                platform: 'woocommerce',
                message: 'Item added to WooCommerce cart!',
            };
        }
    }
    catch (err) {
        console.warn('[Labto AI Cart] WooCommerce AJAX failed, trying fallback:', err);
    }
    return {
        success: false,
        platform: 'woocommerce',
        message: 'WooCommerce AJAX fallback needed',
    };
}
/**
 * Checks if the current host page has registered a custom Headless / Event Bridge listener
 */
function isHeadlessBridgeActive() {
    if (typeof window === 'undefined')
        return false;
    const win = window;
    return Boolean(win.__LABTO_EVENT_BRIDGE__ ||
        win.__LABTO_CART_LISTENER__ ||
        win.aiWidgetEventBridge ||
        win.hasLabtoCartBridge);
}
/**
 * Tier 3: Smart DOM Simulation (For Custom React, Next.js, Vue, PHP, Webflow, HTML, Wix, Squarespace)
 */
async function executeDomSimulationAddToCart(selectedOptions) {
    if (typeof document === 'undefined')
        return false;
    try {
        // 1. If options like Size/Storage/Weight/Color were selected, find and click matching options / swatches / buttons
        if (selectedOptions && Object.keys(selectedOptions).length > 0) {
            let optionClicked = false;
            for (const [optName, optVal] of Object.entries(selectedOptions)) {
                const lowerName = String(optName).toLowerCase().trim();
                const lowerVal = String(optVal).toLowerCase().trim();
                // A. Search native <select> dropdowns
                const selects = Array.from(document.querySelectorAll('select'));
                for (const sel of selects) {
                    const selName = (sel.name || sel.id || sel.getAttribute('data-name') || '').toLowerCase();
                    if (selName.includes(lowerName) ||
                        lowerName.includes('size') ||
                        lowerName.includes('color') ||
                        lowerName.includes('storage') ||
                        lowerName.includes('weight') ||
                        lowerName.includes('ram')) {
                        for (let i = 0; i < sel.options.length; i++) {
                            const optText = sel.options[i].text.toLowerCase().trim();
                            const optV = sel.options[i].value.toLowerCase().trim();
                            if (optText === lowerVal || optV === lowerVal || optText.includes(lowerVal)) {
                                sel.selectedIndex = i;
                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                sel.dispatchEvent(new Event('input', { bubbles: true }));
                                optionClicked = true;
                                break;
                            }
                        }
                    }
                }
                // B. Search interactive buttons, swatches, radio buttons, and pill chips
                const clickableOptions = Array.from(document.querySelectorAll('button, input[type="radio"], [role="radio"], [role="button"], .swatch, .option-btn, [data-size], [data-value], [data-color], [data-storage], [data-weight], [data-ram]'));
                for (const el of clickableOptions) {
                    const text = (el.textContent ||
                        el.value ||
                        el.getAttribute('data-value') ||
                        el.getAttribute('data-size') ||
                        el.getAttribute('data-color') ||
                        el.getAttribute('data-storage') ||
                        '')
                        .trim()
                        .toLowerCase();
                    if (text === lowerVal) {
                        const htmlEl = el;
                        // Prevent default submission if button is inside a form without type="button"
                        if (htmlEl.tagName.toLowerCase() === 'button' && !htmlEl.getAttribute('type')) {
                            htmlEl.setAttribute('type', 'button');
                        }
                        htmlEl.focus();
                        htmlEl.click(); // Single clean click trigger
                        optionClicked = true;
                        break;
                    }
                }
            }
            // If an option was selected, wait briefly for React/Vue/Next.js state hydration
            if (optionClicked) {
                await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 160)));
            }
        }
        // 2. Find and trigger the native Add to Cart Button (Single clean click trigger)
        const buttonSelectors = [
            'form[action*="cart"] button[type="submit"]',
            'form[action*="cart"] input[type="submit"]',
            'button[name="add"]',
            'button[id*="add-to-cart" i]',
            'button[class*="add-to-cart" i]',
            'button[class*="single_add_to_cart" i]',
            '[data-action="add-to-cart" i]',
            '[data-testid*="add-to-cart" i]',
            '.add-to-cart-btn',
            '.single_add_to_cart_button',
            '.product-form__submit',
            '#AddToCart',
        ];
        for (const sel of buttonSelectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.offsetParent !== null && typeof btn.click === 'function') {
                btn.focus();
                btn.click(); // Single clean click trigger (no duplicate dispatchEvent)
                return true;
            }
        }
        // 3. Fallback: Search all buttons / submit inputs for Add to Cart text
        const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
        for (const b of allButtons) {
            const text = (b.textContent || b.value || '').trim().toLowerCase();
            if (/add\s*to\s*cart|add\s*to\s*bag|buy\s*now/i.test(text) && b.offsetParent !== null) {
                const btnEl = b;
                btnEl.focus();
                btnEl.click(); // Single clean click trigger
                return true;
            }
        }
    }
    catch (err) {
        console.warn('[Labto AI Cart] DOM Simulation notice:', err);
    }
    return false;
}
let isAutoAdding = false;
/**
 * Auto-Add Watcher for Cross-Page Navigations (e.g. user clicked Add to Cart from /cart or /collection)
 */
function initAutoAddWatcher() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    try {
        const raw = sessionStorage.getItem('labto_auto_add');
        if (!raw)
            return;
        // Immediately remove from sessionStorage to prevent concurrent execution
        sessionStorage.removeItem('labto_auto_add');
        if (isAutoAdding)
            return;
        isAutoAdding = true;
        const data = JSON.parse(raw);
        if (Date.now() - (data.timestamp || 0) > 60000) {
            isAutoAdding = false;
            return;
        }
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts++;
            if (attempts > 25) {
                clearInterval(interval);
                isAutoAdding = false;
                return;
            }
            const clicked = await executeDomSimulationAddToCart(data.options);
            if (clicked) {
                clearInterval(interval);
                isAutoAdding = false;
                // Dispatch custom event for headless sync
                executeEventAndLocalStorageAddToCart(data.productId, data.quantity, data.variantId, data.options);
                window.dispatchEvent(new CustomEvent('labto:toast', { detail: { message: 'Added to cart successfully!' } }));
            }
        }, 250);
    }
    catch {
        isAutoAdding = false;
    }
}
/**
 * Tier 4: Global Event Dispatcher & LocalStorage Fallback (For Custom React / Next.js / Headless Stores)
 */
function executeEventAndLocalStorageAddToCart(productId, quantity = 1, variantId, selectedOptions) {
    if (typeof window === 'undefined')
        return;
    const eventPayload = {
        productId,
        quantity: quantity || 1,
        variantId: variantId || productId,
        selectedOptions: selectedOptions || {},
        timestamp: new Date().toISOString(),
    };
    // Dispatch standard events for headless React/Vue/Next.js stores
    window.dispatchEvent(new CustomEvent('ai-widget:add-to-cart', { detail: eventPayload, bubbles: true }));
    window.dispatchEvent(new CustomEvent('labto:add_to_cart', { detail: eventPayload, bubbles: true }));
    // Safe fallback to common localStorage cart keys
    try {
        const keysToCheck = ['cart_items', 'cart', 'shopping_cart', 'labto_cart'];
        for (const key of keysToCheck) {
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        parsed.push({
                            id: variantId || productId,
                            productId,
                            variantId,
                            quantity,
                            options: selectedOptions,
                            addedAt: new Date().toISOString(),
                        });
                        localStorage.setItem(key, JSON.stringify(parsed));
                        break;
                    }
                }
                catch { }
            }
        }
    }
    catch { }
}
/**
 * Universal Add-to-Cart Orchestrator
 * Uses a strict Execution State Machine to eliminate duplicate clicks and event collision.
 */
async function requestAddToCart(productId, quantity = 1, variantId, selectedOptions, productUrl, forceEventOnly = false) {
    if (typeof window === 'undefined') {
        return { success: false, platform: 'custom_event', message: 'Window is not defined' };
    }
    const effectiveVariantId = variantId || productId;
    // 1. Check & Execute Headless / Event Bridge Mode (Bypasses DOM clicks entirely)
    if (forceEventOnly || isHeadlessBridgeActive()) {
        executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);
        return {
            success: true,
            platform: 'custom_event',
            message: 'Item added to cart!',
        };
    }
    // 2. Check & Execute Shopify Native
    if (isShopifyStore()) {
        const shopifyResult = await executeShopifyAddToCart(effectiveVariantId, quantity, selectedOptions);
        if (shopifyResult.success) {
            return shopifyResult;
        }
    }
    // 3. Check & Execute WooCommerce Native
    if (isWooCommerceStore()) {
        const wooResult = await executeWooCommerceAddToCart(productId, quantity, variantId, selectedOptions);
        if (wooResult.success) {
            return wooResult;
        }
    }
    // 4. Check & Execute Smart DOM Simulation on Current Page
    const domSuccess = await executeDomSimulationAddToCart(selectedOptions);
    if (domSuccess) {
        return {
            success: true,
            platform: 'dom_simulation',
            message: 'Item added to cart!',
        };
    }
    // 5. Cross-Page Navigation for Custom Stores (if visitor is on /collection, /cart, or another page)
    if (productUrl && productUrl !== '#' && typeof window !== 'undefined') {
        try {
            const targetUrl = new URL(productUrl, window.location.origin);
            if (targetUrl.pathname !== window.location.pathname) {
                sessionStorage.setItem('labto_auto_add', JSON.stringify({
                    productId,
                    variantId,
                    options: selectedOptions,
                    quantity: quantity || 1,
                    timestamp: Date.now(),
                }));
                window.location.href = targetUrl.href;
                return {
                    success: true,
                    platform: 'dom_simulation',
                    message: 'Opening product page to add item...',
                };
            }
        }
        catch (err) {
            console.warn('[Labto AI Cart] Cross page navigation notice:', err);
        }
    }
    // 6. Final Fallback: Dispatch custom event & update LocalStorage
    executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);
    return {
        success: true,
        platform: 'custom_event',
        message: 'Added to cart!',
    };
}
