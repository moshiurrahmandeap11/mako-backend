"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatWidget = ChatWidget;
const jsx_runtime_1 = require("preact/jsx-runtime");
const hooks_1 = require("preact/hooks");
const cartBridge_1 = require("./cartBridge");
function ChatWidget({ api }) {
    const [isOpen, setIsOpen] = (0, hooks_1.useState)(false);
    const [config, setConfig] = (0, hooks_1.useState)({
        primaryColor: '#111111',
        greetingMessage: 'Hi! How can I help you shop today?',
        botName: 'Shop Assistant',
        position: 'bottom-right',
        addToCartEnabled: true,
    });
    const [sessionId, setSessionId] = (0, hooks_1.useState)('');
    const [messages, setMessages] = (0, hooks_1.useState)([]);
    const [inputValue, setInputValue] = (0, hooks_1.useState)('');
    const [isLoading, setIsLoading] = (0, hooks_1.useState)(false);
    const messagesEndRef = (0, hooks_1.useRef)(null);
    (0, hooks_1.useEffect)(() => {
        // 1. Fetch Config
        api.getConfig().then(setConfig).catch(console.error);
        // 2. Manage Visitor SessionId in sessionStorage
        let storedSession = '';
        try {
            storedSession = sessionStorage.getItem('aiw_session_id') || '';
        }
        catch { }
        if (storedSession) {
            setSessionId(storedSession);
        }
        else {
            api.createSession().then((newSess) => {
                setSessionId(newSess);
                try {
                    sessionStorage.setItem('aiw_session_id', newSess);
                }
                catch { }
            }).catch(console.error);
        }
    }, []);
    // Initialize initial greeting message once opened
    (0, hooks_1.useEffect)(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: 'msg_welcome',
                    sender: 'bot',
                    text: config.greetingMessage,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
        }
    }, [isOpen, config]);
    (0, hooks_1.useEffect)(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);
    const handleSend = async (e) => {
        if (e)
            e.preventDefault();
        const text = inputValue.trim();
        if (!text || isLoading)
            return;
        const userMsg = {
            id: `user_${Date.now()}`,
            sender: 'user',
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);
        try {
            const res = await api.sendMessage(sessionId, text);
            // Handle AI returned cart action
            if (res.cartAction) {
                (0, cartBridge_1.requestAddToCart)(res.cartAction.productId, res.cartAction.quantity);
            }
            const botMsg = {
                id: `bot_${Date.now()}`,
                sender: 'bot',
                text: res.reply,
                products: res.products,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, botMsg]);
        }
        catch (err) {
            let errorMsg = 'Sorry, I ran into an error. Please try again.';
            if (err?.message?.includes('revoked') || err?.message?.includes('Invalid') || err?.message?.includes('Unauthorized')) {
                errorMsg = 'This chatbot is currently offline or its API key has been revoked. Please contact the website administrator.';
            }
            else if (err?.message) {
                errorMsg = err.message;
            }
            setMessages((prev) => [
                ...prev,
                {
                    id: `err_${Date.now()}`,
                    sender: 'bot',
                    text: errorMsg,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
        }
        finally {
            setIsLoading(false);
        }
    };
    const isLeft = config.position === 'bottom-left';
    const primaryColor = config.primaryColor || '#111111';
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            position: 'fixed',
            bottom: '24px',
            right: isLeft ? 'auto' : '24px',
            left: isLeft ? '24px' : 'auto',
            zIndex: 999999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }, children: [!isOpen && ((0, jsx_runtime_1.jsxs)("button", { onClick: () => setIsOpen(true), style: {
                    backgroundColor: primaryColor,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50px',
                    padding: '14px 22px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }, children: [(0, jsx_runtime_1.jsx)("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: (0, jsx_runtime_1.jsx)("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }), (0, jsx_runtime_1.jsx)("span", { children: "Chat with AI" })] })), isOpen && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    width: '380px',
                    maxWidth: 'calc(100vw - 32px)',
                    height: '560px',
                    maxHeight: 'calc(100vh - 48px)',
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.22)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb',
                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                            backgroundColor: primaryColor,
                            color: '#ffffff',
                            padding: '16px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '50%',
                                            backgroundColor: '#10b981',
                                        } }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { style: { margin: 0, fontSize: '16px', fontWeight: '600' }, children: config.botName }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '11px', opacity: 0.85 }, children: "Online \u2022 Shopping Assistant" })] })] }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setIsOpen(false), style: {
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    fontSize: '20px',
                                    lineHeight: 1,
                                }, children: "\u2715" })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            flex: 1,
                            padding: '16px',
                            overflowY: 'auto',
                            backgroundColor: '#f9fafb',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }, children: [messages.map((msg) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                                            maxWidth: '85%',
                                            backgroundColor: msg.sender === 'user' ? primaryColor : '#ffffff',
                                            color: msg.sender === 'user' ? '#ffffff' : '#1f2937',
                                            padding: '12px 16px',
                                            borderRadius: msg.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                                            fontSize: '14px',
                                            lineHeight: '1.45',
                                            boxShadow: msg.sender === 'bot' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                                        }, children: msg.text }), msg.products && msg.products.length > 0 && ((0, jsx_runtime_1.jsx)("div", { style: {
                                            width: '100%',
                                            marginTop: '12px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px',
                                        }, children: msg.products.map((prod) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                backgroundColor: '#ffffff',
                                                borderRadius: '12px',
                                                border: '1px solid #e5e7eb',
                                                padding: '12px',
                                                display: 'flex',
                                                gap: '12px',
                                                alignItems: 'center',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                                            }, children: [prod.imageUrl ? ((0, jsx_runtime_1.jsx)("img", { src: prod.imageUrl, alt: prod.title, style: {
                                                        width: '56px',
                                                        height: '56px',
                                                        borderRadius: '8px',
                                                        objectFit: 'cover',
                                                    } })) : ((0, jsx_runtime_1.jsx)("div", { style: {
                                                        width: '56px',
                                                        height: '56px',
                                                        borderRadius: '8px',
                                                        backgroundColor: '#e5e7eb',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '20px',
                                                    }, children: "\uD83D\uDECD\uFE0F" })), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [(0, jsx_runtime_1.jsx)("h4", { style: {
                                                                margin: '0 0 4px 0',
                                                                fontSize: '13px',
                                                                fontWeight: '600',
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                color: '#111827',
                                                            }, children: prod.title }), (0, jsx_runtime_1.jsxs)("span", { style: { fontSize: '13px', fontWeight: '700', color: primaryColor }, children: [prod.currency === 'USD' ? '$' : '', prod.price, " ", prod.currency !== 'USD' ? prod.currency : ''] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '6px', marginTop: '8px' }, children: [(0, jsx_runtime_1.jsx)("a", { href: prod.productUrl, target: "_blank", rel: "noreferrer", style: {
                                                                        fontSize: '11px',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid #d1d5db',
                                                                        textDecoration: 'none',
                                                                        color: '#374151',
                                                                        fontWeight: '500',
                                                                    }, children: "View Page" }), config.addToCartEnabled && ((0, jsx_runtime_1.jsx)("button", { onClick: () => (0, cartBridge_1.requestAddToCart)(prod.id, 1), style: {
                                                                        fontSize: '11px',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        backgroundColor: primaryColor,
                                                                        color: '#ffffff',
                                                                        fontWeight: '600',
                                                                        cursor: 'pointer',
                                                                    }, children: "+ Add to Cart" }))] })] })] }, prod.id))) })), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '10px', color: '#9ca3af', marginTop: '4px' }, children: msg.time })] }, msg.id))), isLoading && ((0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '12px' }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '14px' }, children: "\uD83E\uDD16" }), " Thinking..."] })), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSend, style: {
                            padding: '12px 16px',
                            backgroundColor: '#ffffff',
                            borderTop: '1px solid #e5e7eb',
                            display: 'flex',
                            gap: '8px',
                        }, children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Ask about products, sizes, prices...", value: inputValue, onInput: (e) => setInputValue(e.target.value), style: {
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: '24px',
                                    border: '1px solid #d1d5db',
                                    fontSize: '14px',
                                    outline: 'none',
                                } }), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: !inputValue.trim() || isLoading, style: {
                                    backgroundColor: primaryColor,
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '38px',
                                    height: '38px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: inputValue.trim() ? 'pointer' : 'default',
                                    opacity: inputValue.trim() ? 1 : 0.5,
                                }, children: "\u2794" })] })] }))] }));
}
