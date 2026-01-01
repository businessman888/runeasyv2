import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useNotificationStore, AppNotification, NotificationType } from '../stores/notificationStore';

// Back arrow icon
function BackIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>‹</Text>;
}

// Brain/Head Flash icon for IA Insights (Card 1)
function BrainFlashIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={Math.round(size * 1.15)} viewBox="0 0 20 23" fill="none">
                <path d="M11.2231 0C6.47308 0 2.72308 3.75 2.47308 8.375L0.0980762 11.5C-0.151924 11.875 0.0980763 12.5 0.598076 12.5H2.47308V16.25C2.47308 17.625 3.59808 18.75 4.97308 18.75H6.22308V22.5H14.9731V16.625C17.9731 15.25 19.9731 12.25 19.9731 8.75C19.9731 3.875 16.0981 0 11.2231 0ZM13.7231 7.5L9.84808 15L10.5981 10H8.09808L10.5981 3.75H13.7231L11.8481 7.5H13.7231Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🧠</Text>;
}

// Sync icon for workout sync (Card 2)
function SyncIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
                <path d="M2.5 10.0625C2.5 11 2.67709 11.9117 3.03125 12.7975C3.38542 13.6833 3.9375 14.5008 4.6875 15.25L5 15.5625V13.75C5 13.3958 5.12 13.0992 5.36 12.86C5.6 12.6208 5.89667 12.5008 6.25 12.5C6.60334 12.4992 6.90042 12.6192 7.14125 12.86C7.38209 13.1008 7.50167 13.3975 7.5 13.75V18.75C7.5 19.1042 7.38 19.4012 7.14 19.6412C6.9 19.8812 6.60334 20.0008 6.25 20H1.25C0.895838 20 0.599171 19.88 0.360004 19.64C0.120838 19.4 0.000837644 19.1033 4.31034e-06 18.75C-0.000829023 18.3967 0.119171 18.1 0.360004 17.86C0.600838 17.62 0.897504 17.5 1.25 17.5H3.4375L2.9375 17.0625C1.85417 16.1042 1.09375 15.0104 0.656254 13.7812C0.218754 12.5521 4.31034e-06 11.3125 4.31034e-06 10.0625C4.31034e-06 8.10417 0.500004 6.32792 1.5 4.73375C2.5 3.13958 3.84375 1.91583 5.53125 1.0625C5.82292 0.895833 6.13042 0.885416 6.45375 1.03125C6.77709 1.17708 6.99042 1.41667 7.09375 1.75C7.19792 2.0625 7.19292 2.375 7.07875 2.6875C6.96459 3 6.76125 3.23958 6.46875 3.40625C5.26042 4.07292 4.29709 4.995 3.57875 6.1725C2.86042 7.35 2.50084 8.64667 2.5 10.0625ZM17.5 9.9375C17.5 9 17.3229 8.08875 16.9688 7.20375C16.6146 6.31875 16.0625 5.50083 15.3125 4.75L15 4.4375V6.25C15 6.60417 14.88 6.90125 14.64 7.14125C14.4 7.38125 14.1033 7.50083 13.75 7.5C13.3967 7.49917 13.1 7.37917 12.86 7.14C12.62 6.90083 12.5 6.60417 12.5 6.25V1.25C12.5 0.895833 12.62 0.599167 12.86 0.36C13.1 0.120833 13.3967 0.000833333 13.75 0H18.75C19.1042 0 19.4013 0.12 19.6413 0.36C19.8813 0.6 20.0008 0.896667 20 1.25C19.9992 1.60333 19.8792 1.90042 19.64 2.14125C19.4008 2.38208 19.1042 2.50167 18.75 2.5H16.5625L17.0625 2.9375C18.0833 3.95833 18.8283 5.06792 19.2975 6.26625C19.7667 7.46458 20.0008 8.68833 20 9.9375C20 11.8958 19.5 13.6721 18.5 15.2662C17.5 16.8604 16.1563 18.0842 14.4688 18.9375C14.1771 19.1042 13.87 19.1146 13.5475 18.9688C13.225 18.8229 13.0113 18.5833 12.9063 18.25C12.8021 17.9375 12.8075 17.625 12.9225 17.3125C13.0375 17 13.2404 16.7604 13.5313 16.5938C14.7396 15.9271 15.7033 15.0054 16.4225 13.8287C17.1417 12.6521 17.5008 11.355 17.5 9.9375Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔄</Text>;
}

// Trophy icon for achievements (Card 3)
function TrophyIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 23 23" fill="none">
                <path d="M5 22.5V20H10V16.125C8.97917 15.8958 8.06792 15.4637 7.26625 14.8287C6.46458 14.1937 5.87583 13.3967 5.5 12.4375C3.9375 12.25 2.63042 11.5679 1.57875 10.3912C0.527083 9.21458 0.000833333 7.83417 0 6.25V5C0 4.3125 0.245 3.72417 0.735 3.235C1.225 2.74583 1.81333 2.50083 2.5 2.5H5V0H17.5V2.5H20C20.6875 2.5 21.2763 2.745 21.7663 3.235C22.2563 3.725 22.5008 4.31333 22.5 5V6.25C22.5 7.83333 21.9737 9.21375 20.9212 10.3912C19.8687 11.5687 18.5617 12.2508 17 12.4375C16.625 13.3958 16.0367 14.1929 15.235 14.8287C14.4333 15.4646 13.5217 15.8967 12.5 16.125V20H17.5V22.5H5ZM5 9.75V5H2.5V6.25C2.5 7.04167 2.72917 7.75542 3.1875 8.39125C3.64583 9.02708 4.25 9.48 5 9.75ZM17.5 9.75C18.25 9.47917 18.8542 9.02583 19.3125 8.39C19.7708 7.75417 20 7.04083 20 6.25V5H17.5V9.75Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏆</Text>;
}

