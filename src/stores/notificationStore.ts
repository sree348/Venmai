import create from 'zustand';
import { devtools } from 'zustand/middleware';

export interface Notification {
  id: string;
  title: string;
  body: string;
  priority: 'critical' | 'warning' | 'info' | 'opportunity';
  campaignName: string;
  metric: string;
  currentValue: number;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  setUnread: (count: number) => void;
  setNotifications: (list: Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(set => ({
    unreadCount: 0,
    notifications: [],
    setUnread: count => set({ unreadCount: count }),
    setNotifications: list => set({ notifications: list, unreadCount: list.filter(n => !n.read).length }),
    markRead: id => set(state => {
      const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n);
      return { notifications: updated, unreadCount: updated.filter(n => !n.read).length };
    }),
    markAllRead: () => set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  }))
);
