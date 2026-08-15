import { h, render } from 'preact';
import { ChatWidget } from './ChatWidget';
import { WidgetAPI } from './api';

function initWidget() {
  // Prevent duplicate mounting
  if (document.getElementById('ai-shopping-widget-host')) {
    return;
  }

  // Find current script tag to extract data-api-key attribute
  const currentScript =
    (document.currentScript as HTMLScriptElement) ||
    document.querySelector('script[data-api-key]');

  if (!currentScript) {
    console.error('[AI Widget Error]: Script tag missing required data-api-key attribute.');
    return;
  }

  const apiKey = currentScript.getAttribute('data-api-key');
  if (!apiKey) {
    console.error('[AI Widget Error]: data-api-key attribute is empty.');
    return;
  }

  // Derive API base URL from script src domain or fallback
  let baseUrl = 'http://localhost:4000';
  try {
    const srcUrl = new URL(currentScript.src);
    baseUrl = `${srcUrl.protocol}//${srcUrl.host}`;
  } catch {}

  const api = new WidgetAPI(baseUrl, apiKey);

  // Mount Host Element and Shadow Root for complete CSS isolation
  const hostElement = document.createElement('div');
  hostElement.id = 'ai-shopping-widget-host';
  document.body.appendChild(hostElement);

  const shadowRoot = hostElement.attachShadow({ mode: 'open' });

  // CSS reset applied strictly inside the Shadow Root
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    button, input, textarea {
      font-family: inherit;
    }
  `;
  shadowRoot.appendChild(style);

  const container = document.createElement('div');
  container.id = 'ai-shopping-widget-container';
  shadowRoot.appendChild(container);

  render(h(ChatWidget, { api, apiKey }), container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
