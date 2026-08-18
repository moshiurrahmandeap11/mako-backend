import { h, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { WidgetAPI, WidgetConfig, ProductCard } from './api';
import { requestAddToCart } from './cartBridge';

interface ChatWidgetProps {
  api: WidgetAPI;
  apiKey: string;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  products?: ProductCard[];
  thoughts?: string[];
  time: string;
}

// Crisp Vector SVGs (No Emojis)
const BotMascotSvg = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
    <rect width="32" height="32" rx="10" fill="#f0fdf4" />
    <path d="M16 5V8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="4" r="1.5" fill="#10b981" />
    <rect x="7" y="8" width="18" height="15" rx="5" fill="#0f172a" />
    <circle cx="12" cy="15" r="2" fill="#10b981" />
    <circle cx="20" cy="15" r="2" fill="#10b981" />
    <path d="M13.5 19C14.2 19.8 15 20.2 16 20.2C17 20.2 17.8 19.8 18.5 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5 14C5 13 5.8 12.2 6.8 12.2V17.8C5.8 17.8 5 17 5 16V14Z" fill="#0f172a" />
    <path d="M27 14C27 13 26.2 12.2 25.2 12.2V17.8C26.2 17.8 27 17 27 16V14Z" fill="#0f172a" />
  </svg>
);

const BrainSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" />
  </svg>
);

const CloseSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const RefreshSvg = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const SendSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" fillOpacity="0.25" />
  </svg>
);

const ChevronDownSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function renderMarkdownText(text: string) {
  if (!text) return null;

  let clean = text
    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '')
    .replace(/#+\s*/g, '')
    .replace(/^[\t ]*\*[\t ]+/gm, '• ')
    .replace(/\n[\t ]*\*[\t ]+/g, '\n• ')
    .replace(/(\d+)\.\s+/g, '\n$1. ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!clean) return null;

  const parts = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|(https?:\/\/[^\s<>)"]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      parts.push(clean.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const linkTitle = match[1];
      const linkUrl = match[2];
      parts.push(
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#0284c7',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
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
          }}
        >
          {linkTitle} <span style={{ fontSize: '11px', opacity: 0.8 }}>↗</span>
        </a>
      );
    } else if (match[3]) {
      parts.push(<strong style={{ fontWeight: '700', color: '#0f172a' }}>{match[3]}</strong>);
    } else if (match[4]) {
      const rawUrl = match[4];
      let displayLabel = rawUrl;
      try {
        const u = new URL(rawUrl);
        if (u.pathname && u.pathname.length > 1) {
          const lastSegment = u.pathname.split('/').filter(Boolean).pop() || '';
          displayLabel = lastSegment
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
        } else {
          displayLabel = u.hostname.replace('.vercel.app', '').replace('.com', '');
        }
      } catch {}

      parts.push(
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#0284c7',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
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
          }}
        >
          {displayLabel} <span style={{ fontSize: '11px', opacity: 0.8 }}>↗</span>
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export function ChatWidget({ api }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpeningSkeleton, setIsOpeningSkeleton] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  const [config, setConfig] = useState<WidgetConfig>({
    primaryColor: '#0f172a',
    greetingMessage: 'Hi there! How can I help today?',
    botName: 'AI Assistant',
    position: 'bottom-right',
    addToCartEnabled: true,
    hideBranding: false,
    eventBridgeEnabled: false,
  });
  const isLeft = config.position === 'bottom-left';
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [windowOffset, setWindowOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [launcherOffset, setLauncherOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number; target: 'window' | 'launcher' } | null>(null);
  const didDragRef = useRef<boolean>(false);

  // Resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpen = () => {
    setIsClosing(false);
    setIsOpen(true);
    setIsOpeningSkeleton(true);
    setTimeout(() => {
      setIsOpeningSkeleton(false);
    }, 380);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 220);
  };

  // Cycle thinking phases
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setThinkingPhase(0);
      interval = setInterval(() => {
        setThinkingPhase((prev) => (prev < 2 ? prev + 1 : 0));
      }, 700);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  // Dragging event listeners
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
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
      } else {
        setLauncherOffset({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current || !e.touches[0]) return;
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
      } else {
        setLauncherOffset({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        });
      }
    };

    const calculateSnap = (target: 'window' | 'launcher', currentX: number, currentY: number) => {
      if (typeof window === 'undefined') return { x: currentX, y: currentY };
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const elemWidth = target === 'window' ? (windowWidth <= 640 ? windowWidth : 390) : 60;
      const elemHeight = target === 'window' ? (windowHeight <= 640 ? windowHeight : 580) : 60;

      const baseLeft = isLeft ? 24 : windowWidth - 24 - elemWidth;
      const baseTop = target === 'window' ? (windowHeight - 96 - elemHeight) : (windowHeight - 24 - elemHeight);

      const absLeft = baseLeft + currentX;
      const absTop = baseTop + currentY;

      // Nearest corner calculation
      const snapLeft = absLeft < (windowWidth - elemWidth) / 2 ? 24 : windowWidth - 24 - elemWidth;
      const snapTop = absTop < (windowHeight - elemHeight) / 2 ? 24 : windowHeight - (target === 'window' ? 96 : 24) - elemHeight;

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
        } else {
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

  useEffect(() => {
    // 1. Fetch Config
    api.getConfig().then(setConfig).catch(console.error);

    // 2. Manage Session
    let storedSession = '';
    try {
      storedSession = localStorage.getItem('aiw_session_id') || sessionStorage.getItem('aiw_session_id') || '';
    } catch {}

    const initHistory = (sessId: string) => {
      api.getHistory(sessId).then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
      }).catch(console.error);
    };

    if (storedSession) {
      setSessionId(storedSession);
      initHistory(storedSession);
    } else {
      api.createSession().then((newSess) => {
        setSessionId(newSess);
        try {
          localStorage.setItem('aiw_session_id', newSess);
        } catch {}
      }).catch(console.error);
    }

    // 3. Visitor Tracking
    let vid = '';
    try {
      vid = localStorage.getItem('aiw_visitor_id') || '';
      if (!vid) {
        vid = `vid_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
        localStorage.setItem('aiw_visitor_id', vid);
      }
    } catch {
      vid = `vid_${Math.random().toString(36).substring(2, 11)}`;
    }

    api.pingVisitor(vid).catch(console.error);
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'msg_welcome',
          sender: 'bot',
          text: config.greetingMessage || 'Hi there! How can I help today?',
          time: 'Just now',
        },
      ]);
    }
  }, [isOpen, config, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isOpeningSkeleton]);

  const handleSend = async (queryText?: string) => {
    const text = (typeof queryText === 'string' ? queryText : inputValue).trim().slice(0, 250);
    if (!text || isLoading) return;

    const userMsg: MessageItem = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      time: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await api.sendMessage(sessionId, text);

      if (res.cartAction && config.eventBridgeEnabled) {
        requestAddToCart(res.cartAction.productId, res.cartAction.quantity);
      }

      const botMsg: MessageItem = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        products: res.products,
        thoughts: res.thoughts,
        time: 'Just now',
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      let errorMsg = 'Sorry, I ran into an error. Please try again.';
      if (err?.message?.includes('revoked') || err?.message?.includes('Invalid') || err?.message?.includes('Unauthorized')) {
        errorMsg = 'This assistant is currently offline. Please contact the website administrator.';
      } else if (err?.message?.includes('limit') || err?.message?.includes('quota') || err?.message?.includes('429')) {
        errorMsg = 'Our live chat support is currently taking a short break. Please feel free to reach out to us directly via our Contact page or email!';
      } else if (err?.message) {
        errorMsg = err.message;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'bot',
          text: errorMsg,
          time: 'Just now',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = () => {
    api.createSession().then((newSess) => {
      setSessionId(newSess);
      try {
        localStorage.setItem('aiw_session_id', newSess);
      } catch {}
      setMessages([
        {
          id: `msg_welcome_${Date.now()}`,
          sender: 'bot',
          text: config.greetingMessage || 'Hi there! How can I help today?',
          time: 'Just now',
        },
      ]);
    }).catch(console.error);
  };

  const primaryColor = config.primaryColor || '#0f172a';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: isLeft ? 'auto' : '24px',
        left: isLeft ? '24px' : 'auto',
        zIndex: 999999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      <style>{`
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
        .mbot-skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: mbot-shimmer 1.4s infinite linear;
          border-radius: 12px;
        }
      `}</style>

      {/* Heavy, Ultra-Premium Enterprise Chat Window Above Launcher FAB */}
      {isOpen && (
        <div
          className={!isDragging ? (isClosing ? 'mbot-window-exit' : 'mbot-window-enter') : ''}
          style={{
            position: isMobile ? 'fixed' : 'absolute',
            top: isMobile ? '0' : 'auto',
            left: isMobile ? '0' : isLeft ? '0' : 'auto',
            right: isMobile ? '0' : isLeft ? 'auto' : '0',
            bottom: isMobile ? '0' : '72px',
            zIndex: 999999,
            width: isMobile ? '100vw' : '390px',
            maxWidth: isMobile ? '100vw' : 'calc(100vw - 32px)',
            height: isMobile ? '100dvh' : '580px',
            maxHeight: isMobile ? '100dvh' : 'calc(100vh - 120px)',
            backgroundColor: '#ffffff',
            borderRadius: isMobile ? '0px' : '24px',
            boxShadow: '0 30px 65px -12px rgba(15, 23, 42, 0.35), 0 14px 28px -6px rgba(15, 23, 42, 0.2), 0 0 0 1.5px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: isMobile ? 'none' : '1.5px solid #cbd5e1',
            transform: isMobile
              ? 'none'
              : (windowOffset.x !== 0 || windowOffset.y !== 0 ? `translate3d(${windowOffset.x}px, ${windowOffset.y}px, 0)` : 'none'),
            transition: isMobile ? 'none' : isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
          }}
        >
          {/* Header (Clean, Heavy, Enterprise-Grade Header) */}
          <div
            onMouseDown={(e: MouseEvent) => {
              if ((e.target as HTMLElement)?.closest('button')) return;
              if (isMobile) return;
              dragStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                startX: windowOffset.x,
                startY: windowOffset.y,
                target: 'window',
              };
              didDragRef.current = false;
              setIsDragging(true);
            }}
            onTouchStart={(e: TouchEvent) => {
              if ((e.target as HTMLElement)?.closest('button')) return;
              if (isMobile || !e.touches[0]) return;
              dragStartRef.current = {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY,
                startX: windowOffset.x,
                startY: windowOffset.y,
                target: 'window',
              };
              didDragRef.current = false;
              setIsDragging(true);
            }}
            style={{
              backgroundColor: '#ffffff',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: isMobile ? 'default' : isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              borderBottom: '1.5px solid #f1f5f9',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
            }}
            title="Click and drag to move chat window"
          >
            {/* Left: Mascot & Titles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <BotMascotSvg />

              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.2px' }}>
                  {config.botName || 'Shop Assistant'}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginTop: '1px' }}>
                  The team can also help
                </span>
              </div>
            </div>

            {/* Right: Actions (Refresh & Close SVGs) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={handleResetSession}
                title="Restart chat"
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <RefreshSvg />
              </button>

              <button
                onClick={handleClose}
                title="Close chat"
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0f172a',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <CloseSvg />
              </button>
            </div>
          </div>

          {/* Skeleton Shimmer Loading State (~380ms) */}
          {isOpeningSkeleton ? (
            <div style={{ flex: '1 1 0%', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="mbot-skeleton" style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="mbot-skeleton" style={{ width: '75%', height: '44px', borderRadius: '16px' }} />
                  <div className="mbot-skeleton" style={{ width: '40%', height: '14px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
                <div className="mbot-skeleton" style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="mbot-skeleton" style={{ width: '60%', height: '36px', borderRadius: '16px' }} />
                </div>
              </div>
            </div>
          ) : (
            /* Messages Body */
            <div
              style={{
                flex: '1 1 0%',
                minHeight: 0,
                maxHeight: '100%',
                padding: '20px 18px',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorY: 'contain',
                touchAction: 'pan-y',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Message Feed */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* AI Reasoning Accordion */}
                  {msg.sender === 'bot' && msg.thoughts && msg.thoughts.length > 0 && (
                    <details
                      style={{
                        marginBottom: '8px',
                        fontSize: '11px',
                        color: '#475569',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '6px 12px',
                        maxWidth: '92%',
                        lineHeight: '1.4',
                      }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontWeight: '600',
                          outline: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          userSelect: 'none',
                          color: '#334155',
                        }}
                      >
                        <BrainSvg /> AI Reasoning ({msg.thoughts.length} steps)
                      </summary>
                      <div
                        style={{
                          marginTop: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          borderTop: '1px solid #e2e8f0',
                          paddingTop: '6px',
                        }}
                      >
                        {msg.thoughts.map((t, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                            <span>{t}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Text Bubble */}
                  <div
                    style={{
                      backgroundColor: msg.sender === 'user' ? primaryColor : '#f1f5f9',
                      color: msg.sender === 'user' ? '#ffffff' : '#0f172a',
                      padding: '14px 18px',
                      borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                      maxWidth: '85%',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      boxShadow: msg.sender === 'user' ? '0 4px 14px rgba(0,0,0,0.15)' : 'none',
                      fontSize: '14.5px',
                      lineHeight: '1.5',
                      fontWeight: '450',
                      border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                    }}
                  >
                    {renderMarkdownText(msg.text)}
                  </div>

                  {/* Subtitle / Timestamp under Bot Bubble */}
                  {msg.sender === 'bot' && (
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px', paddingLeft: '4px' }}>
                      {config.botName || 'Shop Assistant'} • AI Agent • {msg.time}
                    </span>
                  )}
                  {msg.sender === 'user' && (
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', paddingRight: '4px' }}>
                      {msg.time}
                    </span>
                  )}
                </div>
              ))}

              {/* Quick Starter Suggestion Chips (Rendered on initial chat) */}
              {messages.length <= 1 && !isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', maxWidth: '100%' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', paddingLeft: '2px' }}>
                    Suggested Questions
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      { label: '💼 View Projects', query: 'Show me your portfolio projects' },
                      { label: '🛠️ Our Services', query: 'What services do you provide?' },
                      { label: '📩 Contact Info', query: 'How can I contact you?' },
                    ].map((chip, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSend(chip.query)}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '16px',
                          padding: '8px 14px',
                          fontSize: '12.5px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: '0 2px 4px rgba(15, 23, 42, 0.05)',
                          userSelect: 'none',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc';
                          (e.currentTarget as HTMLElement).style.borderColor = '#0f172a';
                          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 10px rgba(15, 23, 42, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff';
                          (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
                          (e.currentTarget as HTMLElement).style.transform = 'none';
                          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 4px rgba(15, 23, 42, 0.05)';
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Real-time AI Thinking Stage Badge */}
              {isLoading && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: '#334155',
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    padding: '8px 14px',
                    borderRadius: '16px',
                    maxWidth: '90%',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <BrainSvg />
                  <span style={{ fontWeight: '600', color: '#0f172a' }}>
                    {thinkingPhase === 0 && 'Analyzing intent & language...'}
                    {thinkingPhase === 1 && 'Querying knowledge base...'}
                    {thinkingPhase === 2 && 'Generating verified response...'}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Heavy Footer Input Bar with SVG Send Button */}
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: '#ffffff',
              borderTop: '1.5px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '30px',
                padding: '4px 6px 4px 16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              }}
            >
              <input
                type="text"
                placeholder="Ask about projects, services, or anything..."
                value={inputValue}
                maxLength={250}
                onInput={(e: any) => setInputValue((e.target.value || '').slice(0, 250))}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#0f172a',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              {inputValue.length >= 200 && (
                <span style={{ fontSize: '10.5px', color: inputValue.length >= 240 ? '#ef4444' : '#64748b', fontWeight: '600', paddingRight: '4px' }}>
                  {inputValue.length}/250
                </span>
              )}

              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                title="Send message"
                style={{
                  backgroundColor: inputValue.trim() ? '#00684a' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: inputValue.trim() && !isLoading ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <SendSvg />
              </button>
            </form>

            {/* Subtle Clean Watermark */}
            {!config.hideBranding && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '10.5px',
                  color: '#94a3b8',
                  letterSpacing: '0.2px',
                  marginTop: '2px',
                }}
              >
                Powered by <strong style={{ color: '#64748b', fontWeight: '600' }}>Labto AI</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Circular Launcher FAB (Always visible, morphs to Down Arrow when open) */}
      <button
        onMouseDown={(e: MouseEvent) => {
          dragStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            startX: launcherOffset.x,
            startY: launcherOffset.y,
            target: 'launcher',
          };
          didDragRef.current = false;
          setIsDragging(true);
        }}
        onTouchStart={(e: TouchEvent) => {
          if (!e.touches[0]) return;
          dragStartRef.current = {
            clientX: e.touches[0].clientX,
            clientY: e.touches[0].clientY,
            startX: launcherOffset.x,
            startY: launcherOffset.y,
            target: 'launcher',
          };
          didDragRef.current = false;
          setIsDragging(true);
        }}
        onClick={() => {
          if (!didDragRef.current) {
            if (isOpen) {
              handleClose();
            } else {
              handleOpen();
            }
          }
        }}
        title={isOpen ? 'Close chat' : 'Open AI Assistant'}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: isOpen ? '#00684a' : primaryColor,
          color: '#ffffff',
          border: '2px solid rgba(255, 255, 255, 0.25)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.38), 0 6px 16px -2px rgba(0, 0, 0, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          userSelect: 'none',
          transform: (launcherOffset.x !== 0 || launcherOffset.y !== 0 ? `translate3d(${launcherOffset.x}px, ${launcherOffset.y}px, 0)` : 'none'),
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* Glowing Active Status Beacon (When closed) */}
        {!isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '14px',
              height: '14px',
              backgroundColor: '#10b981',
              borderRadius: '50%',
              border: '2.5px solid #ffffff',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.85)',
            }}
          />
        )}

        {isOpen ? (
          <ChevronDownSvg />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
