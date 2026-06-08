import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  widget?: any;
  insight?: string;
  createdAt?: string;
}

export interface PageContext {
  page: string;
  data?: any;
}

interface AgentState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  pageContext: PageContext | null;
  toggle: () => void;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setPageContext: (ctx: PageContext) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useAgentStore = create<AgentState>()(
  devtools((set) => ({
    isOpen: false,
    messages: [
      {
        role: 'assistant',
        content: "Hi! I'm AI Brain, your personal marketing co-pilot. I can see the page you're currently viewing and answer questions about the active campaign data on your screen.\n\nAsk me anything!",
        createdAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
    pageContext: null,
    toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    updateMessage: (id, updates) => set((state) => ({
      messages: state.messages.map(message =>
        message.id === id ? { ...message, ...updates } : message
      ),
    })),
    clearMessages: () => set({ messages: [] }),
    setPageContext: (ctx) => set({ pageContext: ctx }),
    setIsLoading: (loading) => set({ isLoading: loading }),
  }))
);
