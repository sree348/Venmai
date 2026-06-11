import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Check, ClipboardPaste, Copy, Sparkles, Send, X, Trash2, Cpu } from 'lucide-react';
import { useAgentStore, ChatMessage } from '../../stores/agentStore';
import { useApp } from '../context/AppContext';
import { apiService } from '../../services/api.service';
import { toast } from 'sonner';

// Map system page context keys to friendly header names
const PAGE_NAME_MAPPINGS: Record<string, string> = {
  agency_overview: 'Agency Overview',
  campaigns: 'Campaigns',
  ai_brain: 'AI Brain',
  analytics: 'Analytics',
  ai_analysis: 'AI Analysis',
  clients: 'Clients',
  integrations: 'Integrations',
  data: 'Data Sources',
  reports: 'Reports',
  settings: 'Settings',
  team: 'Team',
  notifications: 'Notifications',
};

// Map system page context keys to their respective chips
const getChipsForPage = (page: string | undefined): string[] => {
  switch (page) {
    case 'agency_overview':
      return ["Summarize performance", "Show budget at risk", "Which client needs attention?", "Generate client report"];
    case 'campaigns':
      return ["Which campaign wastes budget?", "Worst CPC campaign?", "Any anomalies this week?", "New campaign idea for Q3"];
    case 'ai_brain':
      return ["Biggest risk today?", "What should I scale?", "Detect anomalies in my data", "Forecast next week's spend"];
    case 'analytics':
      return ["Compare platforms", "This month vs last month?", "What is a good CPL?", "Explain ROAS in simple terms"];
    case 'ai_analysis':
      return ["Top 5 campaigns by spend", "Worst CPC?", "Zero conversion campaigns?", "Funnel strategy for new launch"];
    default:
      return ["Summarize performance", "Any anomalies detected?", "What is a good CPL?", "New campaign funnel idea"];
  }
};

const getPageKeyFromPath = (path: string) => {
  switch (path) {
    case '/dashboard':
      return 'agency_overview';
    case '/campaigns':
      return 'campaigns';
    case '/brain':
      return 'ai_brain';
    case '/analytics':
      return 'analytics';
    case '/ai-analysis':
      return 'ai_analysis';
    default:
      return path.substring(1) || 'general';
  }
};

