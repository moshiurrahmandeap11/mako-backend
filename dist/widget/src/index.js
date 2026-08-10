"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const preact_1 = require("preact");
const ChatWidget_1 = require("./ChatWidget");
const api_1 = require("./api");
function initWidget() {
    // Find current script tag to extract data-api-key attribute
    const currentScript = document.currentScript ||
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
    }
    catch { }
    const api = new api_1.WidgetAPI(baseUrl, apiKey);
    // Mount container
    const container = document.createElement('div');
    container.id = 'ai-shopping-widget-root';
    document.body.appendChild(container);
    (0, preact_1.render)((0, preact_1.h)(ChatWidget_1.ChatWidget, { api, apiKey }), container);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
}
else {
    initWidget();
}
