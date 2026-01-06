import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { useNotificationStore, AppNotification, NotificationType } from '../stores/notificationStore';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function BrainFlashIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="brain" size={size} color={color} />;
}

function SyncIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="sync-outline" size={size} color={color} />;
}

function TrophyIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="trophy-outline" size={size} color={color} />;
}

function RunnerIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="run" size={size} color={color} />;
}

function BellOffIcon({ size = 64, color = 'rgba(235, 235, 245, 0.3)' }: { size?: number; color?: string }) {
    return <Ionicons name="notifications-off-outline" size={size} color={color} />;
}

// Filter types
type FilterType = 'all' | 'insights' | 'workouts' | 'system';

// Display notification type (maps from API types)
type DisplayType = 'insight' | 'workout' | 'achievement' | 'reminder';

// Map backend types to display types
function mapNotificationType(type: NotificationType): DisplayType {
    switch (type) {
        case 'recovery_analysis':
            return 'insight';
        case 'workout_sync':
            return 'workout';
        case 'achievement':
            return 'achievement';
        case 'reminder':
        case 'system':
        default:
            return 'reminder';
    }
}

// Format relative time
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays === 1) return 'Ontem';
    return `${diffDays} dias atrás`;
}

export function NotificationsScreen({ navigation }: any) {
    const [activeFilter, setActiveFilter] = React.useState<FilterType>('all');
    const { notifications, isLoading, fetchNotifications, markAsRead } = useNotificationStore();

    useEffect(() => {
        fetchNotifications();
    }, []);

    const filters: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'Todas' },
        { key: 'insights', label: 'IA Insights' },
        { key: 'workouts', label: 'Treinos' },
        { key: 'system', label: 'Sistema' },
    ];

    const getFilteredNotifications = () => {
        const mapped = notifications.map(n => ({
            ...n,
            displayType: mapNotificationType(n.type),
        }));

        switch (activeFilter) {
            case 'insights':
                return mapped.filter(n => n.displayType === 'insight');
            case 'workouts':
                return mapped.filter(n => n.displayType === 'workout');
            case 'system':
                return mapped.filter(n => n.displayType === 'achievement' || n.displayType === 'reminder');
            default:
                return mapped;
        }
    };

    const getNotificationIcon = (type: DisplayType) => {
        switch (type) {
            case 'insight':
                return <BrainFlashIcon size={24} color="#00D4FF" />;
            case 'workout':
                return <SyncIcon size={24} color="rgba(235, 235, 245, 0.6)" />;
            case 'achievement':
                return <TrophyIcon size={24} color="rgba(235, 235, 245, 0.6)" />;
            case 'reminder':
                return <RunnerIcon size={24} color="rgba(235, 235, 245, 0.6)" />;
        }
    };

    const handleNotificationPress = (notification: AppNotification & { displayType: DisplayType }) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        if (notification.metadata?.screen) {
            if (notification.type === 'reminder' || notification.type === 'system' || notification.type === 'achievement') {
                navigation.navigate(notification.metadata.screen as string);
            }

            if (notification.type === 'workout_sync' && notification.metadata.feedbackId) {
                navigation.navigate(notification.metadata.screen as string, {
                    feedbackId: notification.metadata.feedbackId,
                });
            }
        }
    };

    const filteredNotifications = getFilteredNotifications();

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <BackIcon size={24} color="#EBEBF5" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notificações</Text>
                <View style={styles.headerPlaceholder} />
            </View>

            {/* Filter Tabs */}
            <View style={styles.filtersContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filtersContent}
                >
                    {filters.map((filter) => (
                        <TouchableOpacity
                            key={filter.key}
                            style={[
                                styles.filterButton,
                                activeFilter === filter.key && styles.filterButtonActive
                            ]}
                            onPress={() => setActiveFilter(filter.key)}
                        >
                            <Text style={[
                                styles.filterText,
                                activeFilter === filter.key && styles.filterTextActive
                            ]}>
                                {filter.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Loading State */}
            {isLoading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            )}

            {/* Empty State */}
            {!isLoading && filteredNotifications.length === 0 && (
                <View style={styles.emptyContainer}>
                    <BellOffIcon size={64} color="rgba(235, 235, 245, 0.3)" />
                    <Text style={styles.emptyText}>Nenhuma notificação</Text>
                    <Text style={styles.emptySubtext}>
                        Suas notificações aparecerão aqui
                    </Text>
                </View>
            )}

            {/* Notifications List */}
            {!isLoading && filteredNotifications.length > 0 && (
                <ScrollView
                    style={styles.notificationsList}
                    contentContainerStyle={styles.notificationsContent}
                    showsVerticalScrollIndicator={false}
                >
                    {filteredNotifications.map((notification) => (
                        <TouchableOpacity
                            key={notification.id}
                            style={[
                                styles.notificationCard,
                                notification.displayType === 'insight' && styles.notificationCardInsight
                            ]}
                            activeOpacity={notification.type === 'recovery_analysis' ? 1 : 0.7}
                            onPress={() => handleNotificationPress(notification)}
                        >
                            <View style={[
                                styles.iconContainer,
                                notification.displayType === 'insight' && styles.iconContainerInsight
                            ]}>
                                {getNotificationIcon(notification.displayType)}
                            </View>
                            <View style={styles.notificationContent}>
                                <View style={styles.notificationHeader}>
                                    <Text style={styles.notificationTitle}>
                                        {notification.title}
                                    </Text>
                                    {!notification.is_read && (
                                        <View style={styles.newIndicator} />
                                    )}
                                </View>
                                <Text style={styles.notificationDescription}>
                                    {notification.description}
                                </Text>
                                <Text style={[
                                    styles.notificationTime,
                                    notification.displayType === 'insight' && styles.notificationTimeInsight
                                ]}>
                                    {formatRelativeTime(notification.created_at)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}

                    {/* Bottom padding for BottomBar clearance */}
                    <View style={styles.bottomSpacer} />
                </ScrollView>
            )}
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#EBEBF5',
    },
    headerPlaceholder: {
        width: 40,
    },

    // Filter Tabs
    filtersContainer: {
        paddingBottom: spacing.md,
    },
    filtersContent: {
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
    },
    filterButton: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: 20,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.2)',
        marginRight: spacing.sm,
    },
    filterButtonActive: {
        backgroundColor: '#00D4FF',
        borderColor: '#00D4FF',
    },
    filterText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.medium as any,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    filterTextActive: {
        color: '#0A0A18',
        fontWeight: typography.fontWeights.bold as any,
    },

    // Notifications List
    notificationsList: {
        flex: 1,
    },
    notificationsContent: {
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
    },

    // Notification Card
    notificationCard: {
        flexDirection: 'row',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.1)',
    },
    notificationCardInsight: {
        borderWidth: 1,
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.05)',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainerInsight: {
        backgroundColor: 'rgba(0, 212, 255, 0.2)',
    },
    notificationContent: {
        flex: 1,
        gap: spacing.xs,
    },
    notificationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    notificationTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    newIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#00D4FF',
    },
    notificationDescription: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 20,
    },
    notificationTime: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.4)',
        marginTop: spacing.xs,
    },
    notificationTimeInsight: {
        color: '#00D4FF',
    },

    // Loading and empty states
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
    },
    emptyText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#EBEBF5',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    emptySubtext: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
    },
    bottomSpacer: {
        height: 120,
    },
});