export default function FloatingAIAgent() {
  const { 
    isOpen, 
    messages, 
    isLoading, 
    pageContext, 
    toggle, 
    addMessage, 
    updateMessage,
    clearMessages, 
    setIsLoading,
    setPageContext
  } = useAgentStore();

  const { activeClient } = useApp();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Master route pathname-to-pageContext synchronizer to guarantee the page is always correct
  useEffect(() => {
    const pageKey = getPageKeyFromPath(location.pathname);

    const richPages = ['agency_overview', 'campaigns', 'ai_brain', 'analytics', 'ai_analysis', 'dashboards', 'clients'];
    if (pageContext?.page !== pageKey) {
      if (!richPages.includes(pageKey)) {
        setPageContext({
          page: pageKey,
          data: {}
        });
      }
    }
  }, [location.pathname, pageContext?.page, setPageContext]);

  // Auto-scroll to bottom of chat when messages change or panel opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // If on login, do not render anything
  if (location.pathname === '/login') {
    return null;
  }

  const clientId = activeClient?.id || 'agency';
  const pageFriendlyName = pageContext?.page ? (PAGE_NAME_MAPPINGS[pageContext.page] || pageContext.page) : 'General';
  const quickChips = getChipsForPage(pageContext?.page);

  const copyMessageToClipboard = async (content: string, index: number) => {
    if (!content?.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setCopiedMessageIndex(index);
      toast.success('Copied to clipboard');
      window.setTimeout(() => setCopiedMessageIndex(current => current === index ? null : current), 1800);
    } catch (error) {
      console.error('Failed to copy AI Agent message:', error);
      toast.error('Could not copy this message.');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error('Clipboard paste is not available in this browser.');
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        toast.info('Clipboard is empty.');
        return;
      }

      setInput(current => current.trim() ? `${current}\n${clipboardText}` : clipboardText);
      toast.success('Pasted from clipboard');
    } catch (error) {
      console.error('Failed to paste into AI Agent input:', error);
      toast.error('Allow clipboard access to paste here.');
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    // 1. Add user message to store
    const userMsg: ChatMessage = {
      role: 'user',
      content: textToSend.trim(),
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInput('');
    setIsLoading(true);

    try {
      // 2. Format chat history for backend (taking last 15 turns)
      const historyPayload = messages
        .filter(m => m.role !== 'system')
        .slice(-15)
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      const botMessageId = `assistant-${Date.now()}`;
      let streamedContent = '';
      let finalPayload: any = null;

      const botMsg: ChatMessage = {
        id: botMessageId,
        role: 'assistant',
        content: '',
        widget: null,
        createdAt: new Date().toISOString(),
      };
      addMessage(botMsg);

      const activePageContext = pageContext || {
        page: getPageKeyFromPath(location.pathname),
        data: {},
      };

      await apiService.streamChat(textToSend.trim(), clientId, historyPayload, activePageContext, {
        onToken: (token) => {
          streamedContent += token;
          updateMessage(botMessageId, { content: streamedContent });
        },
        onDone: (payload) => {
          finalPayload = payload;
          updateMessage(botMessageId, {
            content: payload.insight || streamedContent || payload.widget?.insight || 'I analyzed the data, but no response details were computed.',
            widget: payload.widget || null,
          });
        },
        onError: (error) => {
          throw error;
        },
      });

      if (!finalPayload && !streamedContent) {
        updateMessage(botMessageId, {
          content: 'I analyzed the data, but no response details were computed.',
        });
      }
    } catch (err: any) {
      console.error('Failed to get AI Agent response:', err);
      const errorMessage = err?.message || 'Unknown AI Agent error';
      toast.error(`AI assistant failed: ${errorMessage}`);
      addMessage({
        role: 'assistant',
        content: `Sorry, I encountered an issue analyzing this screen context.\n\n${errorMessage}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const handleClearChat = () => {
    clearMessages();
    addMessage({
      role: 'assistant',
      content: `Chat history cleared. I'm connected to the **${pageFriendlyName}** page context and ready to help.`,
      createdAt: new Date().toISOString(),
    });
    toast.success('Chat history cleared.');
  };

  return (
    <>
      {/* Floating Sparkle Toggle Button */}
      <motion.button
        drag
        dragConstraints={{
          left: typeof window !== 'undefined' ? -window.innerWidth + 84 : -1000,
          right: 24,
          top: typeof window !== 'undefined' ? -window.innerHeight + 84 : -800,
          bottom: 24
        }}
        dragElastic={0.1}
        dragMomentum={false}
        onClick={toggle}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-[24px] right-[24px] w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white shadow-[0_4px_20px_rgba(99,102,241,0.4)] z-[9999] cursor-pointer border-0 select-none outline-none touch-none"
        title="Ask AI Brain"
      >
        <Sparkles className="w-[26px] h-[26px] text-white animate-pulse" />
      </motion.button>

      {/* Spring Animated Chat Popup Dialog */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{
              left: typeof window !== 'undefined' ? -window.innerWidth + 424 : -1000,
              right: 24,
              top: typeof window !== 'undefined' ? -window.innerHeight + 620 : -800,
              bottom: 24
            }}
            dragElastic={0.05}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.8, x: 80, y: 80 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 80, y: 80 }}
            transition={{ type: 'spring', damping: 25, stiffness: 260 }}
            style={{ originX: 1, originY: 1 }}
            className="fixed bottom-[96px] right-[24px] w-[400px] h-[560px] bg-white border border-slate-200 rounded-[16px] z-[9999] shadow-[0_12px_40px_rgba(15,23,42,0.15)] flex flex-col overflow-hidden select-none"
          >
            {/* Header section with Indigo Gradient */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-4 py-3.5 flex items-center justify-between text-white flex-shrink-0 shadow-sm cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="size-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm leading-tight tracking-wide">AI Brain</h3>
                  <p className="text-[10px] text-white/80 font-semibold tracking-wider uppercase mt-0.5">
                    Viewing: {pageFriendlyName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleClearChat}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/95 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
                  title="Clear chat history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggle}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/95 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
                  title="Close popup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Chips Section (re-evaluate per page context) */}
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-none">
              {quickChips.map((chip, index) => (
                <button
                  key={index}
                  onClick={() => handleSendMessage(chip)}
                  disabled={isLoading}
                  className="px-3 py-1 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-full text-[10px] font-bold text-slate-700 whitespace-nowrap cursor-pointer transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed select-none"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Scrollable Message Box */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/20 scrollbar-thin">
              {messages.map((msg, index) => {
                const isAi = msg.role === 'assistant';
                return (
                  <div key={index} className={`flex items-start gap-2 ${isAi ? '' : 'justify-end'}`}>
                    {isAi && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`flex flex-col gap-1.5 max-w-[80%] ${isAi ? 'items-start' : 'items-end'}`}>
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm w-full whitespace-pre-wrap select-text selection:bg-indigo-200 ${
                          isAi
                            ? 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-sm'
                            : 'bg-[#6366F1] text-white rounded-tr-sm'
                        }`}
                      >
                        {isAi ? (
                          msg.content ? (
                            msg.content
                          ) : (
                            <span className="text-slate-400">Thinking...</span>
                          )
                        ) : msg.content}
                      </div>
                      {isAi && msg.content && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyMessageToClipboard(msg.content, index)}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-slate-200 bg-white text-[9px] font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors select-none"
                            aria-label="Copy AI Brain response"
                          >
                            {copiedMessageIndex === index ? (
                              <>
                                <Check className="size-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="size-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator bubble */}
              {isLoading && (
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white flex-shrink-0 shadow-sm animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="px-3.5 py-2.5 bg-white border border-slate-200/80 text-slate-500 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Text Input Panel */}
            <div className="p-3 border-t border-slate-150 bg-white flex items-end gap-2 flex-shrink-0">
              <textarea
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this page... (Ctrl+Enter)"
                className="flex-1 min-w-0 resize-none max-h-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#6366F1] focus:bg-white transition-all placeholder-slate-400 font-sans"
              />
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="size-8 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center hover:border-[#6366F1]/40 hover:bg-indigo-50 hover:text-[#6366F1] active:scale-95 transition-all cursor-pointer flex-shrink-0"
                aria-label="Paste from clipboard"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="size-8 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed border-0 cursor-pointer flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
