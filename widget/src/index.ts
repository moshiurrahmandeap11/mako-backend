import { h, render } from 'preact';
import { ChatWidget } from './ChatWidget';
import { WidgetAPI } from './api';

function initWidget() {
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

  // Mount container
  const container = document.createElement('div');
  container.id = 'ai-shopping-widget-root';
  document.body.appendChild(container);

  render(h(ChatWidget, { api, apiKey }), container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
