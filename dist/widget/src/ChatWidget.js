"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatWidget = ChatWidget;
const jsx_runtime_1 = require("preact/jsx-runtime");
const hooks_1 = require("preact/hooks");
const cartBridge_1 = require("./cartBridge");
// Crisp Vector SVGs (No Emojis)
const BotMascotSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "32", height: "32", viewBox: "0 0 32 32", fill: "none", style: { flexShrink: 0 }, children: [(0, jsx_runtime_1.jsx)("rect", { width: "32", height: "32", rx: "8", fill: "#E8F8F0" }), (0, jsx_runtime_1.jsx)("path", { d: "M16 5V8", stroke: "#1DBF73", strokeWidth: "2", strokeLinecap: "round" }), (0, jsx_runtime_1.jsx)("circle", { cx: "16", cy: "4", r: "1.5", fill: "#1DBF73" }), (0, jsx_runtime_1.jsx)("rect", { x: "7", y: "8", width: "18", height: "15", rx: "4", fill: "#0f172a" }), (0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "15", r: "2", fill: "#1DBF73" }), (0, jsx_runtime_1.jsx)("circle", { cx: "20", cy: "15", r: "2", fill: "#1DBF73" }), (0, jsx_runtime_1.jsx)("path", { d: "M13.5 19C14.2 19.8 15 20.2 16 20.2C17 20.2 17.8 19.8 18.5 19", stroke: "#ffffff", strokeWidth: "1.5", strokeLinecap: "round" }), (0, jsx_runtime_1.jsx)("path", { d: "M5 14C5 13 5.8 12.2 6.8 12.2V17.8C5.8 17.8 5 17 5 16V14Z", fill: "#0f172a" }), (0, jsx_runtime_1.jsx)("path", { d: "M27 14C27 13 26.2 12.2 25.2 12.2V17.8C26.2 17.8 27 17 27 16V14Z", fill: "#0f172a" })] }));
const BrainSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("path", { d: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" }), (0, jsx_runtime_1.jsx)("path", { d: "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" })] }));
const CloseSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), (0, jsx_runtime_1.jsx)("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }));
const RefreshSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("polyline", { points: "23 4 23 10 17 10" }), (0, jsx_runtime_1.jsx)("polyline", { points: "1 20 1 14 7 14" }), (0, jsx_runtime_1.jsx)("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })] }));
const SendSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("line", { x1: "22", y1: "2", x2: "11", y2: "13" }), (0, jsx_runtime_1.jsx)("polygon", { points: "22 2 15 22 11 13 2 9 22 2", fill: "currentColor", fillOpacity: "0.25" })] }));
const ChevronDownSvg = () => ((0, jsx_runtime_1.jsx)("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: (0, jsx_runtime_1.jsx)("polyline", { points: "6 9 12 15 18 9" }) }));
const BriefcaseSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, opacity: 0.85 }, children: [(0, jsx_runtime_1.jsx)("rect", { x: "2", y: "7", width: "20", height: "14", rx: "2", ry: "2" }), (0, jsx_runtime_1.jsx)("path", { d: "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" })] }));
const ToolsSvg = () => ((0, jsx_runtime_1.jsx)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, opacity: 0.85 }, children: (0, jsx_runtime_1.jsx)("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" }) }));
const MailSvg = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, opacity: 0.85 }, children: [(0, jsx_runtime_1.jsx)("path", { d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" }), (0, jsx_runtime_1.jsx)("polyline", { points: "22,6 12,13 2,6" })] }));
const MessageSquareSvg = () => ((0, jsx_runtime_1.jsx)("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, opacity: 0.85 }, children: (0, jsx_runtime_1.jsx)("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) }));
function parseSafeOptions(rawOptions) {
    if (!rawOptions)
        return [];
    let parsed = rawOptions;
    if (typeof rawOptions === "string") {
        try {
            parsed = JSON.parse(rawOptions);
        }
        catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) {
        if (typeof parsed === "object" && parsed !== null) {
            return Object.entries(parsed).map(([key, val]) => ({
                name: String(key),
                values: Array.isArray(val) ? val.map(String) : [String(val)],
            }));
        }
        return [];
    }
    return parsed
        .filter((opt) => Boolean(opt && typeof opt === "object"))
        .map((opt) => {
        let vals = [];
        if (Array.isArray(opt.values)) {
            vals = opt.values.map(String);
        }
        else if (opt.value) {
            vals = [String(opt.value)];
        }
        else if (typeof opt === "string") {
            return { name: "Option", values: [opt] };
        }
        return {
            name: String(opt.name || "Option"),
            values: vals.filter(Boolean),
        };
    })
        .filter((opt) => opt.values.length > 0);
}
function renderMarkdownText(text) {
    if (!text)
        return null;
    let clean = text
        .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, "")
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "")
        .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, "$1")
        .replace(/\*\*\[([^\]]+)\]\s*\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)\*\*/g, "[$1]($2)")
        .replace(/\[\*\*([^*]+)\*\*\]\s*\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, "[$1]($2)")
        .replace(/\[([^\]]+)\]\s*\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, "[$1]($2)")
        .replace(/^#+\s*/gm, "")
        .replace(/#+\s*/g, "")
        .replace(/^[\t ]*\*[\t ]+/gm, "• ")
        .replace(/\n[\t ]*\*[\t ]+/g, "\n• ")
        .replace(/(\d+)\.\s+/g, "\n$1. ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    if (!clean)
        return null;
    const parts = [];
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s<>)"]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(clean)) !== null) {
        if (match.index > lastIndex) {
            parts.push(clean.substring(lastIndex, match.index));
        }
        if (match[1] && match[2]) {
            let linkTitle = match[1].replace(/^\*+|\*+$/g, "").trim();
            const linkUrl = match[2];
            const isEmail = linkUrl.startsWith("mailto:") || linkTitle.includes("@");
            // Only clean raw 24-character hexadecimal MongoDB/Prisma object IDs
            if (!isEmail && /^[a-f0-9]{24}$/i.test(linkTitle)) {
                try {
                    const u = new URL(linkUrl);
                    if (u.pathname &&
                        (u.pathname.includes("/products/") ||
                            u.pathname.includes("/product/"))) {
                        linkTitle = "View Product";
                    }
                    else if (u.pathname &&
                        (u.pathname.includes("/collection") ||
                            u.pathname.includes("/category"))) {
                        linkTitle = "View Collection";
                    }
                    else {
                        linkTitle = "View Item";
                    }
                }
                catch {
                    linkTitle = "View Item";
                }
            }
            parts.push((0, jsx_runtime_1.jsxs)("a", { href: linkUrl, target: isEmail ? "_self" : "_blank", rel: "noopener noreferrer", style: {
                    color: "#0284c7",
                    backgroundColor: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    padding: "2px 9px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontWeight: "600",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    margin: "2px 0",
                    lineHeight: "1.4",
                    transition: "all 0.15s ease",
                }, children: [linkTitle, " ", (0, jsx_runtime_1.jsx)("span", { style: { fontSize: "11px", opacity: 0.8 }, children: "\u2197" })] }));
        }
        else if (match[3]) {
            parts.push((0, jsx_runtime_1.jsx)("strong", { style: { fontWeight: "700", color: "#0f172a" }, children: match[3] }));
        }
        else if (match[4]) {
            const rawUrl = match[4];
            let displayLabel = rawUrl;
            const isRawEmail = rawUrl.startsWith("mailto:") || rawUrl.includes("@");
            if (!isRawEmail) {
                try {
                    const u = new URL(rawUrl);
                    if (u.pathname && u.pathname.length > 1) {
                        const lastSegment = u.pathname.split("/").filter(Boolean).pop() || "";
                        displayLabel = lastSegment
                            .replace(/[-_]/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase());
                    }
                    else {
                        displayLabel = u.hostname.replace(/^www\./, "");
                    }
                }
                catch { }
            }
            parts.push((0, jsx_runtime_1.jsxs)("a", { href: rawUrl, target: isRawEmail ? "_self" : "_blank", rel: "noopener noreferrer", style: {
                    color: "#0284c7",
                    backgroundColor: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    padding: "2px 9px",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontWeight: "600",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    margin: "2px 0",
                    lineHeight: "1.4",
                    wordBreak: "break-all",
                }, children: [displayLabel, " ", (0, jsx_runtime_1.jsx)("span", { style: { fontSize: "11px", opacity: 0.8 }, children: "\u2197" })] }));
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < clean.length) {
        parts.push(clean.substring(lastIndex));
    }
    return parts;
}
function TypewriterMessageText({ text, isBot, shouldAnimate = false, onType, }) {
    const [displayedText, setDisplayedText] = (0, hooks_1.useState)(!isBot || !shouldAnimate ? text : "");
    (0, hooks_1.useEffect)(() => {
        if (!isBot || !shouldAnimate) {
            setDisplayedText(text);
            onType?.();
            return;
        }
        const fullText = text || "";
        const charStep = fullText.length > 200 ? 5 : fullText.length > 100 ? 3 : 2;
        let currentPos = 0;
        setDisplayedText("");
        const timer = setInterval(() => {
            currentPos += charStep;
            if (currentPos < fullText.length) {
                setDisplayedText(fullText.slice(0, currentPos));
                onType?.();
            }
            else {
                setDisplayedText(fullText);
                onType?.();
                clearInterval(timer);
            }
        }, 12);
        return () => clearInterval(timer);
    }, [text, isBot, shouldAnimate]);
    return (0, jsx_runtime_1.jsx)("span", { children: renderMarkdownText(displayedText) });
}
function ChatWidget({ api }) {
    const [isOpen, setIsOpen] = (0, hooks_1.useState)(() => {
        if (typeof window === "undefined")
            return false;
        try {
            return (sessionStorage.getItem("labto_widget_open") === "true" ||
                Boolean(sessionStorage.getItem("labto_auto_add")));
        }
        catch {
            return false;
        }
    });
    const [isClosing, setIsClosing] = (0, hooks_1.useState)(false);
    const [isOpeningSkeleton, setIsOpeningSkeleton] = (0, hooks_1.useState)(false);
    const [isMobile, setIsMobile] = (0, hooks_1.useState)(typeof window !== "undefined" ? window.innerWidth <= 640 : false);
    const [config, setConfig] = (0, hooks_1.useState)({
        primaryColor: "#1DBF73",
        greetingMessage: "Hi there! How can I help today?",
        botName: "AI Assistant",
        position: "bottom-right",
        addToCartEnabled: true,
        hideBranding: false,
        eventBridgeEnabled: false,
    });
    const isLeft = config.position === "bottom-left";
    const [sessionId, setSessionId] = (0, hooks_1.useState)("");
    const [messages, setMessages] = (0, hooks_1.useState)([]);
    const [inputValue, setInputValue] = (0, hooks_1.useState)("");
    const [isLoading, setIsLoading] = (0, hooks_1.useState)(false);
    // Variant Options Selection Modal state
    const [modalProduct, setModalProduct] = (0, hooks_1.useState)(null);
    const [selectedOptionsState, setSelectedOptionsState] = (0, hooks_1.useState)({});
    const [modalQuantity, setModalQuantity] = (0, hooks_1.useState)(1);
    const [toastMsg, setToastMsg] = (0, hooks_1.useState)(null);
    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };
    const messagesContainerRef = (0, hooks_1.useRef)(null);
    const messagesEndRef = (0, hooks_1.useRef)(null);
    const scrollToBottom = (smooth = true) => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: smooth ? "smooth" : "auto",
            });
        }
        messagesEndRef.current?.scrollIntoView({
            behavior: smooth ? "smooth" : "auto",
        });
    };
    const [windowOffset, setWindowOffset] = (0, hooks_1.useState)({
        x: 0,
        y: 0,
    });
    const [launcherOffset, setLauncherOffset] = (0, hooks_1.useState)({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = (0, hooks_1.useState)(false);
    const dragStartRef = (0, hooks_1.useRef)(null);
    const didDragRef = (0, hooks_1.useRef)(false);
    const [viewportHeight, setViewportHeight] = (0, hooks_1.useState)(null);
    const [viewportTop, setViewportTop] = (0, hooks_1.useState)(0);
    // Mobile VisualViewport listener for Virtual Keyboard handling
    (0, hooks_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        const updateViewport = () => {
            const mobile = window.innerWidth <= 640;
            setIsMobile(mobile);
            if (mobile && window.visualViewport) {
                setViewportHeight(window.visualViewport.height);
                setViewportTop(window.visualViewport.offsetTop || 0);
            }
            else {
                setViewportHeight(null);
                setViewportTop(0);
            }
        };
        updateViewport();
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", updateViewport);
            window.visualViewport.addEventListener("scroll", updateViewport);
        }
        window.addEventListener("resize", updateViewport);
        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", updateViewport);
                window.visualViewport.removeEventListener("scroll", updateViewport);
            }
            window.removeEventListener("resize", updateViewport);
        };
    }, [isOpen]);
    // Lock background body scroll on mobile when widget is open
    (0, hooks_1.useEffect)(() => {
        if (typeof document === "undefined")
            return;
        if (isOpen && isMobile) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen, isMobile]);
    const handleOpen = () => {
        try {
            sessionStorage.setItem("labto_widget_open", "true");
        }
        catch { }
        setIsClosing(false);
        setIsOpen(true);
        setIsOpeningSkeleton(true);
        setTimeout(() => {
            setIsOpeningSkeleton(false);
            scrollToBottom(false);
        }, 150);
    };
    const handleClose = () => {
        try {
            sessionStorage.removeItem("labto_widget_open");
        }
        catch { }
        setIsClosing(true);
        setTimeout(() => {
            setIsOpen(false);
            setIsClosing(false);
        }, 220);
    };
    // Dragging event listeners
    (0, hooks_1.useEffect)(() => {
        const onMouseMove = (e) => {
            if (!dragStartRef.current)
                return;
            const dx = e.clientX - dragStartRef.current.clientX;
            const dy = e.clientY - dragStartRef.current.clientY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                didDragRef.current = true;
            }
            if (dragStartRef.current.target === "window") {
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
            if (dragStartRef.current.target === "window") {
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
            if (typeof window === "undefined")
                return { x: currentX, y: currentY };
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const elemWidth = target === "window" ? (windowWidth <= 640 ? windowWidth : 390) : 60;
            const elemHeight = target === "window" ? (windowHeight <= 640 ? windowHeight : 580) : 60;
            const baseLeft = isLeft ? 24 : windowWidth - 24 - elemWidth;
            const baseTop = target === "window"
                ? windowHeight - 96 - elemHeight
                : windowHeight - 24 - elemHeight;
            const absLeft = baseLeft + currentX;
            const absTop = baseTop + currentY;
            // Nearest corner calculation
            const snapLeft = absLeft < (windowWidth - elemWidth) / 2
                ? 24
                : windowWidth - 24 - elemWidth;
            const snapTop = absTop < (windowHeight - elemHeight) / 2
                ? 24
                : windowHeight - (target === "window" ? 96 : 24) - elemHeight;
            return {
                x: snapLeft - baseLeft,
                y: snapTop - baseTop,
            };
        };
        const onEnd = () => {
            if (dragStartRef.current && didDragRef.current) {
                const target = dragStartRef.current.target;
                if (target === "window") {
                    setWindowOffset((prev) => calculateSnap("window", prev.x, prev.y));
                }
                else {
                    setLauncherOffset((prev) => calculateSnap("launcher", prev.x, prev.y));
                }
            }
            dragStartRef.current = null;
            setIsDragging(false);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onEnd);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onEnd);
        };
    }, [isLeft]);
    (0, hooks_1.useEffect)(() => {
        // 1. Fetch Config
        api.getConfig().then(setConfig).catch(console.error);
        // 2. Manage Session
        let storedSession = "";
        try {
            storedSession =
                localStorage.getItem("aiw_session_id") ||
                    sessionStorage.getItem("aiw_session_id") ||
                    "";
        }
        catch { }
        const initHistory = (sessId) => {
            api
                .getHistory(sessId)
                .then((data) => {
                if (data.messages && data.messages.length > 0) {
                    setMessages(data.messages);
                }
            })
                .catch(console.error);
        };
        if (storedSession) {
            setSessionId(storedSession);
            initHistory(storedSession);
        }
        else {
            api
                .createSession()
                .then((newSess) => {
                setSessionId(newSess);
                try {
                    localStorage.setItem("aiw_session_id", newSess);
                }
                catch { }
            })
                .catch(console.error);
        }
        // 3. Visitor Tracking
        let vid = "";
        try {
            vid = localStorage.getItem("aiw_visitor_id") || "";
            if (!vid) {
                vid = `vid_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
                localStorage.setItem("aiw_visitor_id", vid);
            }
        }
        catch {
            vid = `vid_${Math.random().toString(36).substring(2, 11)}`;
        }
        api.pingVisitor(vid).catch(console.error);
        // 4. Auto-Add Watcher & Toast Listener
        (0, cartBridge_1.initAutoAddWatcher)();
        const handleToastEvent = (e) => {
            if (e.detail?.message)
                showToast(e.detail.message);
        };
        window.addEventListener("labto:toast", handleToastEvent);
        return () => window.removeEventListener("labto:toast", handleToastEvent);
    }, []);
    (0, hooks_1.useEffect)(() => {
        if (isOpen) {
            scrollToBottom(false);
            const timer1 = setTimeout(() => scrollToBottom(false), 50);
            const timer2 = setTimeout(() => scrollToBottom(false), 200);
            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
            };
        }
    }, [isOpen]);
    (0, hooks_1.useEffect)(() => {
        if (isOpen) {
            scrollToBottom(true);
        }
    }, [messages.length, isLoading, isOpeningSkeleton]);
    const handleSend = async (queryText) => {
        const text = (typeof queryText === "string" ? queryText : inputValue)
            .trim()
            .slice(0, 250);
        if (!text || isLoading)
            return;
        const userMsg = {
            id: `user_${Date.now()}`,
            sender: "user",
            text,
            time: "Just now",
        };
        const botMsgId = `bot_${Date.now()}`;
        const startTime = Date.now();
        let calculatedThinkingSeconds = 1;
        const botMsg = {
            id: botMsgId,
            sender: "bot",
            text: "",
            thoughts: [],
            thinkingSeconds: 1,
            time: "Just now",
            isStreaming: true,
        };
        setMessages((prev) => [...prev, userMsg, botMsg]);
        setInputValue("");
        setIsLoading(true);
        let tokenBuffer = "";
        let streamTimer = null;
        const startBufferDrain = () => {
            if (!streamTimer) {
                streamTimer = setInterval(() => {
                    if (tokenBuffer.length > 0) {
                        const step = Math.max(1, Math.min(tokenBuffer.length, Math.ceil(tokenBuffer.length / 2)));
                        const chunk = tokenBuffer.slice(0, step);
                        tokenBuffer = tokenBuffer.slice(step);
                        setMessages((prev) => prev.map((m) => m.id === botMsgId ? { ...m, text: (m.text || "") + chunk } : m));
                        scrollToBottom(false);
                    }
                }, 16);
            }
        };
        const onThought = (thought) => {
            setMessages((prev) => prev.map((m) => m.id === botMsgId
                ? { ...m, thoughts: [...(m.thoughts || []), thought] }
                : m));
            scrollToBottom(true);
        };
        const onToken = (token) => {
            if (isLoading) {
                setIsLoading(false);
                calculatedThinkingSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                setMessages((prev) => prev.map((m) => m.id === botMsgId
                    ? { ...m, thinkingSeconds: calculatedThinkingSeconds }
                    : m));
            }
            tokenBuffer += token;
            startBufferDrain();
        };
        const onDone = (res) => {
            if (streamTimer) {
                clearInterval(streamTimer);
                streamTimer = null;
            }
            setIsLoading(false);
            calculatedThinkingSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
            setMessages((prev) => prev.map((m) => m.id === botMsgId
                ? {
                    ...m,
                    text: res.reply || m.text,
                    products: res.products,
                    thoughts: res.thoughts && res.thoughts.length > 0
                        ? res.thoughts
                        : m.thoughts,
                    thinkingSeconds: calculatedThinkingSeconds,
                    isStreaming: false,
                }
                : m));
            // Handle Cart Action & Variant Modal
            if (res.cartAction) {
                const actionProdId = res.cartAction.productId;
                const targetProd = (res.products || []).find((p) => p.id === actionProdId ||
                    p.externalId === actionProdId ||
                    p.productUrl?.includes(actionProdId)) || {
                    id: actionProdId,
                    externalId: res.cartAction.productId,
                    title: res.cartAction.title || "Product",
                    price: res.cartAction.price || 0,
                    currency: res.cartAction.currency || "USD",
                    productUrl: res.cartAction.productUrl || "#",
                    imageUrl: res.cartAction.imageUrl,
                    inStock: true,
                    options: res.cartAction.options,
                    variants: res.cartAction.variants,
                };
                const rawOptions = res.cartAction.options || targetProd.options || [];
                const safeOptions = parseSafeOptions(rawOptions);
                const hasOptions = safeOptions.length > 0;
                const selectedOptsKeys = res.cartAction.selectedOptions &&
                    typeof res.cartAction.selectedOptions === "object"
                    ? Object.keys(res.cartAction.selectedOptions)
                    : [];
                const hasAllSelectedOpts = hasOptions && selectedOptsKeys.length >= safeOptions.length;
                if (res.cartAction.requiresSelection ||
                    (hasOptions && !hasAllSelectedOpts && !res.cartAction.variantId)) {
                    const defaultOpts = {
                        ...(res.cartAction.selectedOptions || {}),
                    };
                    safeOptions.forEach((opt) => {
                        if (!defaultOpts[opt.name] && opt.values.length > 0) {
                            defaultOpts[opt.name] = opt.values[0];
                        }
                    });
                    setSelectedOptionsState(defaultOpts);
                    setModalQuantity(res.cartAction.quantity || 1);
                    setModalProduct({
                        ...targetProd,
                        options: safeOptions,
                        productUrl: res.cartAction.productUrl || targetProd.productUrl,
                    });
                }
                else {
                    (0, cartBridge_1.requestAddToCart)(res.cartAction.productId, res.cartAction.quantity || 1, res.cartAction.variantId, res.cartAction.selectedOptions, res.cartAction.productUrl || targetProd.productUrl).then((result) => {
                        if (result.message && result.platform !== "dom_simulation") {
                            showToast(result.message);
                        }
                    });
                }
            }
            scrollToBottom(true);
        };
        const onError = (err) => {
            if (streamTimer) {
                clearInterval(streamTimer);
                streamTimer = null;
            }
            setIsLoading(false);
            let errorMsg = "Sorry, I ran into an error. Please try again.";
            if (err?.message?.includes("revoked") ||
                err?.message?.includes("Invalid") ||
                err?.message?.includes("Unauthorized")) {
                errorMsg =
                    "This assistant is currently offline. Please contact the website administrator.";
            }
            else if (err?.message?.includes("limit") ||
                err?.message?.includes("quota") ||
                err?.message?.includes("429")) {
                errorMsg =
                    "Our live chat support is currently taking a short break. Please feel free to reach out to us directly via our Contact page or email!";
            }
            else if (err?.message) {
                errorMsg = err.message;
            }
            setMessages((prev) => prev.map((m) => m.id === botMsgId
                ? {
                    ...m,
                    text: errorMsg,
                    isStreaming: false,
                }
                : m));
            scrollToBottom(true);
        };
        await api.streamMessage(sessionId, text, onThought, onToken, onDone, onError);
    };
    const handleResetSession = () => {
        api
            .createSession()
            .then((newSess) => {
            setSessionId(newSess);
            try {
                localStorage.setItem("aiw_session_id", newSess);
            }
            catch { }
            setMessages([
                {
                    id: `msg_welcome_${Date.now()}`,
                    sender: "bot",
                    text: config.greetingMessage || "Hi there! How can I help today?",
                    time: "Just now",
                },
            ]);
        })
            .catch(console.error);
    };
    const primaryColor = config.primaryColor || "#0f172a";
    return ((0, jsx_runtime_1.jsxs)("div", { style: {
            position: "fixed",
            bottom: "24px",
            right: isLeft ? "auto" : "24px",
            left: isLeft ? "24px" : "auto",
            zIndex: 999999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            userSelect: isDragging ? "none" : "auto",
        }, children: [(0, jsx_runtime_1.jsx)("style", { children: `
        @keyframes mbot-open-smooth {
          0% {
            opacity: 0;
            transform: scale(0.88) translateY(24px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes mbot-close-smooth {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.88) translateY(24px);
          }
        }
        .mbot-window-enter {
          animation: mbot-open-smooth 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: bottom right;
        }
        .mbot-window-exit {
          animation: mbot-close-smooth 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: bottom right;
        }
        @keyframes mbot-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes mbot-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes mbot-user-send {
          0% {
            opacity: 0;
            transform: scale(0.92) translateY(14px);
          }
          65% {
            opacity: 0.95;
            transform: scale(1.01) translateY(-2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .mbot-msg-user {
          animation: mbot-user-send 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: bottom right;
        }
        @keyframes mbot-backdrop-enter {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes mbot-modal-enter {
          0% {
            opacity: 0;
            transform: scale(0.86) translateY(24px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .mbot-backdrop-anim {
          animation: mbot-backdrop-enter 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .mbot-modal-anim {
          animation: mbot-modal-enter 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: center bottom;
        }
        .mbot-skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: mbot-shimmer 1.4s infinite linear;
          border-radius: 12px;
        }
      ` }), isOpen && ((0, jsx_runtime_1.jsxs)("div", { className: !isDragging
                    ? isClosing
                        ? "mbot-window-exit"
                        : "mbot-window-enter"
                    : "", style: {
                    position: isMobile ? "fixed" : "absolute",
                    top: isMobile
                        ? viewportTop > 0
                            ? `${viewportTop}px`
                            : "0px"
                        : "auto",
                    left: isMobile ? "0" : isLeft ? "0" : "auto",
                    right: isMobile ? "0" : isLeft ? "auto" : "0",
                    bottom: isMobile ? "auto" : "72px",
                    zIndex: 999999,
                    width: isMobile ? "100vw" : "390px",
                    maxWidth: isMobile ? "100vw" : "calc(100vw - 32px)",
                    height: isMobile
                        ? viewportHeight
                            ? `${viewportHeight}px`
                            : "100dvh"
                        : "580px",
                    maxHeight: isMobile
                        ? viewportHeight
                            ? `${viewportHeight}px`
                            : "100dvh"
                        : "calc(100vh - 120px)",
                    backgroundColor: "#ffffff",
                    borderRadius: isMobile ? "0px" : "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    border: isMobile ? "none" : "1px solid #E4E5E7",
                    transform: isMobile
                        ? "none"
                        : windowOffset.x !== 0 || windowOffset.y !== 0
                            ? `translate3d(${windowOffset.x}px, ${windowOffset.y}px, 0)`
                            : "none",
                    transition: isMobile
                        ? "none"
                        : isDragging
                            ? "none"
                            : "transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)",
                }, onWheel: (e) => e.stopPropagation(), onTouchMove: (e) => e.stopPropagation(), children: [(0, jsx_runtime_1.jsxs)("div", { onMouseDown: (e) => {
                            if (e.target?.closest("button"))
                                return;
                            if (isMobile)
                                return;
                            dragStartRef.current = {
                                clientX: e.clientX,
                                clientY: e.clientY,
                                startX: windowOffset.x,
                                startY: windowOffset.y,
                                target: "window",
                            };
                            didDragRef.current = false;
                            setIsDragging(true);
                        }, onTouchStart: (e) => {
                            if (e.target?.closest("button"))
                                return;
                            if (isMobile || !e.touches[0])
                                return;
                            dragStartRef.current = {
                                clientX: e.touches[0].clientX,
                                clientY: e.touches[0].clientY,
                                startX: windowOffset.x,
                                startY: windowOffset.y,
                                target: "window",
                            };
                            didDragRef.current = false;
                            setIsDragging(true);
                        }, style: {
                            backgroundColor: config.headerBgColor || "#ffffff",
                            padding: "16px 12px 16px 18px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: isMobile ? "default" : isDragging ? "grabbing" : "grab",
                            userSelect: "none",
                            borderBottom: "1.5px solid #f1f5f9",
                        }, title: "Click and drag to move chat window", children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "12px" }, children: [config.botAvatarUrl ? ((0, jsx_runtime_1.jsx)("img", { src: config.botAvatarUrl, alt: config.botName || "Bot Avatar", style: {
                                            width: "36px",
                                            height: "36px",
                                            borderRadius: "8px",
                                            objectFit: "cover",
                                            border: "1px solid rgba(0, 0, 0, 0.08)",
                                            flexShrink: 0,
                                        } })) : ((0, jsx_runtime_1.jsx)(BotMascotSvg, {})), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { style: {
                                                    margin: 0,
                                                    fontSize: "15px",
                                                    fontWeight: "700",
                                                    color: config.headerTextColor || "#0f172a",
                                                    letterSpacing: "-0.2px",
                                                }, children: config.botName || "AI Assistant" }), (0, jsx_runtime_1.jsx)("span", { style: {
                                                    fontSize: "12px",
                                                    color: config.headerTextColor
                                                        ? `${config.headerTextColor}CC`
                                                        : "#64748b",
                                                    display: "block",
                                                    marginTop: "1px",
                                                }, children: "The team can also help" })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "2px" }, children: [(0, jsx_runtime_1.jsx)("button", { onClick: handleResetSession, title: "Restart chat", style: {
                                            background: "transparent",
                                            border: "none",
                                            borderRadius: "6px",
                                            width: "30px",
                                            height: "30px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#64748b",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease",
                                            padding: 0,
                                        }, onMouseEnter: (e) => {
                                            e.currentTarget.style.color = "#0f172a";
                                            e.currentTarget.style.backgroundColor =
                                                "#f1f5f9";
                                        }, onMouseLeave: (e) => {
                                            e.currentTarget.style.color = "#64748b";
                                            e.currentTarget.style.backgroundColor =
                                                "transparent";
                                        }, children: (0, jsx_runtime_1.jsx)(RefreshSvg, {}) }), (0, jsx_runtime_1.jsx)("button", { onClick: handleClose, title: "Close chat", style: {
                                            background: "transparent",
                                            border: "none",
                                            borderRadius: "6px",
                                            width: "30px",
                                            height: "30px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#64748b",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease",
                                            padding: 0,
                                        }, onMouseEnter: (e) => {
                                            e.currentTarget.style.color = "#0f172a";
                                            e.currentTarget.style.backgroundColor =
                                                "#f1f5f9";
                                        }, onMouseLeave: (e) => {
                                            e.currentTarget.style.color = "#64748b";
                                            e.currentTarget.style.backgroundColor =
                                                "transparent";
                                        }, children: (0, jsx_runtime_1.jsx)(CloseSvg, {}) })] })] }), isOpeningSkeleton ? ((0, jsx_runtime_1.jsxs)("div", { style: {
                            flex: "1 1 0%",
                            padding: "24px 20px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                        }, children: [(0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: "12px" }, children: [(0, jsx_runtime_1.jsx)("div", { className: "mbot-skeleton", style: {
                                            width: "40px",
                                            height: "40px",
                                            borderRadius: "12px",
                                            flexShrink: 0,
                                        } }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "8px",
                                        }, children: [(0, jsx_runtime_1.jsx)("div", { className: "mbot-skeleton", style: {
                                                    width: "75%",
                                                    height: "44px",
                                                    borderRadius: "16px",
                                                } }), (0, jsx_runtime_1.jsx)("div", { className: "mbot-skeleton", style: { width: "40%", height: "14px" } })] })] }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "flex", gap: "12px", marginTop: "14px" }, children: [(0, jsx_runtime_1.jsx)("div", { className: "mbot-skeleton", style: {
                                            width: "40px",
                                            height: "40px",
                                            borderRadius: "12px",
                                            flexShrink: 0,
                                        } }), (0, jsx_runtime_1.jsx)("div", { style: {
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "8px",
                                        }, children: (0, jsx_runtime_1.jsx)("div", { className: "mbot-skeleton", style: {
                                                width: "60%",
                                                height: "36px",
                                                borderRadius: "16px",
                                            } }) })] })] })) : (
                    /* Messages Body */
                    (0, jsx_runtime_1.jsxs)("div", { ref: messagesContainerRef, onWheel: (e) => e.stopPropagation(), onTouchMove: (e) => e.stopPropagation(), style: {
                            flex: "1 1 0%",
                            minHeight: 0,
                            maxHeight: "100%",
                            padding: "20px 18px",
                            overflowY: "auto",
                            WebkitOverflowScrolling: "touch",
                            overscrollBehavior: "contain",
                            overscrollBehaviorY: "contain",
                            touchAction: "pan-y",
                            backgroundColor: "#ffffff",
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                        }, children: [messages.map((msg) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
                                }, children: [msg.sender === "bot" && msg.isStreaming && !msg.text && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            fontSize: "12px",
                                            fontWeight: "400",
                                            color: "#64748b",
                                            backgroundColor: "#f8fafc",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "14px",
                                            padding: "6px 12px",
                                            marginBottom: "6px",
                                        }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                                    display: "inline-block",
                                                    width: "11px",
                                                    height: "11px",
                                                    borderRadius: "50%",
                                                    border: "2px solid #cbd5e1",
                                                    borderTopColor: primaryColor,
                                                    animation: "mbot-spin 0.75s linear infinite",
                                                } }), (0, jsx_runtime_1.jsx)("span", { children: "Thinking..." })] })), msg.sender === "bot" &&
                                        msg.thoughts &&
                                        msg.thoughts.length > 0 &&
                                        (msg.text || !msg.isStreaming) && ((0, jsx_runtime_1.jsxs)("details", { style: {
                                            marginBottom: "8px",
                                            fontSize: "11.5px",
                                            color: "#64748b",
                                            backgroundColor: "#f8fafc",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "12px",
                                            padding: "5px 11px",
                                            maxWidth: "92%",
                                            lineHeight: "1.4",
                                        }, children: [(0, jsx_runtime_1.jsxs)("summary", { style: {
                                                    cursor: "pointer",
                                                    fontWeight: "500",
                                                    outline: "none",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "5px",
                                                    userSelect: "none",
                                                    color: "#475569",
                                                }, children: [(0, jsx_runtime_1.jsx)(BrainSvg, {}), " Thought for ", msg.thinkingSeconds || 1, "s"] }), (0, jsx_runtime_1.jsx)("div", { style: {
                                                    marginTop: "6px",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "4px",
                                                    borderTop: "1px solid #e2e8f0",
                                                    paddingTop: "6px",
                                                    color: "#64748b",
                                                }, children: msg.thoughts.map((t, idx) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "5px",
                                                    }, children: [(0, jsx_runtime_1.jsx)("span", { style: { color: "#94a3b8" }, children: "\u2022" }), (0, jsx_runtime_1.jsx)("span", { children: t })] }, idx))) })] })), Boolean(msg.text || msg.sender === "user") && ((0, jsx_runtime_1.jsx)("div", { className: msg.sender === "user" ? "mbot-msg-user" : "", style: {
                                            backgroundColor: msg.sender === "user" ? primaryColor : "#f1f5f9",
                                            color: msg.sender === "user" ? "#ffffff" : "#1e293b",
                                            padding: "8px 12px",
                                            borderRadius: msg.sender === "user"
                                                ? "8px 8px 2px 8px"
                                                : "8px 8px 8px 2px",
                                            maxWidth: "85%",
                                            wordBreak: "break-word",
                                            whiteSpace: "pre-wrap",
                                            boxShadow: "none",
                                            fontSize: "14px",
                                            lineHeight: "1.55",
                                            fontWeight: "400",
                                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                                            border: msg.sender === "user" ? "none" : "1px solid #e2e8f0",
                                        }, children: msg.isStreaming ? (renderMarkdownText(msg.text)) : ((0, jsx_runtime_1.jsx)(TypewriterMessageText, { text: msg.text, isBot: msg.sender === "bot", shouldAnimate: Boolean(msg.shouldAnimate), onType: () => scrollToBottom(false) })) })), msg.sender === "bot" && ((0, jsx_runtime_1.jsx)("span", { style: {
                                            fontSize: "11px",
                                            color: "#94a3b8",
                                            marginTop: "5px",
                                            paddingLeft: "4px",
                                        }, children: msg.time })), msg.sender === "user" && ((0, jsx_runtime_1.jsx)("span", { style: {
                                            fontSize: "11px",
                                            color: "#94a3b8",
                                            marginTop: "4px",
                                            paddingRight: "4px",
                                        }, children: msg.time }))] }, msg.id))), messages.length <= 1 && !isLoading && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                    marginTop: "6px",
                                    maxWidth: "100%",
                                }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                            fontSize: "12px",
                                            color: "#64748b",
                                            fontWeight: "500",
                                            paddingLeft: "2px",
                                        }, children: "Suggested questions" }), (0, jsx_runtime_1.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: (config.suggestionChips &&
                                            config.suggestionChips.length > 0
                                            ? config.suggestionChips.map((text) => ({
                                                label: text,
                                                query: text,
                                            }))
                                            : [
                                                {
                                                    label: "View Projects",
                                                    query: "Show me your portfolio projects",
                                                },
                                                {
                                                    label: "Our Services",
                                                    query: "What services do you provide?",
                                                },
                                                {
                                                    label: "Contact Info",
                                                    query: "How can I contact you?",
                                                },
                                            ]).map((chip, i) => ((0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => handleSend(chip.query), style: {
                                                backgroundColor: "#ffffff",
                                                color: "#334155",
                                                border: "1px solid #e2e8f0",
                                                borderRadius: "8px",
                                                padding: "7px 13px",
                                                fontSize: "12.5px",
                                                fontWeight: "400",
                                                cursor: "pointer",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                transition: "all 0.15s ease",
                                                boxShadow: "none",
                                                userSelect: "none",
                                            }, onMouseEnter: (e) => {
                                                e.currentTarget.style.backgroundColor = "#f8fafc";
                                                e.currentTarget.style.borderColor =
                                                    "#cbd5e1";
                                            }, onMouseLeave: (e) => {
                                                e.currentTarget.style.backgroundColor = "#ffffff";
                                                e.currentTarget.style.borderColor =
                                                    "#e2e8f0";
                                            }, children: [(0, jsx_runtime_1.jsx)(MessageSquareSvg, {}), (0, jsx_runtime_1.jsx)("span", { children: chip.label })] }, i))) })] })), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] })), (0, jsx_runtime_1.jsxs)("div", { style: {
                            padding: "14px 18px",
                            backgroundColor: "#ffffff",
                            borderTop: "1.5px solid #f1f5f9",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                        }, children: [(0, jsx_runtime_1.jsxs)("form", { onSubmit: (e) => {
                                    e.preventDefault();
                                    handleSend();
                                }, style: {
                                    display: "flex",
                                    gap: "8px",
                                    alignItems: "center",
                                    backgroundColor: "#ffffff",
                                    border: "1.5px solid #cbd5e1",
                                    borderRadius: "8px",
                                    padding: "4px 6px 4px 14px",
                                    boxShadow: "none",
                                }, children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Ask about projects, services, or anything...", value: inputValue, maxLength: 250, onFocus: () => {
                                            if (isMobile) {
                                                setTimeout(() => scrollToBottom(false), 220);
                                            }
                                        }, onInput: (e) => setInputValue((e.target.value || "").slice(0, 250)), style: {
                                            flex: 1,
                                            padding: "9px 0",
                                            border: "none",
                                            backgroundColor: "transparent",
                                            color: "#0f172a",
                                            fontSize: "14px",
                                            outline: "none",
                                        } }), inputValue.length >= 200 && ((0, jsx_runtime_1.jsxs)("span", { style: {
                                            fontSize: "10.5px",
                                            color: inputValue.length >= 240 ? "#ef4444" : "#64748b",
                                            fontWeight: "600",
                                            paddingRight: "4px",
                                        }, children: [inputValue.length, "/250"] })), (0, jsx_runtime_1.jsx)("button", { type: "submit", disabled: !inputValue.trim() || isLoading, title: "Send message", style: {
                                            backgroundColor: inputValue.trim()
                                                ? primaryColor || "#1DBF73"
                                                : "#cbd5e1",
                                            color: "#ffffff",
                                            border: "none",
                                            borderRadius: "6px",
                                            width: "34px",
                                            height: "34px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: inputValue.trim() && !isLoading ? "pointer" : "default",
                                            transition: "all 0.2s ease",
                                            flexShrink: 0,
                                        }, children: (0, jsx_runtime_1.jsx)(SendSvg, {}) })] }), !config.hideBranding && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                    textAlign: "center",
                                    fontSize: "10.5px",
                                    color: "#94a3b8",
                                    letterSpacing: "0.2px",
                                    marginTop: "2px",
                                }, children: ["Powered by", " ", (0, jsx_runtime_1.jsx)("strong", { style: { color: "#64748b", fontWeight: "600" }, children: "Labto AI" })] }))] }), toastMsg && ((0, jsx_runtime_1.jsxs)("div", { style: {
                            position: "absolute",
                            top: "64px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            backgroundColor: "#0f172a",
                            color: "#ffffff",
                            padding: "8px 16px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "600",
                            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)",
                            zIndex: 99999,
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            animation: "fadeIn 0.2s ease",
                        }, children: [(0, jsx_runtime_1.jsx)("span", { children: "\u2713" }), (0, jsx_runtime_1.jsx)("span", { children: toastMsg })] })), modalProduct && ((0, jsx_runtime_1.jsx)("div", { className: "mbot-backdrop-anim", style: {
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(15, 23, 42, 0.65)",
                            backdropFilter: "blur(4px)",
                            zIndex: 9999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "16px",
                        }, children: (0, jsx_runtime_1.jsxs)("div", { className: "mbot-modal-anim", style: {
                                backgroundColor: "#ffffff",
                                borderRadius: "16px",
                                padding: "20px",
                                maxWidth: "310px",
                                width: "100%",
                                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.15)",
                                border: "1px solid #e2e8f0",
                            }, children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: "10px",
                                    }, children: [(0, jsx_runtime_1.jsx)("h4", { style: {
                                                margin: 0,
                                                fontSize: "14px",
                                                fontWeight: "700",
                                                color: "#0f172a",
                                            }, children: "Select Product Options" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setModalProduct(null), style: {
                                                background: "none",
                                                border: "none",
                                                cursor: "pointer",
                                                color: "#64748b",
                                                fontSize: "16px",
                                                fontWeight: "700",
                                            }, children: "\u2715" })] }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                        marginBottom: "14px",
                                        fontSize: "12.5px",
                                        color: "#334155",
                                    }, children: [(0, jsx_runtime_1.jsx)("div", { style: { fontWeight: "600", color: "#0f172a" }, children: modalProduct.title }), modalProduct.price > 0 && ((0, jsx_runtime_1.jsxs)("div", { style: {
                                                fontSize: "13px",
                                                fontWeight: "700",
                                                color: primaryColor,
                                                marginTop: "2px",
                                            }, children: ["$", modalProduct.price, " ", modalProduct.currency || "USD"] }))] }), parseSafeOptions(modalProduct.options).map((opt) => ((0, jsx_runtime_1.jsxs)("div", { style: { marginBottom: "12px" }, children: [(0, jsx_runtime_1.jsxs)("label", { style: {
                                                display: "block",
                                                fontSize: "11px",
                                                fontWeight: "600",
                                                color: "#64748b",
                                                textTransform: "uppercase",
                                                marginBottom: "6px",
                                            }, children: [opt.name, ":", " ", (0, jsx_runtime_1.jsx)("span", { style: { color: "#0f172a", textTransform: "none" }, children: selectedOptionsState[opt.name] || opt.values[0] })] }), (0, jsx_runtime_1.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: opt.values.map((val) => {
                                                const isSelected = selectedOptionsState[opt.name] === val;
                                                return ((0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setSelectedOptionsState((prev) => ({
                                                        ...prev,
                                                        [opt.name]: val,
                                                    })), style: {
                                                        padding: "5px 12px",
                                                        borderRadius: "8px",
                                                        fontSize: "12px",
                                                        fontWeight: "600",
                                                        cursor: "pointer",
                                                        border: isSelected
                                                            ? `2px solid ${primaryColor}`
                                                            : "1px solid #cbd5e1",
                                                        backgroundColor: isSelected
                                                            ? `${primaryColor}15`
                                                            : "#ffffff",
                                                        color: isSelected ? primaryColor : "#334155",
                                                        transition: "all 0.15s ease",
                                                    }, children: val }, val));
                                            }) })] }, opt.name))), (0, jsx_runtime_1.jsxs)("div", { style: {
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginTop: "16px",
                                        marginBottom: "16px",
                                    }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                                                fontSize: "12px",
                                                fontWeight: "600",
                                                color: "#64748b",
                                            }, children: "Quantity:" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                                                display: "flex",
                                                alignItems: "center",
                                                border: "1px solid #cbd5e1",
                                                borderRadius: "8px",
                                                overflow: "hidden",
                                            }, children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setModalQuantity((q) => Math.max(1, q - 1)), style: {
                                                        width: "28px",
                                                        height: "28px",
                                                        border: "none",
                                                        backgroundColor: "#f8fafc",
                                                        cursor: "pointer",
                                                        fontWeight: "bold",
                                                    }, children: "-" }), (0, jsx_runtime_1.jsx)("span", { style: {
                                                        padding: "0 10px",
                                                        fontSize: "12px",
                                                        fontWeight: "600",
                                                    }, children: modalQuantity }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => setModalQuantity((q) => q + 1), style: {
                                                        width: "28px",
                                                        height: "28px",
                                                        border: "none",
                                                        backgroundColor: "#f8fafc",
                                                        cursor: "pointer",
                                                        fontWeight: "bold",
                                                    }, children: "+" })] })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => {
                                        const variantsList = Array.isArray(modalProduct.variants)
                                            ? modalProduct.variants
                                            : [];
                                        const selectedVariant = variantsList.find((v) => {
                                            if (!v.options)
                                                return false;
                                            return Object.entries(selectedOptionsState).every(([k, val]) => String(v.options?.[k]).toLowerCase() ===
                                                String(val).toLowerCase());
                                        });
                                        const optSummary = Object.entries(selectedOptionsState)
                                            .map(([k, v]) => `${k}: ${v}`)
                                            .join(", ");
                                        const confirmMsg = {
                                            id: `bot_confirm_${Date.now()}`,
                                            sender: "bot",
                                            text: optSummary
                                                ? `Added **[${modalProduct.title}](${modalProduct.productUrl || `/products/${modalProduct.id}`})** (${optSummary}, Quantity: ${modalQuantity}) to your cart! 🛍️`
                                                : `Added **[${modalProduct.title}](${modalProduct.productUrl || `/products/${modalProduct.id}`})** (Quantity: ${modalQuantity}) to your cart! 🛍️`,
                                            products: [modalProduct],
                                            time: "Just now",
                                        };
                                        setMessages((prev) => [...prev, confirmMsg]);
                                        setTimeout(() => scrollToBottom(true), 50);
                                        (0, cartBridge_1.requestAddToCart)(modalProduct.externalId || modalProduct.id, modalQuantity, selectedVariant?.id, selectedOptionsState, modalProduct.productUrl).then((res) => {
                                            if (res.platform !== "dom_simulation") {
                                                showToast(res.message ||
                                                    `Added '${modalProduct.title}' to cart!`);
                                            }
                                        });
                                        setModalProduct(null);
                                    }, style: {
                                        width: "100%",
                                        padding: "10px",
                                        backgroundColor: primaryColor,
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "10px",
                                        fontWeight: "700",
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        boxShadow: "0 4px 12px rgba(29, 191, 115, 0.25)",
                                    }, children: "Confirm & Add to Cart" })] }) }))] })), (0, jsx_runtime_1.jsxs)("button", { onMouseDown: (e) => {
                    dragStartRef.current = {
                        clientX: e.clientX,
                        clientY: e.clientY,
                        startX: launcherOffset.x,
                        startY: launcherOffset.y,
                        target: "launcher",
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
                        target: "launcher",
                    };
                    didDragRef.current = false;
                    setIsDragging(true);
                }, onClick: () => {
                    if (!didDragRef.current) {
                        if (isOpen) {
                            handleClose();
                        }
                        else {
                            handleOpen();
                        }
                    }
                }, title: isOpen ? "Close chat" : "Open AI Assistant", style: {
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    backgroundColor: isOpen
                        ? "#14844E"
                        : config.launcherBgColor || primaryColor || "#1DBF73",
                    color: config.launcherIconColor || "#ffffff",
                    border: "2px solid rgba(255, 255, 255, 0.25)",
                    cursor: isDragging ? "grabbing" : "pointer",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    userSelect: "none",
                    transform: launcherOffset.x !== 0 || launcherOffset.y !== 0
                        ? `translate3d(${launcherOffset.x}px, ${launcherOffset.y}px, 0)`
                        : "none",
                    transition: isDragging
                        ? "none"
                        : "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, box-shadow 0.2s ease",
                }, children: [!isOpen && ((0, jsx_runtime_1.jsx)("div", { style: {
                            position: "absolute",
                            top: "2px",
                            right: "2px",
                            width: "14px",
                            height: "14px",
                            backgroundColor: "#1DBF73",
                            borderRadius: "50%",
                            border: "2.5px solid #ffffff",
                            boxShadow: "0 0 8px rgba(29, 191, 115, 0.85)",
                        } })), isOpen ? ((0, jsx_runtime_1.jsx)(ChevronDownSvg, {})) : ((0, jsx_runtime_1.jsx)("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: (0, jsx_runtime_1.jsx)("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" }) }))] })] }));
}
