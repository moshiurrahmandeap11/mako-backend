"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WidgetAPI = void 0;
class WidgetAPI {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.apiKey = apiKey;
    }
    async fetch(path, options = {}) {
        const headers = {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            ...(options.headers || {}),
        };
        const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
        if (!res.ok) {
            const err = await res
                .json()
                .catch(() => ({ error: "Network response was not ok" }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }
    async createSession() {
        const data = await this.fetch("/api/widget/session", {
            method: "POST",
        });
        return data.sessionId;
    }
    async getConfig() {
        return this.fetch("/api/widget/config", { method: "GET" });
    }
    async getHistory(sessionId) {
        return this.fetch(`/api/widget/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "GET" });
    }
    async sendMessage(sessionId, message, botMode, provider, imageUrl) {
        return this.fetch("/api/widget/chat", {
            method: "POST",
            body: JSON.stringify({ sessionId, message, botMode, provider, imageUrl }),
        });
    }
    async streamMessage(sessionId, message, onThought, onToken, onDone, onError, botMode, provider, imageUrl) {
        try {
            const res = await fetch(`${this.baseUrl}/api/widget/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": this.apiKey,
                    Accept: "text/event-stream",
                },
                body: JSON.stringify({
                    sessionId,
                    message,
                    botMode,
                    provider,
                    imageUrl,
                    stream: true,
                }),
            });
            if (!res.ok) {
                const err = await res
                    .json()
                    .catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            if (!res.body) {
                throw new Error("No response body for streaming");
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split("\n\n");
                buffer = events.pop() || "";
                for (const eventBlock of events) {
                    if (!eventBlock.trim())
                        continue;
                    const lines = eventBlock.split("\n");
                    let eventType = "message";
                    let eventData = "";
                    for (const line of lines) {
                        if (line.startsWith("event: ")) {
                            eventType = line.slice(7).trim();
                        }
                        else if (line.startsWith("data: ")) {
                            eventData = line.slice(6).trim();
                        }
                    }
                    if (eventData) {
                        try {
                            const parsed = JSON.parse(eventData);
                            if (eventType === "thought" && parsed.thought) {
                                onThought(parsed.thought);
                            }
                            else if (eventType === "token" && parsed.token) {
                                onToken(parsed.token);
                            }
                            else if (eventType === "done") {
                                onDone(parsed);
                            }
                            else if (eventType === "error") {
                                onError(new Error(parsed.error || "Streaming error"));
                            }
                        }
                        catch (jsonErr) {
                            console.error("Failed to parse SSE event:", jsonErr, eventData);
                        }
                    }
                }
            }
        }
        catch (err) {
            onError(err);
        }
    }
    async pingVisitor(visitorId) {
        return this.fetch("/api/widget/ping", {
            method: "POST",
            body: JSON.stringify({ visitorId }),
        });
    }
}
exports.WidgetAPI = WidgetAPI;
