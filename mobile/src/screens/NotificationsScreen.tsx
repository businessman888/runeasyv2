import React, { useEffect, useCallback, memo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useNotificationStore, AppNotification, NotificationType } from '../stores/notificationStore';
import { ScreenContainer } from '../components/ScreenContainer';
import { useBreakpoint } from '../hooks/useBreakpoint';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = semanticColors.textPrimary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function BrainFlashIcon({ size = 24, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <MaterialCommunityIcons name="brain" size={size} color={color} />;
}

function SyncIcon({ size = 24, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="sync-outline" size={size} color={color} />;
}

function TrophyIcon({ size = 24, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="trophy-outline" size={size} color={color} />;
}

function RunnerIcon({ size = 24, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <MaterialCommunityIcons name="run" size={size} color={color} />;
}

function BellOffIcon({ size = 64, color = semanticColors.textTertiary }: { size?: number; color?: string }) {
    useThemeSubscription();
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
        // Fase 2B: o insight semanal entra no mesmo card destacado e no filtro
        // "insights" — é conteúdo analítico, irmão da retrospectiva.
        case 'weekly_insight':
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

type DisplayNotification = AppNotification & { displayType: DisplayType };

function getNotificationIcon(type: DisplayType) {
    switch (type) {
        case 'insight':
            return <BrainFlashIcon size={24} color={semanticColors.accent} />;
        case 'workout':
            return <SyncIcon size={24} color={semanticColors.textSecondary} />;
        case 'achievement':
            return <TrophyIcon size={24} color={semanticColors.textSecondary} />;
        case 'reminder':
            return <RunnerIcon size={24} color={semanticColors.textSecondary} />;
    }
}

// Memoized row so FlatList only re-renders changed items.
const NotificationCard = memo(function NotificationCard({
    notification,
    onPress,
}: {
    notification: DisplayNotification;
    onPress: (n: DisplayNotification) => void;
}) {
    useThemeSubscription();
    return (
        <TouchableOpacity
            style={[
                styles.notificationCard,
                notification.displayType === 'insight' && styles.notificationCardInsight,
            ]}
            activeOpacity={notification.type === 'recovery_analysis' ? 1 : 0.7}
            onPress={() => onPress(notification)}
        >
            <View style={[
                styles.iconContainer,
                notification.displayType === 'insight' && styles.iconContainerInsight,
            ]}>
                {getNotificationIcon(notification.displayType)}
            </View>
            <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    {!notification.is_read && <View style={styles.newIndicator} />}
                </View>
                <Text style={styles.notificationDescription}>{notification.description}</Text>
                <Text style={[
                    styles.notificationTime,
                    notification.displayType === 'insight' && styles.notificationTimeInsight,
                ]}>
                    {formatRelativeTime(notification.created_at)}
                </Text>
            </View>
        </TouchableOpacity>
    );
});

export function NotificationsScreen({ navigation }: any) {
    useThemeSubscription();
    // Tablet: lista em 2 colunas (FlatList numColumns). Phone: 1 coluna (idêntico).
    const { isTablet } = useBreakpoint();
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

    const handleNotificationPress = useCallback((notification: DisplayNotification) => {
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
    }, [markAsRead, navigation]);

    const renderItem = useCallback(
        ({ item }: { item: DisplayNotification }) => (
            // Em 2 colunas (tablet) cada item ocupa metade; em 1 coluna o wrapper
            // é full-width (idêntico ao phone original).
            <View style={isTablet ? styles.gridItem : undefined}>
                <NotificationCard notification={item} onPress={handleNotificationPress} />
            </View>
        ),
        [handleNotificationPress, isTablet],
    );

    const filteredNotifications = getFilteredNotifications();

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <BackIcon size={24} color={semanticColors.textPrimary} />
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
                    <BellOffIcon size={64} color={semanticColors.textTertiary} />
                    <Text style={styles.emptyText}>Nenhuma notificação</Text>
                    <Text style={styles.emptySubtext}>
                        Suas notificações aparecerão aqui
                    </Text>
                </View>
            )}

            {/* Notifications List */}
            {!isLoading && filteredNotifications.length > 0 && (
                <FlatList
                    data={filteredNotifications}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    key={isTablet ? 'cols-2' : 'cols-1'}
                    numColumns={isTablet ? 2 : 1}
                    columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
                    style={styles.notificationsList}
                    contentContainerStyle={styles.notificationsContent}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={<View style={styles.bottomSpacer} />}
                    removeClippedSubviews
                    initialNumToRender={10}
                    windowSize={11}
                />
            )}
        </ScreenContainer>
    );
}

const styles = createThemeStyles(() => ({
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
        color: semanticColors.textPrimary,
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
        borderColor: semanticColors.borderStrong,
        marginRight: spacing.sm,
    },
    filterButtonActive: {
        backgroundColor: semanticColors.accent,
        borderColor: semanticColors.accent,
    },
    filterText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.medium as any,
        color: semanticColors.textSecondary,
    },
    filterTextActive: {
        color: semanticColors.textOnAccent,
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
    // Tablet: 2 colunas com respiro horizontal (phone nunca usa).
    columnWrapper: {
        gap: spacing.md,
    },
    gridItem: {
        flex: 1,
    },

    // Notification Card
    notificationCard: {
        flexDirection: 'row',
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        padding: spacing.lg,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    notificationCardInsight: {
        borderWidth: 1,
        borderColor: semanticColors.accent,
        backgroundColor: semanticColors.accentSubtle,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: semanticColors.glass,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainerInsight: {
        backgroundColor: semanticColors.accentSubtle,
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
        color: semanticColors.textPrimary,
    },
    newIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: semanticColors.accent,
    },
    notificationDescription: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        lineHeight: 20,
    },
    notificationTime: {
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
        marginTop: spacing.xs,
    },
    notificationTimeInsight: {
        color: semanticColors.accent,
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
        color: semanticColors.textPrimary,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    emptySubtext: {
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        textAlign: 'center',
    },
    bottomSpacer: {
        height: 120,
    },
}));
