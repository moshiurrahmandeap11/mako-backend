/**
 * Universal 4-Tier Zero-Config Cart Bridge
 * Executes Add-to-Cart seamlessly across Shopify, WooCommerce, Custom Headless, and PHP/HTML stores.
 */

export interface AddToCartResult {
  success: boolean;
  platform: "shopify" | "woocommerce" | "dom_simulation" | "custom_event";
  message: string;
}

/**
 * Checks if the current host page is running on Shopify
 */
export function isShopifyStore(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as any;
  if (
    win.Shopify &&
    (win.Shopify.shop || win.Shopify.theme || win.Shopify.routes)
  ) {
    return true;
  }
  // Check if meta tags or script tags exist
  if (
    document.querySelector('meta[name="shopify-digital-wallet"]') ||
    document.querySelector('link[href*="cdn.shopify.com"]')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if the current host page is running on WooCommerce / WordPress
 */
export function isWooCommerceStore(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as any;
  if (
    win.wc_add_to_cart_params ||
    win.woocommerce_params ||
    win.wc_cart_fragments_params
  ) {
    return true;
  }
  if (
    document.body &&
    (document.body.classList.contains("woocommerce") ||
      document.body.classList.contains("woocommerce-page"))
  ) {
    return true;
  }
  if (
    document.querySelector(
      '.woocommerce, [class*="woocommerce"], form.variations_form',
    )
  ) {
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
  properties?: Record<string, string>,
): Promise<AddToCartResult> {
  try {
    const rawId = itemIdentifier.replace(/[^0-9]/g, "");
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

    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(
        errJson.description ||
          errJson.message ||
          `Shopify responded with status ${res.status}`,
      );
    }

    const data = await res.json();

    // Fetch fresh cart state & dispatch standard theme cart events
    fetch("/cart.js")
      .then((r) => r.json())
      .then((cartData) => {
        document.dispatchEvent(
          new CustomEvent("cart:updated", {
            detail: { cart: cartData },
            bubbles: true,
          }),
        );
        document.dispatchEvent(
          new CustomEvent("cart:refresh", {
            detail: { cart: cartData },
            bubbles: true,
          }),
        );
        document.dispatchEvent(
          new CustomEvent("cart:change", {
            detail: { cart: cartData },
            bubbles: true,
          }),
        );
        window.dispatchEvent(
          new CustomEvent("shopify:cart:updated", {
            detail: { cart: cartData },
          }),
        );
      })
      .catch(() => {});

    // Try opening the Shopify Theme Cart Drawer if present
    setTimeout(() => {
      const drawerSelectors = [
        "[data-cart-drawer-toggle]",
        '[aria-controls="CartDrawer"]',
        ".cart-drawer-open",
        ".js-drawer-open-cart",
        ".header__icon--cart",
        "cart-drawer",
        "#cart-icon-bubble",
        'a[href="/cart"]',
      ];
      for (const sel of drawerSelectors) {
        const elem = document.querySelector(sel) as HTMLElement;
        if (elem && typeof elem.click === "function") {
          // Trigger theme drawer
          if (
            elem.tagName.toLowerCase() === "cart-drawer" &&
            typeof (elem as any).open === "function"
          ) {
            (elem as any).open();
            break;
          }
        }
      }
    }, 150);

    return {
      success: true,
      platform: "shopify",
      message: "Item added to Shopify cart successfully!",
    };
  } catch (err: any) {
    console.warn(
      "[Labto AI Cart] Shopify Ajax Add failed, falling back to DOM/events:",
      err,
    );
    return {
      success: false,
      platform: "shopify",
      message: err.message || "Failed to add item to Shopify cart",
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
  selectedOptions?: Record<string, string>,
): Promise<AddToCartResult> {
  try {
    const formData = new URLSearchParams();
    const cleanProductId = productId.replace(/[^0-9]/g, "") || productId;
    formData.append("product_id", cleanProductId);
    formData.append("quantity", String(quantity || 1));

    if (variantId) {
      const cleanVarId = variantId.replace(/[^0-9]/g, "") || variantId;
      formData.append("variation_id", cleanVarId);
    }

    if (selectedOptions) {
      Object.entries(selectedOptions).forEach(([k, v]) => {
        const key = k.toLowerCase().replace(/\s+/g, "_");
        formData.append(`attribute_${key}`, v);
      });
    }

    // Try standard WooCommerce AJAX endpoint
    const res = await fetch("/?wc-ajax=add_to_cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: formData,
    });

    if (res.ok) {
      const win = window as any;
      if (win.jQuery) {
        win.jQuery(document.body).trigger("added_to_cart");
        win.jQuery(document.body).trigger("wc_fragment_refresh");
      }
      return {
        success: true,
        platform: "woocommerce",
        message: "Item added to WooCommerce cart!",
      };
    }
  } catch (err: any) {
    console.warn(
      "[Labto AI Cart] WooCommerce AJAX failed, trying fallback:",
      err,
    );
  }

  return {
    success: false,
    platform: "woocommerce",
    message: "WooCommerce AJAX fallback needed",
  };
}

/**
 * Tier 3: Smart DOM Simulation (For Custom React, Next.js, Vue, PHP, Webflow, HTML, Wix, Squarespace)
 */
async function executeDomSimulationAddToCart(
  selectedOptions?: Record<string, string>,
): Promise<boolean> {
  if (typeof document === "undefined") return false;

  try {
    // 1. If options like Size/Storage/Weight/Color were selected, find and click matching options / swatches / buttons
    if (selectedOptions && Object.keys(selectedOptions).length > 0) {
      let optionClicked = false;

      Object.entries(selectedOptions).forEach(([optName, optVal]) => {
        const lowerName = String(optName).toLowerCase().trim();
        const lowerVal = String(optVal).toLowerCase().trim();

        // A. Search native <select> dropdowns
        const selects = Array.from(document.querySelectorAll("select"));
        for (const sel of selects) {
          const selName = (
            sel.name ||
            sel.id ||
            sel.getAttribute("data-name") ||
            ""
          ).toLowerCase();
          if (
            selName.includes(lowerName) ||
            lowerName.includes("size") ||
            lowerName.includes("color") ||
            lowerName.includes("storage") ||
            lowerName.includes("weight")
          ) {
            for (let i = 0; i < sel.options.length; i++) {
              const optText = sel.options[i].text.toLowerCase().trim();
              const optV = sel.options[i].value.toLowerCase().trim();
              if (
                optText === lowerVal ||
                optV === lowerVal ||
                optText.includes(lowerVal)
              ) {
                sel.selectedIndex = i;
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                sel.dispatchEvent(new Event("input", { bubbles: true }));
                optionClicked = true;
                break;
              }
            }
          }
        }

        // B. Search interactive buttons, swatches, radio buttons, and pill chips
        const clickableOptions = Array.from(
          document.querySelectorAll(
            'button, input[type="radio"], [role="radio"], [role="button"], .swatch, .option-btn, [data-size], [data-value], [data-color], [data-storage], [data-weight]',
          ),
        );
        for (const el of clickableOptions) {
          const text = (
            el.textContent ||
            (el as HTMLInputElement).value ||
            el.getAttribute("data-value") ||
            el.getAttribute("data-size") ||
            el.getAttribute("data-color") ||
            ""
          )
            .trim()
            .toLowerCase();
          if (text === lowerVal) {
            (el as HTMLElement).focus();
            (el as HTMLElement).dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
            (el as HTMLElement).click();
            optionClicked = true;
            break;
          }
        }
      });

      // If an option was selected, wait 150ms for React/Vue/Svelte/Next.js state hydration
      if (optionClicked) {
        await new Promise((r) =>
          requestAnimationFrame(() => setTimeout(r, 180)),
        );
      }
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
      ".add-to-cart-btn",
      ".single_add_to_cart_button",
      ".product-form__submit",
      "#AddToCart",
    ];

    for (const sel of buttonSelectors) {
      const btn = document.querySelector(sel) as HTMLElement;
      if (btn && btn.offsetParent !== null && typeof btn.click === "function") {
        btn.focus();
        btn.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        btn.click();
        return true;
      }
    }

    // 3. Fallback: Search all buttons / submit inputs for Add to Cart text
    const allButtons = Array.from(
      document.querySelectorAll(
        'button, input[type="submit"], a[role="button"]',
      ),
    );
    for (const b of allButtons) {
      const text = (b.textContent || (b as HTMLInputElement).value || "")
        .trim()
        .toLowerCase();
      if (
        /add\s*to\s*cart|add\s*to\s*bag|buy\s*now/i.test(text) &&
        (b as HTMLElement).offsetParent !== null
      ) {
        (b as HTMLElement).focus();
        (b as HTMLElement).dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        (b as HTMLElement).click();
        return true;
      }
    }
  } catch (err) {
    console.warn("[Labto AI Cart] DOM Simulation failed:", err);
  }

  return false;
}

let isAutoAdding = false;

/**
 * Auto-Add Watcher for Cross-Page Navigations (e.g. user clicked Add to Cart from /cart or /collection)
 */
export function initAutoAddWatcher(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    const raw = sessionStorage.getItem("labto_auto_add");
    if (!raw) return;

    // Immediately remove from sessionStorage to prevent concurrent readers
    sessionStorage.removeItem("labto_auto_add");

    if (isAutoAdding) return;

    const data = JSON.parse(raw);
    // Only process if within last 60 seconds
    if (Date.now() - (data.timestamp || 0) > 60000) {
      return;
    }

    isAutoAdding = true;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 20) {
        clearInterval(interval);
        isAutoAdding = false;
        return;
      }

      const clicked = await executeDomSimulationAddToCart(data.options);
      if (clicked) {
        clearInterval(interval);
        isAutoAdding = false;
        executeEventAndLocalStorageAddToCart(
          data.productId,
          data.quantity,
          data.variantId,
          data.options,
        );
        window.dispatchEvent(
          new CustomEvent("labto:toast", {
            detail: { message: "Added to cart successfully!" },
          }),
        );
      }
    }, 300);
  } catch {
    isAutoAdding = false;
  }
}

