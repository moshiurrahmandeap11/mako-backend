"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WidgetAPI = void 0;
class WidgetAPI {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
    }
    async fetch(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            ...(options.headers || {}),
        };
        const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }
    async createSession() {
        const data = await this.fetch('/api/widget/session', {
            method: 'POST',
        });
        return data.sessionId;
    }
    async getConfig() {
        return this.fetch('/api/widget/config', { method: 'GET' });
    }
    async sendMessage(sessionId, message, botMode, provider) {
        return this.fetch('/api/widget/chat', {
            method: 'POST',
            body: JSON.stringify({ sessionId, message, botMode, provider }),
        });
    }
}
exports.WidgetAPI = WidgetAPI;
