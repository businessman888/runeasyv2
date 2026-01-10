import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Storage from '../utils/storage';

// Notification types matching backend
export type NotificationType = 'recovery_analysis' | 'workout_sync' | 'achievement' | 'reminder' | 'system';

export interface AppNotification {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    description: string;
    is_read: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
}

interface NotificationState {
    notifications: AppNotification[];
    unreadCount: number;
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchNotifications: () => Promise<void>;
    fetchUnreadCount: () => Promise<void>;
    markAsRead: (notificationId: string) => Promise<void>;
    clearNotifications: () => void;
}

// API URL helper - ensures /api suffix
const getApiUrl = () => {
    let baseUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!baseUrl) {
        if (Platform.OS === 'android') {
            baseUrl = 'http://10.0.2.2:3000';
        } else {
            baseUrl = 'http://localhost:3000';
        }
    }

    // Ensure /api suffix
    if (!baseUrl.endsWith('/api')) {
        baseUrl = `${baseUrl}/api`;
    }

    return baseUrl;
};

const API_URL = getApiUrl();

const getUserId = async () => {
    return await Storage.getItemAsync('user_id');
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,

    fetchNotifications: async () => {
        try {
            set({ isLoading: true, error: null });

            const userId = await getUserId();
            if (!userId) {
                set({ isLoading: false });
                return;
            }

            const response = await fetch(`${API_URL}/notifications`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            set({
                notifications: data.notifications || [],
                isLoading: false,
            });

            // Also update unread count
            get().fetchUnreadCount();
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            set({
                error: 'Falha ao carregar notificações',
                isLoading: false,
            });
        }
    },

    fetchUnreadCount: async () => {
        try {
            const userId = await getUserId();
            if (!userId) return;

            const response = await fetch(`${API_URL}/notifications/unread-count`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            set({ unreadCount: data.count || 0 });
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    },

    markAsRead: async (notificationId: string) => {
        try {
            const userId = await getUserId();
            if (!userId) return;

            await fetch(`${API_URL}/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                },
            });

            // Update local state
            set((state) => ({
                notifications: state.notifications.map((n) =>
                    n.id === notificationId ? { ...n, is_read: true } : n
                ),
                unreadCount: Math.max(0, state.unreadCount - 1),
            }));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    clearNotifications: () => {
        set({ notifications: [], unreadCount: 0, error: null });
    },
}));