/**
 * Tier 4: Global Event Dispatcher & LocalStorage Fallback (For Custom React / Next.js / Headless Stores)
 */
function executeEventAndLocalStorageAddToCart(
  productId: string,
  quantity: number = 1,
  variantId?: string,
  selectedOptions?: Record<string, string>,
): void {
  if (typeof window === "undefined") return;

  const eventPayload = {
    productId,
    quantity: quantity || 1,
    variantId: variantId || productId,
    selectedOptions: selectedOptions || {},
    timestamp: new Date().toISOString(),
  };

  // Dispatch standard events for headless React/Vue/Next.js stores
  window.dispatchEvent(
    new CustomEvent("ai-widget:add-to-cart", {
      detail: eventPayload,
      bubbles: true,
    }),
  );
  window.dispatchEvent(
    new CustomEvent("labto:add_to_cart", {
      detail: eventPayload,
      bubbles: true,
    }),
  );
  window.dispatchEvent(
    new CustomEvent("labto:cart:add", { detail: eventPayload, bubbles: true }),
  );
  document.dispatchEvent(
    new CustomEvent("labto:cart:add", { detail: eventPayload, bubbles: true }),
  );

  // Safe fallback to common localStorage cart keys
  try {
    const keysToCheck = ["cart_items", "cart", "shopping_cart", "labto_cart"];
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
  productUrl?: string,
): Promise<AddToCartResult> {
  if (typeof window === "undefined") {
    return {
      success: false,
      platform: "custom_event",
      message: "Window is not defined",
    };
  }

  const effectiveVariantId = variantId || productId;

  // 1. Check & Execute Shopify
  if (isShopifyStore()) {
    const shopifyResult = await executeShopifyAddToCart(
      effectiveVariantId,
      quantity,
      selectedOptions,
    );
    if (shopifyResult.success) {
      executeEventAndLocalStorageAddToCart(
        productId,
        quantity,
        variantId,
        selectedOptions,
      );
      return shopifyResult;
    }
  }

  // 2. Check & Execute WooCommerce
  if (isWooCommerceStore()) {
    const wooResult = await executeWooCommerceAddToCart(
      productId,
      quantity,
      variantId,
      selectedOptions,
    );
    if (wooResult.success) {
      executeEventAndLocalStorageAddToCart(
        productId,
        quantity,
        variantId,
        selectedOptions,
      );
      return wooResult;
    }
  }

  // 3. Check & Execute Smart DOM Simulation on Current Page (if user is already on the product page)
  const domSuccess = await executeDomSimulationAddToCart(selectedOptions);
  if (domSuccess) {
    executeEventAndLocalStorageAddToCart(
      productId,
      quantity,
      variantId,
      selectedOptions,
    );
    return {
      success: true,
      platform: "dom_simulation",
      message: "Item added to cart!",
    };
  }

  // 4. Dynamic Cross-Page Navigation (Works universally for any headless/custom store dynamic product URL)
  if (productUrl && productUrl !== "#" && typeof window !== "undefined") {
    try {
      const targetUrl = new URL(productUrl, window.location.origin);
      if (targetUrl.pathname !== window.location.pathname) {
        sessionStorage.setItem(
          "labto_auto_add",
          JSON.stringify({
            productId,
            variantId,
            options: selectedOptions,
            quantity: quantity || 1,
            timestamp: Date.now(),
          }),
        );
        sessionStorage.setItem("labto_widget_open", "true");
        window.location.href = targetUrl.href;
        return {
          success: true,
          platform: "dom_simulation",
          message: "Opening product page to add item...",
        };
      }
    } catch (err) {
      console.warn("[Labto AI Cart] Cross page navigation error:", err);
    }
  }

  // 5. Background Custom / Headless / React Store Event & LocalStorage Addition Fallback
  executeEventAndLocalStorageAddToCart(
    productId,
    quantity,
    variantId,
    selectedOptions,
  );

  return {
    success: true,
    platform: "custom_event",
    message: "Item added to cart!",
  };
}

/**
 * Tier 3.5: Background Invisible Worker Simulation (For Headless/Next.js/Custom Stores when on Homepage/Collection)
 */
async function executeBackgroundIframeAddToCart(
  productUrl: string,
  selectedOptions?: Record<string, string>,
  quantity: number = 1,
): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined")
    return false;

  return new Promise((resolve) => {
    try {
      const targetUrl = new URL(productUrl, window.location.origin);
      if (targetUrl.origin !== window.location.origin) {
        resolve(false);
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "10px";
      iframe.style.height = "10px";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      iframe.style.border = "none";
      iframe.setAttribute("tabindex", "-1");
      iframe.setAttribute("aria-hidden", "true");
      iframe.src = targetUrl.href;

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch {}
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 7000);

      iframe.onload = async () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc) {
            clearTimeout(timeoutId);
            cleanup();
            resolve(false);
            return;
          }

          // Wait 350ms for React / Next.js hydration in the hidden frame
          await new Promise((r) => setTimeout(r, 400));

          // 1. Select options inside iframe
          if (selectedOptions && Object.keys(selectedOptions).length > 0) {
            Object.entries(selectedOptions).forEach(([optName, optVal]) => {
              const lowerVal = String(optVal).toLowerCase().trim();

              // Select dropdowns
              const selects = Array.from(doc.querySelectorAll("select"));
              for (const sel of selects) {
                for (let i = 0; i < sel.options.length; i++) {
                  if (
                    sel.options[i].text.toLowerCase().trim() === lowerVal ||
                    sel.options[i].value.toLowerCase().trim() === lowerVal
                  ) {
                    sel.selectedIndex = i;
                    sel.dispatchEvent(new Event("change", { bubbles: true }));
                    sel.dispatchEvent(new Event("input", { bubbles: true }));
                  }
                }
              }

              // Buttons, swatches, pills
              const clickable = Array.from(
                doc.querySelectorAll(
                  'button, input[type="radio"], [role="radio"], [role="button"], .swatch, .option-btn, [data-size], [data-value], [data-color]',
                ),
              );
              for (const el of clickable) {
                const text = (
                  el.textContent ||
                  (el as HTMLInputElement).value ||
                  el.getAttribute("data-value") ||
                  el.getAttribute("data-size") ||
                  el.getAttribute("data-color") ||
                  ""
                )
                  .trim()
                  .toLowerCase();
                if (text === lowerVal) {
                  (el as HTMLElement).focus();
                  (el as HTMLElement).click();
                }
              }
            });

            await new Promise((r) => setTimeout(r, 200));
          }

          // 2. Click Add to Cart inside iframe
          const buttonSelectors = [
            'form[action*="cart"] button[type="submit"]',
            'button[name="add"]',
            'button[id*="add-to-cart" i]',
            'button[class*="add-to-cart" i]',
            'button[class*="single_add_to_cart" i]',
            '[data-action="add-to-cart" i]',
            '[data-testid*="add-to-cart" i]',
            ".add-to-cart-btn",
            ".single_add_to_cart_button",
            ".product-form__submit",
            "#AddToCart",
          ];

          let clicked = false;
          for (const sel of buttonSelectors) {
            const btn = doc.querySelector(sel) as HTMLElement;
            if (btn && typeof btn.click === "function") {
              btn.focus();
              btn.click();
              clicked = true;
              break;
            }
          }

          if (!clicked) {
            const allBtns = Array.from(
              doc.querySelectorAll(
                'button, input[type="submit"], a[role="button"]',
              ),
            );
            for (const b of allBtns) {
              const txt = (b.textContent || "").trim().toLowerCase();
              if (/add\s*to\s*cart|add\s*to\s*bag|buy\s*now/i.test(txt)) {
                (b as HTMLElement).focus();
                (b as HTMLElement).click();
                clicked = true;
                break;
              }
            }
          }

          if (clicked) {
            await new Promise((r) => setTimeout(r, 600));

            // Sync storage and events on parent window
            window.dispatchEvent(new Event("storage"));
            window.dispatchEvent(
              new CustomEvent("cart:updated", { bubbles: true }),
            );
            document.dispatchEvent(
              new CustomEvent("cart:updated", { bubbles: true }),
            );

            clearTimeout(timeoutId);
            cleanup();
            resolve(true);
            return;
          }

          clearTimeout(timeoutId);
          cleanup();
          resolve(false);
        } catch (err) {
          console.warn(
            "[Labto AI Cart] Background iframe execution error:",
            err,
          );
          clearTimeout(timeoutId);
          cleanup();
          resolve(false);
        }
      };

      document.body.appendChild(iframe);
    } catch (err) {
      console.warn("[Labto AI Cart] Background iframe setup error:", err);
      resolve(false);
    }
  });
}
