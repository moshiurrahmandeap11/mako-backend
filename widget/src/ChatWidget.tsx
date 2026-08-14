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
  imageUrl?: string;
  products?: ProductCard[];
  time: string;
}

function renderMarkdownText(text: string) {
  if (!text) return null;

  // Simple Markdown Parser for Links [text](url) and Bold **text**
  const parts = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Link [text](url)
      parts.push(
        <a
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: '600' }}
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      // Bold **text**
      parts.push(<strong style={{ fontWeight: '700' }}>{match[3]}</strong>);
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
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  const [config, setConfig] = useState<WidgetConfig>({
    primaryColor: '#111111',
    greetingMessage: 'Hi! How can I help you shop today?',
    botName: 'Shop Assistant',
    position: 'bottom-right',
    addToCartEnabled: true,
    hideBranding: false,
    eventBridgeEnabled: false,
  });
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resize listener for mobile viewport
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // 1. Fetch Config
    api.getConfig().then(setConfig).catch(console.error);

    // 2. Manage Visitor SessionId & Restore History (localStorage for persistence across refresh)
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

    // 3. Persistent Visitor Tracking & Ping Backend
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

  // Initialize initial greeting message once opened if no prior messages exist
  useEffect(() => {
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
  }, [isOpen, config, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleImageFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be smaller than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e?: Event) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();
    const imageToAttach = selectedImage;

    if ((!text && !imageToAttach) || isLoading) return;

    const userMsg: MessageItem = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      imageUrl: imageToAttach || undefined,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const res = await api.sendMessage(sessionId, text, undefined, undefined, imageToAttach || undefined);

      // Handle AI returned cart action
      if (res.cartAction && config.eventBridgeEnabled) {
        requestAddToCart(res.cartAction.productId, res.cartAction.quantity);
      }

      const botMsg: MessageItem = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        products: res.products,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      let errorMsg = 'Sorry, I ran into an error. Please try again.';
      if (err?.message?.includes('revoked') || err?.message?.includes('Invalid') || err?.message?.includes('Unauthorized')) {
        errorMsg = 'This chatbot is currently offline or its API key has been revoked. Please contact the website administrator.';
      } else if (err?.message) {
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
    } finally {
      setIsLoading(false);
    }
  };

  const isLeft = config.position === 'bottom-left';
  const primaryColor = config.primaryColor || '#111111';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: isLeft ? 'auto' : '24px',
        left: isLeft ? '24px' : 'auto',
        zIndex: 999999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Floating Chat Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
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
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Chat with AI</span>
        </button>
      )}

      {/* Expandable Chat Window */}
      {isOpen && (
        <div
          style={{
            position: isMobile ? 'fixed' : 'relative',
            top: isMobile ? '0' : 'auto',
            left: isMobile ? '0' : 'auto',
            right: isMobile ? '0' : 'auto',
            bottom: isMobile ? '0' : 'auto',
            zIndex: 999999,
            width: isMobile ? '100vw' : '380px',
            maxWidth: isMobile ? '100vw' : 'calc(100vw - 32px)',
            height: isMobile ? '100dvh' : '560px',
            maxHeight: isMobile ? '100dvh' : 'calc(100vh - 48px)',
            backgroundColor: '#ffffff',
            borderRadius: isMobile ? '0px' : '16px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: isMobile ? 'none' : '1px solid #e5e7eb',
          }}
        >
          {/* Header */}
          <div
            style={{
              backgroundColor: primaryColor,
              color: '#ffffff',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                }}
              />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{config.botName}</h3>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>Online • Labto AI Assistant</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '20px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages Body */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              touchAction: 'pan-y',
              backgroundColor: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {/* User Uploaded Image Preview in Bubble */}
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Attached input"
                    style={{
                      maxWidth: '180px',
                      maxHeight: '140px',
                      borderRadius: '12px',
                      marginBottom: '6px',
                      objectFit: 'cover',
                      border: '1px solid #e5e7eb',
                    }}
                  />
                )}

                {msg.text && (
                  <div
                    style={{
                      maxWidth: '85%',
                      backgroundColor: msg.sender === 'user' ? primaryColor : '#ffffff',
                      color: msg.sender === 'user' ? '#ffffff' : '#1f2937',
                      padding: '12px 16px',
                      borderRadius: msg.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      fontSize: '14px',
                      lineHeight: '1.45',
                      boxShadow: msg.sender === 'bot' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderMarkdownText(msg.text)}
                  </div>
                )}

                {/* Product Cards Carousel / Grid */}
                {msg.products && msg.products.length > 0 && (
                  <div
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {msg.products.map((prod) => (
                      <div
                        key={prod.id}
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          padding: '12px',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        }}
                      >
                        {prod.imageUrl ? (
                          <img
                            src={prod.imageUrl}
                            alt={prod.title}
                            style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '8px',
                              backgroundColor: '#e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '20px',
                            }}
                          >
                            🛍️
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '13px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: '#111827',
                            }}
                          >
                            {prod.title}
                          </h4>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: primaryColor }}>
                            {prod.currency === 'USD' ? '$' : ''}
                            {prod.price} {prod.currency !== 'USD' ? prod.currency : ''}
                          </span>

                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            <a
                              href={prod.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                textDecoration: 'none',
                                color: '#374151',
                                fontWeight: '500',
                              }}
                            >
                              View Page
                            </a>
                            {config.addToCartEnabled && (
                              <button
                                onClick={() => requestAddToCart(prod.id, 1)}
                                style={{
                                  fontSize: '11px',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: primaryColor,
                                  color: '#ffffff',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                }}
                              >
                                + Add to Cart
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <span style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>{msg.time}</span>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '12px' }}>
                <span style={{ fontSize: '14px' }}>🤖</span> Analyzing request & catalog...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Selected Image Attachment Thumbnail Badge */}
          {selectedImage && (
            <div style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={selectedImage} alt="Attachment" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
              <span style={{ fontSize: '12px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Photo attached</span>
              <button onClick={() => setSelectedImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}>✕</button>
            </div>
          )}

          {/* Footer Input */}
          <form
            onSubmit={handleSend}
            style={{
              padding: '12px 16px',
              backgroundColor: '#ffffff',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageFileChange}
              style={{ display: 'none' }}
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo / image"
              style={{
                background: 'none',
                border: '1px solid #d1d5db',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              📷
            </button>

            <input
              type="text"
              placeholder="Ask products or attach photo..."
              value={inputValue}
              onInput={(e: any) => setInputValue(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '24px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#111827',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={(!inputValue.trim() && !selectedImage) || isLoading}
              style={{
                backgroundColor: primaryColor,
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (inputValue.trim() || selectedImage) ? 'pointer' : 'default',
                opacity: (inputValue.trim() || selectedImage) ? 1 : 0.5,
              }}
            >
              ➔
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
