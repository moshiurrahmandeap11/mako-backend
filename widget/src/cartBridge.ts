/**
 * Universal 4-Tier Zero-Config Cart Bridge
 * Executes Add-to-Cart seamlessly across Shopify, WooCommerce, Custom Headless, and PHP/HTML stores.
 */

export interface AddToCartResult {
  success: boolean;
  platform: 'shopify' | 'woocommerce' | 'dom_simulation' | 'custom_event';
  message: string;
}

/**
 * Checks if the current host page is running on Shopify
 */
export function isShopifyStore(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
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
export function isWooCommerceStore(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
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
async function executeShopifyAddToCart(
  itemIdentifier: string,
  quantity: number = 1,
  properties?: Record<string, string>
): Promise<AddToCartResult> {
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
      .catch(() => {});

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
        const elem = document.querySelector(sel) as HTMLElement;
        if (elem && typeof elem.click === 'function') {
          // Trigger theme drawer
          if (elem.tagName.toLowerCase() === 'cart-drawer' && typeof (elem as any).open === 'function') {
            (elem as any).open();
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
  } catch (err: any) {
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
async function executeWooCommerceAddToCart(
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>
): Promise<AddToCartResult> {
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
      const win = window as any;
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
  } catch (err: any) {
    console.warn('[Labto AI Cart] WooCommerce AJAX failed, trying fallback:', err);
  }

  return {
    success: false,
    platform: 'woocommerce',
    message: 'WooCommerce AJAX fallback needed',
  };
}

/**
 * Tier 3: Smart DOM Simulation (For Custom PHP, Webflow, HTML, Wix, Squarespace)
 */
function executeDomSimulationAddToCart(
  selectedOptions?: Record<string, string>
): boolean {
  if (typeof document === 'undefined') return false;

  try {
    // 1. If options like Size/Color were selected, find matching selects or radio swatches
    if (selectedOptions) {
      Object.entries(selectedOptions).forEach(([optName, optVal]) => {
        const lowerName = optName.toLowerCase();
        const lowerVal = optVal.toLowerCase();

        // Search selects
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const selName = (sel.name || sel.id || sel.getAttribute('data-name') || '').toLowerCase();
          if (selName.includes(lowerName) || lowerName.includes('size') || lowerName.includes('color')) {
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].text.toLowerCase().includes(lowerVal) || sel.options[i].value.toLowerCase().includes(lowerVal)) {
                sel.selectedIndex = i;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }
        }

        // Search radio buttons / buttons / swatches
        const swatches = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"], button, .swatch, .option-btn'));
        for (const sw of swatches) {
          const text = (sw.textContent || (sw as HTMLInputElement).value || '').trim().toLowerCase();
          if (text === lowerVal || text.includes(lowerVal)) {
            (sw as HTMLElement).click();
            break;
          }
        }
      });
    }

    // 2. Find and trigger the native Add to Cart Button
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
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn && btn.offsetParent !== null && typeof btn.click === 'function') {
        btn.click();
        return true;
      }
    }
  } catch (err) {
    console.warn('[Labto AI Cart] DOM Simulation failed:', err);
  }

  return false;
}

/**
 * Tier 4: Global Event Dispatcher & LocalStorage Fallback (For Custom React / Next.js / Headless Stores)
 */
function executeEventAndLocalStorageAddToCart(
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>
): void {
  if (typeof window === 'undefined') return;

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
  window.dispatchEvent(new CustomEvent('labto:cart:add', { detail: eventPayload, bubbles: true }));
  document.dispatchEvent(new CustomEvent('labto:cart:add', { detail: eventPayload, bubbles: true }));

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
        } catch {}
      }
    }
  } catch {}
}

/**
 * Universal Add-to-Cart Orchestrator
 * Automatically detects the store architecture and executes the optimal addition pipeline.
 */
export async function requestAddToCart(
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>,
  productUrl?: string
): Promise<AddToCartResult> {
  if (typeof window === 'undefined') {
    return { success: false, platform: 'custom_event', message: 'Window is not defined' };
  }

  const effectiveVariantId = variantId || productId;

  // 1. Check & Execute Shopify
  if (isShopifyStore()) {
    const shopifyResult = await executeShopifyAddToCart(effectiveVariantId, quantity, selectedOptions);
    if (shopifyResult.success) {
      executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);
      return shopifyResult;
    }
  }

  // 2. Check & Execute WooCommerce
  if (isWooCommerceStore()) {
    const wooResult = await executeWooCommerceAddToCart(productId, quantity, variantId, selectedOptions);
    if (wooResult.success) {
      executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);
      return wooResult;
    }
  }

  // 3. Check & Execute Smart DOM Simulation
  const domSuccess = executeDomSimulationAddToCart(selectedOptions);
  if (domSuccess) {
    executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);
    return {
      success: true,
      platform: 'dom_simulation',
      message: 'Item added via storefront button simulation!',
    };
  }

  // 4. Fallback: Global Event Dispatch & LocalStorage update
  executeEventAndLocalStorageAddToCart(productId, quantity, variantId, selectedOptions);

  return {
    success: true,
    platform: 'custom_event',
    message: 'Cart action dispatched successfully!',
  };
}
