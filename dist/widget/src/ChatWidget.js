"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatWidget = ChatWidget;
const jsx_runtime_1 = require("preact/jsx-runtime");
const hooks_1 = require("preact/hooks");
const cartBridge_1 = require("./cartBridge");
function renderMarkdownText(text) {
    if (!text)
        return null;
    // Clean text from accidental tags
    let clean = text
        .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '')
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
        .trim();
    if (!clean)
        return null;
    // Comprehensive Regex: Markdown Links [title](url) | Bold **text** | Raw URLs (https?://...)
    const parts = [];
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s<>)"]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(clean)) !== null) {
        if (match.index > lastIndex) {
            parts.push(clean.substring(lastIndex, match.index));
        }
        if (match[1] && match[2]) {
            // Markdown Link [text](url)
            const linkTitle = match[1];
            const linkUrl = match[2];
            parts.push((0, jsx_runtime_1.jsxs)("a", { href: linkUrl, target: "_blank", rel: "noopener noreferrer", style: {
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #dbeafe',
                    padding: '2px 9px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    margin: '2px 0',
                    lineHeight: '1.4',
                    transition: 'all 0.15s ease',
                }, children: [linkTitle, " ", (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '11px', opacity: 0.8 }, children: "\u2197" })] }));
        }
        else if (match[3]) {
            // Bold **text**
            parts.push((0, jsx_runtime_1.jsx)("strong", { style: { fontWeight: '700', color: '#0f172a' }, children: match[3] }));
        }
        else if (match[4]) {
            // Auto-convert raw URLs to clean title badges
            const rawUrl = match[4];
            let displayLabel = rawUrl;
            try {
                const u = new URL(rawUrl);
                if (u.pathname && u.pathname.length > 1) {
                    const lastSegment = u.pathname.split('/').filter(Boolean).pop() || '';
                    displayLabel = lastSegment
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                }
                else {
                    displayLabel = u.hostname.replace('.vercel.app', '').replace('.com', '');
                }
            }
            catch { }
            parts.push((0, jsx_runtime_1.jsxs)("a", { href: rawUrl, target: "_blank", rel: "noopener noreferrer", style: {
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #dbeafe',
                    padding: '2px 9px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    margin: '2px 0',
                    lineHeight: '1.4',
                    wordBreak: 'break-all',
                }, children: [displayLabel, " ", (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '11px', opacity: 0.8 }, children: "\u2197" })] }));
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }
    return parts;
}
function ChatWidget({ api }) {
    const [isOpen, setIsOpen] = (0, hooks_1.useState)(false);
    const [isMobile, setIsMobile] = (0, hooks_1.useState)(typeof window !== 'undefined' ? window.innerWidth <= 640 : false);
    const [config, setConfig] = (0, hooks_1.useState)({
        primaryColor: '#0f172a',
        greetingMessage: 'Hi there! How can I help you today?',
        botName: 'AI Assistant',
        position: 'bottom-right',
        addToCartEnabled: true,
        hideBranding: false,
        eventBridgeEnabled: false,
    });
    const isLeft = config.position === 'bottom-left';
    const [sessionId, setSessionId] = (0, hooks_1.useState)('');
    const [messages, setMessages] = (0, hooks_1.useState)([]);
    const [inputValue, setInputValue] = (0, hooks_1.useState)('');
    const [isLoading, setIsLoading] = (0, hooks_1.useState)(false);
    const [thinkingPhase, setThinkingPhase] = (0, hooks_1.useState)(0);
    const messagesEndRef = (0, hooks_1.useRef)(null);
    const [windowOffset, setWindowOffset] = (0, hooks_1.useState)({ x: 0, y: 0 });
    const [launcherOffset, setLauncherOffset] = (0, hooks_1.useState)({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = (0, hooks_1.useState)(false);
    const dragStartRef = (0, hooks_1.useRef)(null);
    const didDragRef = (0, hooks_1.useRef)(false);
    // Resize listener for mobile viewport
    (0, hooks_1.useEffect)(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 640);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Cycle thinking phases during loading
    (0, hooks_1.useEffect)(() => {
        let interval;
        if (isLoading) {
            setThinkingPhase(0);
            interval = setInterval(() => {
                setThinkingPhase((prev) => (prev < 2 ? prev + 1 : 0));
            }, 700);
        }
        return () => {
            if (interval)
                clearInterval(interval);
        };
    }, [isLoading]);
    // Dragging event listeners for window & launcher
    (0, hooks_1.useEffect)(() => {
        const onMouseMove = (e) => {
            if (!dragStartRef.current)
                return;
            const dx = e.clientX - dragStartRef.current.clientX;
            const dy = e.clientY - dragStartRef.current.clientY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                didDragRef.current = true;
            }
            if (dragStartRef.current.target === 'window') {
                setWindowOffset({
                    x: dragStartRef.current.startX + dx,
                    y: dragStartRef.current.startY + dy,
                });
            }
            else {
                setLauncherOffset({
                    x: dragStartRef.current.startX + dx,
                    y: dragStartRef.current.startY + dy,
                });
            }
        };
        const onTouchMove = (e) => {
            if (!dragStartRef.current || !e.touches[0])
                return;
            const dx = e.touches[0].clientX - dragStartRef.current.clientX;
            const dy = e.touches[0].clientY - dragStartRef.current.clientY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                didDragRef.current = true;
            }
            if (dragStartRef.current.target === 'window') {
                setWindowOffset({
                    x: dragStartRef.current.startX + dx,
                    y: dragStartRef.current.startY + dy,
                });
            }
            else {
                setLauncherOffset({
                    x: dragStartRef.current.startX + dx,
                    y: dragStartRef.current.startY + dy,
                });
            }
        };
        const calculateSnap = (target, currentX, currentY) => {
            if (typeof window === 'undefined')
                return { x: currentX, y: currentY };
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const elemWidth = target === 'window' ? (windowWidth <= 640 ? windowWidth : 390) : 60;
            const elemHeight = target === 'window' ? (windowHeight <= 640 ? windowHeight : 590) : 60;
            const baseLeft = isLeft ? 24 : windowWidth - 24 - elemWidth;
            const baseTop = windowHeight - 24 - elemHeight;
            const absLeft = baseLeft + currentX;
            const absTop = baseTop + currentY;
            // Nearest corner calculation
            const snapLeft = absLeft < (windowWidth - elemWidth) / 2 ? 24 : windowWidth - 24 - elemWidth;
            const snapTop = absTop < (windowHeight - elemHeight) / 2 ? 24 : windowHeight - 24 - elemHeight;
            return {
                x: snapLeft - baseLeft,
                y: snapTop - baseTop,
            };
        };
        const onEnd = () => {
            if (dragStartRef.current && didDragRef.current) {
                const target = dragStartRef.current.target;
                if (target === 'window') {
                    setWindowOffset((prev) => calculateSnap('window', prev.x, prev.y));
                }
                else {
                    setLauncherOffset((prev) => calculateSnap('launcher', prev.x, prev.y));
                }
            }
            dragStartRef.current = null;
            setIsDragging(false);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, [isLeft]);
    (0, hooks_1.useEffect)(() => {
        // 1. Fetch Config
        api.getConfig().then(setConfig).catch(console.error);
        // 2. Manage Visitor SessionId & Restore History
        let storedSession = '';
        try {
            storedSession = localStorage.getItem('aiw_session_id') || sessionStorage.getItem('aiw_session_id') || '';
        }
        catch { }
        const initHistory = (sessId) => {
            api.getHistory(sessId).then((data) => {
                if (data.messages && data.messages.length > 0) {
                    setMessages(data.messages);
                }
            }).catch(console.error);
        };
        if (storedSession) {
            setSessionId(storedSession);
            initHistory(storedSession);
        }
        else {
            api.createSession().then((newSess) => {
                setSessionId(newSess);
                try {
                    localStorage.setItem('aiw_session_id', newSess);
                }
                catch { }
            }).catch(console.error);
        }
        // 3. Persistent Visitor Tracking & Ping Backend
        let vid = '';
        try {
            vid = localStorage.getItem('aiw_visitor_id') || '';
            if (!vid) {
                vid = `vid_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
                localStorage.setItem('aiw_visitor_id', vid);
            }
        }
        catch {
            vid = `vid_${Math.random().toString(36).substring(2, 11)}`;
        }
        api.pingVisitor(vid).catch(console.error);
    }, []);
    // Initialize initial greeting message once opened if no prior messages exist
    (0, hooks_1.useEffect)(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: 'msg_welcome',
                    sender: 'bot',
                    text: config.greetingMessage || 'Hi there! How can I help you today?',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
        }
    }, [isOpen, config, messages.length]);
    (0, hooks_1.useEffect)(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);
    const handleSend = async (queryText) => {
        const text = (typeof queryText === 'string' ? queryText : inputValue).trim();
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
            if (res.cartAction && config.eventBridgeEnabled) {
                (0, cartBridge_1.requestAddToCart)(res.cartAction.productId, res.cartAction.quantity);
            }
            const botMsg = {
                id: `bot_${Date.now()}`,
                sender: 'bot',
                text: res.reply,
                products: res.products,
                thoughts: res.thoughts,
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
    const handleResetSession = () => {
        if (window.confirm('Start a fresh new chat session?')) {
            api.createSession().then((newSess) => {
                setSessionId(newSess);
                try {
                    localStorage.setItem('aiw_session_id', newSess);
                }
                catch { }
                setMessages([
                    {
                        id: `msg_welcome_${Date.now()}`,
                        sender: 'bot',
                        text: config.greetingMessage || 'Hi there! How can I help you today?',
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                ]);
            }).catch(console.error);
        }
    };
    const primaryColor = config.primaryColor || '#0f172a';
    const quickPrompts = [
        { label: '✨ Explore Projects', query: 'apnader portfolio te ki ki project ache' },
        { label: '💼 Agency Services', query: 'What services do you offer?' },
        { label: '📩 Contact Team', query: 'How can I contact your team?' },
    ];
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            position: 'fixed',
            bottom: '24px',
            right: isLeft ? 'auto' : '24px',
            left: isLeft ? '24px' : 'auto',
            zIndex: 999999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            transform: isMobile
                ? 'none'
                : isOpen
                    ? (windowOffset.x !== 0 || windowOffset.y !== 0 ? `translate3d(${windowOffset.x}px, ${windowOffset.y}px, 0)` : 'none')
                    : (launcherOffset.x !== 0 || launcherOffset.y !== 0 ? `translate3d(${launcherOffset.x}px, ${launcherOffset.y}px, 0)` : 'none'),
            touchAction: isMobile ? 'auto' : 'none',
            userSelect: isDragging ? 'none' : 'auto',
            transition: isMobile ? 'none' : isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
        }, children: [!isOpen && ((0, jsx_runtime_1.jsxs)("button", { onMouseDown: (e) => {
                    dragStartRef.current = {
                        clientX: e.clientX,
                        clientY: e.clientY,
                        startX: launcherOffset.x,
                        startY: launcherOffset.y,
                        target: 'launcher',
                    };
                    didDragRef.current = false;
                    setIsDragging(true);
                }, onTouchStart: (e) => {
                    if (!e.touches[0])
                        return;
                    dragStartRef.current = {
                        clientX: e.touches[0].clientX,
                        clientY: e.touches[0].clientY,
                        startX: launcherOffset.x,
                        startY: launcherOffset.y,
                        target: 'launcher',
                    };
                    didDragRef.current = false;
                    setIsDragging(true);
                }, onClick: () => {
                    if (!didDragRef.current) {
                        setIsOpen(true);
                    }
                }, title: "Open AI Assistant", style: {
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: primaryColor,
                    color: '#ffffff',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    cursor: isDragging ? 'grabbing' : 'pointer',
                    boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.35), 0 6px 14px -2px rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    userSelect: 'none',
                    transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
                }, children: [(0, jsx_runtime_1.jsx)("div", { style: {
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '14px',
                            height: '14px',
                            backgroundColor: '#10b981',
                            borderRadius: '50%',
                            border: '2.5px solid #ffffff',
                            boxShadow: '0 0 8px rgba(16, 185, 129, 0.8)',
                        } }), (0, jsx_runtime_1.jsx)("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: (0, jsx_runtime_1.jsx)("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" }) })] })), isOpen && ((0, jsx_runtime_1.jsxs)("div", { style: {
                    position: isMobile ? 'fixed' : 'relative',
                    top: isMobile ? '0' : 'auto',
                    left: isMobile ? '0' : 'auto',
                    right: isMobile ? '0' : 'auto',
                    bottom: isMobile ? '0' : 'auto',
                    zIndex: 999999,
                    width: isMobile ? '100vw' : '390px',
                    maxWidth: isMobile ? '100vw' : 'calc(100vw - 32px)',
                    height: isMobile ? '100dvh' : '590px',
                    maxHeight: isMobile ? '100dvh' : 'calc(100vh - 48px)',
                    backgroundColor: '#ffffff',
                    borderRadius: isMobile ? '0px' : '20px',
                    boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: isMobile ? 'none' : '1px solid #e2e8f0',
                }, children: [(0, jsx_runtime_1.jsxs)("div", { onMouseDown: (e) => {
                            if (e.target?.closest('button'))
                                return;
                            if (isMobile)
                                return;
                            dragStartRef.current = {
                                clientX: e.clientX,
                                clientY: e.clientY,
                                startX: windowOffset.x,
                                startY: windowOffset.y,
                                target: 'window',
                            };
                            didDragRef.current = false;
                            setIsDragging(true);
                        }, onTouchStart: (e) => {
                            if (e.target?.closest('button'))
                                return;
                            if (isMobile || !e.touches[0])
                                return;
                            dragStartRef.current = {
                                clientX: e.touches[0].clientX,
                                clientY: e.touches[0].clientY,
                                startX: windowOffset.x,
                                startY: windowOffset.y,
                                target: 'window',
                            };
                            didDragRef.current = false;
                            setIsDragging(true);
                        }, style: {
                            background: `linear-gradient(135deg, ${primaryColor} 0%, #1e293b 100%)`,
                            color: '#ffffff',
                            padding: '16px 18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: isMobile ? 'default' : isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        }, title: "Click and drag to move chat window", children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '50%',
                                            background: 'rgba(255, 255, 255, 0.15)',
                                            backdropFilter: 'blur(8px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px',
                                            position: 'relative',
                                            border: '1px solid rgba(255, 255, 255, 0.25)',
                                        }, children: ["\uD83E\uDD16", (0, jsx_runtime_1.jsx)("span", { style: {
                                                    position: 'absolute',
                                                    bottom: '-1px',
                                                    right: '-1px',
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    backgroundColor: '#10b981',
                                                    border: '2px solid #0f172a',
                                                    boxShadow: '0 0 6px #10b981',
                                                } })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { margin: 0, fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.2px' }, children: config.botName || 'AI Assistant' }), (0, jsx_runtime_1.jsx)("span", { style: {
                                                            fontSize: '10px',
                                                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                                            color: '#6ee7b7',
                                                            padding: '1px 6px',
                                                            borderRadius: '10px',
                                                            fontWeight: '600',
                                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        }, children: "LIVE" })] }), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '1px' }, children: "Replies instantly \u2022 Verified Knowledge" })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleResetSession, title: "Restart chat", style: {
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '30px',
                                            height: '30px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#cbd5e1',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            transition: 'background 0.2s',
                                        }, children: "\uD83D\uDD04" }), (0, jsx_runtime_1.jsx)("button", { onClick: () => setIsOpen(false), title: "Close chat", style: {
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '30px',
                                            height: '30px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            transition: 'background 0.2s',
                                        }, children: "\u2715" })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            flex: '1 1 0%',
                            minHeight: 0,
                            maxHeight: '100%',
                            padding: '18px 16px',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            overscrollBehaviorY: 'contain',
                            touchAction: 'pan-y',
                            backgroundColor: '#f8fafc',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }, children: [messages.length <= 1 && ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "Frequently Asked" }), (0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' }, children: quickPrompts.map((p, idx) => ((0, jsx_runtime_1.jsx)("button", { onClick: () => handleSend(p.query), style: {
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                padding: '6px 12px',
                                                borderRadius: '16px',
                                                fontSize: '12px',
                                                fontWeight: '500',
                                                color: '#334155',
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                                transition: 'all 0.15s ease',
                                            }, children: p.label }, idx))) })] })), messages.map((msg) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                }, children: [msg.sender === 'bot' && msg.thoughts && msg.thoughts.length > 0 && ((0, jsx_runtime_1.jsxs)("details", { style: {
                                            marginBottom: '8px',
                                            fontSize: '11px',
                                            color: '#475569',
                                            backgroundColor: '#f1f5f9',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '10px',
                                            padding: '6px 10px',
                                            maxWidth: '90%',
                                            lineHeight: '1.4',
                                        }, children: [(0, jsx_runtime_1.jsxs)("summary", { style: {
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    outline: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    userSelect: 'none',
                                                    color: '#334155',
                                                }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '13px' }, children: "\uD83E\uDDE0" }), " AI Reasoning (", msg.thoughts.length, " steps)"] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    marginTop: '6px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '4px',
                                                    borderTop: '1px solid #e2e8f0',
                                                    paddingTop: '6px',
                                                }, children: msg.thoughts.map((t, idx) => ((0, jsx_runtime_1.jsx)("div", { style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }, children: (0, jsx_runtime_1.jsx)("span", { children: t }) }, idx))) })] })), (0, jsx_runtime_1.jsx)("div", { style: {
                                            backgroundColor: msg.sender === 'user' ? primaryColor : '#ffffff',
                                            color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                                            padding: '12px 16px',
                                            borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                            maxWidth: '85%',
                                            wordBreak: 'break-word',
                                            boxShadow: msg.sender === 'user' ? '0 4px 12px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                                            fontSize: '14px',
                                            lineHeight: '1.5',
                                            border: msg.sender === 'user' ? 'none' : '1px solid #f1f5f9',
                                        }, children: renderMarkdownText(msg.text) }), msg.products && msg.products.length > 0 && ((0, jsx_runtime_1.jsx)("div", { style: {
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                            marginTop: '8px',
                                            width: '100%',
                                            maxWidth: '300px',
                                        }, children: msg.products.map((prod) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                padding: '10px',
                                                display: 'flex',
                                                gap: '10px',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                                            }, children: [prod.imageUrl && ((0, jsx_runtime_1.jsx)("img", { src: prod.imageUrl, alt: prod.title, style: {
                                                        width: '56px',
                                                        height: '56px',
                                                        borderRadius: '8px',
                                                        objectFit: 'cover',
                                                        backgroundColor: '#f8fafc',
                                                    } })), (0, jsx_runtime_1.jsxs)("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }, children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h4", { style: { margin: '0 0 2px 0', fontSize: '13px', fontWeight: '600', color: '#1e293b' }, children: prod.title }), (0, jsx_runtime_1.jsxs)("span", { style: { fontSize: '12px', fontWeight: '700', color: '#059669' }, children: [prod.price, " ", prod.currency] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'flex', gap: '6px', marginTop: '6px' }, children: [config.addToCartEnabled && ((0, jsx_runtime_1.jsx)("button", { onClick: () => (0, cartBridge_1.requestAddToCart)(prod.id, 1), style: {
                                                                        backgroundColor: primaryColor,
                                                                        color: '#ffffff',
                                                                        border: 'none',
                                                                        borderRadius: '6px',
                                                                        padding: '4px 8px',
                                                                        fontSize: '11px',
                                                                        fontWeight: '600',
                                                                        cursor: 'pointer',
                                                                    }, children: "+ Add to Cart" })), prod.productUrl && ((0, jsx_runtime_1.jsx)("a", { href: prod.productUrl, target: "_blank", rel: "noopener noreferrer", style: {
                                                                        backgroundColor: '#f1f5f9',
                                                                        color: '#475569',
                                                                        border: '1px solid #cbd5e1',
                                                                        borderRadius: '6px',
                                                                        padding: '4px 8px',
                                                                        fontSize: '11px',
                                                                        textDecoration: 'none',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                    }, children: "View \u2197" }))] })] })] }, prod.id))) })), (0, jsx_runtime_1.jsx)("span", { style: { fontSize: '10px', color: '#94a3b8', marginTop: '4px', paddingLeft: '4px', paddingRight: '4px' }, children: msg.time })] }, msg.id))), isLoading && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '12px',
                                    color: '#334155',
                                    backgroundColor: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    padding: '8px 14px',
                                    borderRadius: '16px',
                                    maxWidth: '90%',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                }, children: [(0, jsx_runtime_1.jsx)("span", { style: { fontSize: '14px' }, children: "\uD83E\uDDE0" }), (0, jsx_runtime_1.jsxs)("span", { style: { fontWeight: '600', color: '#1e293b' }, children: [thinkingPhase === 0 && '🔍 Analyzing intent & language...', thinkingPhase === 1 && '🧠 Querying knowledge base...', thinkingPhase === 2 && '⚡ Generating verified response...'] })] })), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            padding: '12px 16px',
                            backgroundColor: '#ffffff',
                            borderTop: '1px solid #f1f5f9',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                        }, children: [(0, jsx_runtime_1.jsxs)("form", { onSubmit: (e) => {
                                    e.preventDefault();
                                    handleSend();
                                }, style: {
                                    display: 'flex',
                                    gap: '8px',
                                    alignItems: 'center',
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '24px',
                                    padding: '4px 6px 4px 14px',
                                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                                }, children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Ask about projects, services, or anything...", value: inputValue, onInput: (e) => setInputValue(e.target.value), style: {
                                            flex: 1,
                                            padding: '8px 0',
                                            border: 'none',
                                            backgroundColor: 'transparent',
                                            color: '#0f172a',
                                            fontSize: '13.5px',
                                            outline: 'none',
                                        } }), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: !inputValue.trim() || isLoading, title: "Send message", style: {
                                            backgroundColor: inputValue.trim() ? primaryColor : '#cbd5e1',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: '34px',
                                            height: '34px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: inputValue.trim() && !isLoading ? 'pointer' : 'default',
                                            transition: 'background-color 0.2s ease, transform 0.15s ease',
                                            flexShrink: 0,
                                        }, children: (0, jsx_runtime_1.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("line", { x1: "22", y1: "2", x2: "11", y2: "13" }), (0, jsx_runtime_1.jsx)("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })] }) })] }), !config.hideBranding && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    textAlign: 'center',
                                    fontSize: '10px',
                                    color: '#94a3b8',
                                    letterSpacing: '0.2px',
                                }, children: ["Powered by ", (0, jsx_runtime_1.jsx)("strong", { style: { color: '#64748b', fontWeight: '600' }, children: "Labto AI" })] }))] })] }))] }));
}