// Runner icon for workout reminders (Card 4)
function RunnerIcon({ size = 24, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={Math.round(size * 0.73)} height={size} viewBox="0 0 19 26" fill="none">
                <path d="M13.4379 5.625C14.1838 5.625 14.8992 5.32868 15.4266 4.80124C15.9541 4.27379 16.2504 3.55842 16.2504 2.8125C16.2504 2.06658 15.9541 1.35121 15.4266 0.823762C14.8992 0.296316 14.1838 0 13.4379 0C12.692 0 11.9766 0.296316 11.4492 0.823762C10.9217 1.35121 10.6254 2.06658 10.6254 2.8125C10.6254 3.55842 10.9217 4.27379 11.4492 4.80124C11.9766 5.32868 12.692 5.625 13.4379 5.625ZM9.85416 5.62375C7.9854 5.36125 3.71415 6.12 1.95416 10.8113C1.83779 11.1217 1.84953 11.4657 1.98678 11.7675C2.12403 12.0693 2.37556 12.3043 2.68603 12.4206C2.9965 12.537 3.34048 12.5253 3.64229 12.388C3.94411 12.2507 4.17904 11.9992 4.2954 11.6887C5.0254 9.745 6.3404 8.79375 7.5129 8.37L6.05041 12.1275C6.02624 12.19 6.00749 12.2525 5.99415 12.315C5.93424 12.5071 5.92159 12.7108 5.95728 12.9089C5.99297 13.1069 6.07595 13.2934 6.19915 13.4525L10.6517 19.2113L10.9404 23.8275C10.9486 23.9927 10.9896 24.1547 11.0609 24.304C11.1322 24.4533 11.2324 24.587 11.3557 24.6973C11.4791 24.8075 11.6231 24.8922 11.7794 24.9464C11.9357 25.0006 12.1012 25.0232 12.2664 25.013C12.4315 25.0027 12.5929 24.9598 12.7414 24.8867C12.8898 24.8135 13.0222 24.7117 13.1309 24.587C13.2397 24.4623 13.3226 24.3172 13.3749 24.1603C13.4271 24.0033 13.4477 23.8375 13.4354 23.6725L13.0979 18.2887L10.4829 14.905L12.1992 11.5787L12.3154 11.7463C12.6409 12.2192 13.1193 12.5658 13.6701 12.7276C14.221 12.8894 14.8108 12.8567 15.3404 12.635L17.9842 11.5275C18.2823 11.3943 18.5165 11.1498 18.6367 10.8462C18.7568 10.5426 18.7534 10.204 18.6272 9.90291C18.501 9.60178 18.2619 9.36199 17.9612 9.23484C17.6604 9.10769 17.3219 9.10326 17.0179 9.2225L14.3742 10.33L12.3667 7.41125C11.9043 6.61095 11.1662 6.00657 10.2904 5.71125C10.1489 5.66354 10.0019 5.63413 9.8529 5.62375" fill={color} />
                <path d="M4.93789 18.0626L5.97164 14.9976L7.80789 17.3726L7.30539 18.8613C7.1288 19.3848 6.78378 19.835 6.32425 20.1417C5.86472 20.4483 5.31655 20.5941 4.76539 20.5563L1.16539 20.3101C1.00157 20.2989 0.841548 20.2556 0.694466 20.1826C0.547384 20.1096 0.416121 20.0083 0.308173 19.8846C0.200224 19.7608 0.117705 19.6171 0.0653248 19.4614C0.0129447 19.3058 -0.00826985 19.1414 0.00289251 18.9776C0.0140549 18.8137 0.0573755 18.6537 0.130381 18.5066C0.203386 18.3595 0.304647 18.2283 0.428381 18.1203C0.552115 18.0124 0.6959 17.9299 0.851525 17.8775C1.00715 17.8251 1.17157 17.8039 1.33539 17.8151L4.93789 18.0626Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
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

    // Fetch notifications on mount
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
        // Mark as read
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // Navigate based on notification type and metadata
        if (notification.metadata?.screen) {
            // Simple navigation (no params needed)
            if (notification.type === 'reminder' || notification.type === 'system' || notification.type === 'achievement') {
                navigation.navigate(notification.metadata.screen as string);
            }

            // Feedback navigation (needs feedbackId param)
            if (notification.type === 'workout_sync' && notification.metadata.feedbackId) {
                navigation.navigate(notification.metadata.screen as string, {
                    feedbackId: notification.metadata.feedbackId,
                });
            }
        }
        // recovery_analysis notifications are not clickable (do not navigate)
    };

    const filteredNotifications = getFilteredNotifications();

    return (
        <SafeAreaView style={styles.container}>
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
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },

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
        paddingBottom: 100,
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
        marginBottom: spacing.sm,
    },
    emptySubtext: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
    },
});
