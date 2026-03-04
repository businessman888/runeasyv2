import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
    BackHandler,
} from 'react-native';
import { colors } from '../../theme';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { useAuthStore } from '../../stores/authStore';
import Svg, { Path, Rect, G, Defs, Filter, FeFlood, FeColorMatrix, FeOffset, FeGaussianBlur, FeComposite, FeBlend, ClipPath, Circle } from 'react-native-svg';

// Badge de Conquista Icon (Yellow Trophy)
const BadgeIcon = () => (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
        <Rect width={40} height={40} rx={20} fill="#FFC400" fillOpacity={0.5} />
        <Path
            d="M15.2775 9.08375C15.4525 9.0625 15.6462 9.0625 15.8712 9.0625H24.1288C24.3538 9.0625 24.5475 9.0625 24.7225 9.08375C25.3437 9.16104 25.9214 9.44335 26.364 9.886C26.8066 10.3286 27.089 10.9063 27.1663 11.5275L27.17 11.5625H28.1775C28.4425 11.56 29.0238 11.555 29.5037 11.8762C30.125 12.29 30.3125 13.0013 30.3125 13.75C30.3125 17.1575 28.4963 19.4325 26.1775 20.6962C24.8837 23.0513 22.4937 24.6875 20 24.6875C18.1012 24.6875 16.3 23.66 15.0038 22.2388C14.573 21.7688 14.195 21.2533 13.8762 20.7013C11.5587 19.4437 9.6875 17.1713 9.6875 13.75C9.6875 13 9.875 12.29 10.495 11.8762C10.9762 11.555 11.5575 11.56 11.8225 11.5625H12.83L12.8338 11.5275C12.911 10.9063 13.1934 10.3286 13.636 9.886C14.0786 9.44335 14.6563 9.16104 15.2775 9.08375ZM28.415 13.4438C28.3185 13.4379 28.2217 13.4358 28.125 13.4375H27.1838L27.1437 17.55C27.9412 16.59 28.4375 15.3375 28.4375 13.75C28.4375 13.6025 28.4263 13.505 28.415 13.4438ZM11.5625 13.75C11.5625 15.2962 12.0475 16.525 12.825 17.4775C12.7425 16.545 12.765 15.5975 12.7875 14.655C12.7992 14.2467 12.8063 13.8408 12.8088 13.4375H11.875C11.7387 13.4375 11.6525 13.4375 11.5863 13.4438C11.5687 13.5449 11.5607 13.6474 11.5625 13.75ZM20.2875 13.1937C20.2635 13.1374 20.2234 13.0893 20.1723 13.0555C20.1212 13.0217 20.0613 13.0037 20 13.0037C19.9387 13.0037 19.8788 13.0217 19.8277 13.0555C19.7766 13.0893 19.7365 13.1374 19.7125 13.1937L19.0813 14.7088C19.0592 14.7616 19.0231 14.8074 18.9768 14.8412C18.9305 14.8749 18.8758 14.8952 18.8188 14.9L17.1825 15.0312C17.121 15.0361 17.0622 15.0591 17.0137 15.0973C16.9652 15.1356 16.9292 15.1873 16.91 15.246C16.8909 15.3047 16.8896 15.3677 16.9063 15.4272C16.923 15.4866 16.9569 15.5398 17.0037 15.58L18.25 16.6475C18.2936 16.685 18.3259 16.7337 18.3436 16.7884C18.3612 16.8431 18.3634 16.9016 18.35 16.9575L17.97 18.5525C17.9553 18.6127 17.9589 18.6759 17.9803 18.734C18.0016 18.7922 18.0397 18.8427 18.0898 18.8791C18.1399 18.9156 18.1997 18.9363 18.2616 18.9387C18.3235 18.9411 18.3848 18.925 18.4375 18.8925L19.8375 18.0375C19.8865 18.0077 19.9427 17.9919 20 17.9919C20.0573 17.9919 20.1135 18.0077 20.1625 18.0375L21.5625 18.8925C21.6152 18.925 21.6765 18.9411 21.7384 18.9387C21.8003 18.9363 21.8601 18.9156 21.9102 18.8791C21.9603 18.8427 21.9984 18.7922 22.0197 18.734C22.0411 18.6759 22.0447 18.6127 22.03 18.5525L21.6488 16.9575C21.6353 16.9016 21.6375 16.8431 21.6552 16.7884C21.6728 16.7337 21.7052 16.685 21.7488 16.6475L22.9963 15.58C23.0435 15.5399 23.0778 15.4866 23.0948 15.427C23.1117 15.3673 23.1105 15.304 23.0914 15.245C23.0722 15.1861 23.0359 15.1341 22.9872 15.0958C22.9384 15.0575 22.8793 15.0346 22.8175 15.03L21.1825 14.9C21.1252 14.8955 21.0703 14.8752 21.0237 14.8415C20.9772 14.8077 20.9409 14.7618 20.9187 14.7088L20.2875 13.1937ZM20 25.3125C20.2486 25.3125 20.4871 25.4113 20.6629 25.5871C20.8387 25.7629 20.9375 26.0014 20.9375 26.25V29.0625H25C25.2486 29.0625 25.4871 29.1613 25.6629 29.3371C25.8387 29.5129 25.9375 29.7514 25.9375 30C25.9375 30.2486 25.8387 30.4871 25.6629 30.6629C25.4871 30.8387 25.2486 30.9375 25 30.9375H15C14.7514 30.9375 14.5129 30.8387 14.3371 30.6629C14.1613 30.4871 14.0625 30.2486 14.0625 30C14.0625 29.7514 14.1613 29.5129 14.3371 29.3371C14.5129 29.1613 14.7514 29.0625 15 29.0625H19.0625V26.25C19.0625 26.0014 19.1613 25.7629 19.3371 25.5871C19.5129 25.4113 19.7514 25.3125 20 25.3125Z"
            fill="#FFC400"
        />
    </Svg>
);

// Checkmark Icon
const CheckmarkIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={12} fill="#FFC400" />
        <Path
            d="M9.5 12.5L11 14L14.5 10"
            stroke="#0E0E1F"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

// Training Icon (Runner)
const TrainingIcon = () => (
    <Svg width={50} height={50} viewBox="0 0 50 50" fill="none">
        <Rect width={50} height={50} rx={25} fill="#00D4FF" />
        <Path
            d="M21.7425 16.0075C21.7126 15.8444 21.6192 15.6998 21.4828 15.6056C21.3463 15.5114 21.1781 15.4752 21.015 15.505C20.8518 15.5349 20.7073 15.6283 20.613 15.7647C20.5188 15.9011 20.4826 16.0694 20.5125 16.2325L20.5237 16.29C18.3625 17.0063 17.0887 18.1525 16.365 19.4313C15.6587 20.6813 15.5187 21.9938 15.5025 23H15.5V23.005L14.6625 24.0525C14.5009 24.2546 14.3828 24.488 14.3159 24.738C14.2489 24.988 14.2344 25.2491 14.2732 25.5049C14.3121 25.7608 14.4035 26.0058 14.5417 26.2246C14.6799 26.4434 14.8619 26.6312 15.0762 26.7763L25.895 34.1013C27.2394 35.0123 28.8259 35.4995 30.45 35.5H33.9375C34.3408 35.5 34.7395 35.4133 35.1064 35.2457C35.4733 35.0781 35.7998 34.8335 36.0639 34.5285C36.3279 34.2236 36.5233 33.8654 36.6367 33.4783C36.7501 33.0912 36.7789 32.6842 36.7212 32.285C36.5212 30.9138 35.3625 29.93 34.1625 29.55C33.4012 29.3075 32.6875 28.9138 32.27 28.2938L28.4987 21.8063L28.7237 21.7713C28.8057 21.7588 28.8843 21.7301 28.9551 21.687C29.0259 21.6438 29.0874 21.587 29.136 21.5198C29.1846 21.4527 29.2193 21.3765 29.2382 21.2958C29.2571 21.2151 29.2597 21.1314 29.246 21.0496C29.2322 20.9679 29.2023 20.8897 29.158 20.8196C29.1138 20.7495 29.056 20.6889 28.9881 20.6414C28.9202 20.5938 28.8435 20.5603 28.7624 20.5427C28.6814 20.525 28.5977 20.5237 28.5162 20.5388C28.1595 20.5979 27.8062 20.6267 27.4562 20.625C24.8687 20.6113 22.5837 18.9538 21.8775 16.5725C21.8215 16.387 21.7765 16.1983 21.7425 16.0075ZM18.8375 18.51L21.5812 23.2613C21.7471 23.5482 21.7922 23.8893 21.7066 24.2095C21.621 24.5297 21.4118 24.8028 21.125 24.9688L20.0337 25.6L16.75 23.3838V23.225C16.75 22.2675 16.8525 21.11 17.4537 20.0463C17.7537 19.5138 18.1925 18.9838 18.8387 18.5088M21.54 26.615L25.3475 24.415C25.4897 24.333 25.6467 24.2798 25.8095 24.2585C25.9723 24.2371 26.1377 24.2481 26.2962 24.2907C26.4548 24.3333 26.6034 24.4067 26.7336 24.5067C26.8638 24.6068 26.973 24.7315 27.055 24.8738L27.8087 26.1788C27.9745 26.4659 28.0194 26.8071 27.9336 27.1273C27.8478 27.4475 27.6383 27.7205 27.3512 27.8863L25.2362 29.1075L21.54 26.615ZM30.4887 33H35.4687C35.3237 33.7125 34.6937 34.25 33.9375 34.25H30.45C29.0756 34.25 27.7329 33.8381 26.595 33.0675L15.7775 25.7413C15.7061 25.6929 15.6455 25.6303 15.5995 25.5574C15.5536 25.4845 15.5232 25.4028 15.5102 25.3176C15.4973 25.2324 15.5022 25.1454 15.5245 25.0621C15.5468 24.9789 15.5861 24.9011 15.64 24.8338L15.9975 24.3838L27.3425 32.0375C28.2718 32.6648 29.3675 32.9999 30.4887 33Z"
            fill="#0E0E1F"
        />
    </Svg>
);

// Lock Icon for Unlock Section
const LockIcon = () => (
    <Svg width={77} height={77} viewBox="0 0 89 89" fill="none">
        <Rect x={6} y={6} width={77} height={77} rx={15} fill="#1C1C2E" />
        <Rect x={6.5} y={6.5} width={76} height={76} rx={14.5} stroke="#00D4FF" />
        <Path
            d="M58.0624 43.4167V33C58.0624 29.2704 56.5808 25.6935 53.9436 23.0563C51.3064 20.4191 47.7295 18.9375 43.9999 18.9375C40.2703 18.9375 36.6935 20.4191 34.0562 23.0563C31.419 25.6935 29.9374 29.2704 29.9374 33V43.4167C28.3345 45.9364 27.4381 48.8405 27.3419 51.8253C27.2457 54.8101 27.9532 57.7659 29.3905 60.3836C30.8278 63.0014 32.942 65.1848 35.512 66.7057C38.0821 68.2266 41.0136 69.0289 43.9999 69.0289C46.9863 69.0289 49.9177 68.2266 52.4878 66.7057C55.0579 65.1848 57.1721 63.0014 58.6094 60.3836C60.0466 57.7659 60.7542 54.8101 60.6579 51.8253C60.5617 48.8405 59.6653 45.9364 58.0624 43.4167ZM43.9999 56.5C43.1758 56.5 42.3702 56.2556 41.685 55.7978C40.9998 55.34 40.4658 54.6892 40.1504 53.9278C39.8351 53.1665 39.7525 52.3287 39.9133 51.5205C40.0741 50.7122 40.4709 49.9698 41.0536 49.3871C41.6364 48.8043 42.3788 48.4075 43.187 48.2467C43.9953 48.086 44.8331 48.1685 45.5944 48.4838C46.3558 48.7992 47.0065 49.3333 47.4644 50.0185C47.9222 50.7037 48.1666 51.5092 48.1666 52.3333C48.1666 53.4384 47.7276 54.4982 46.9462 55.2796C46.1648 56.061 45.105 56.5 43.9999 56.5ZM52.8541 36.4583C52.8513 36.6373 52.8041 36.8129 52.7169 36.9692C52.6296 37.1255 52.505 37.2578 52.3541 37.3542C52.2021 37.4419 52.0296 37.4881 51.8541 37.4881C51.6786 37.4881 51.5061 37.4419 51.3541 37.3542C49.0694 36.2167 46.5521 35.6246 43.9999 35.6246C41.4478 35.6246 38.9304 36.2167 36.6458 37.3542C36.4937 37.4419 36.3213 37.4881 36.1458 37.4881C35.9702 37.4881 35.7978 37.4419 35.6458 37.3542C35.4949 37.2578 35.3702 37.1255 35.283 36.9692C35.1957 36.8129 35.1486 36.6373 35.1458 36.4583V33.0625C35.1458 30.7142 36.0786 28.4621 37.7391 26.8017C39.3996 25.1412 41.6516 24.2083 43.9999 24.2083C46.3482 24.2083 48.6003 25.1412 50.2608 26.8017C51.9212 28.4621 52.8541 30.7142 52.8541 33.0625V36.4583Z"
            fill="#00D4FF"
        />
    </Svg>
);

// Timer Icon
const TimerIcon = () => (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <Path
            d="M7 3.5V7L9.33333 8.16667M12.8333 7C12.8333 10.2217 10.2217 12.8333 7 12.8333C3.77834 12.8333 1.16667 10.2217 1.16667 7C1.16667 3.77834 3.77834 1.16667 7 1.16667C10.2217 1.16667 12.8333 3.77834 12.8333 7Z"
            stroke="rgba(235, 235, 245, 0.6)"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

// Speed Icon
const SpeedIcon = () => (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <Path
            d="M7 7.58333L9.91667 4.66667M12.8333 7C12.8333 10.2217 10.2217 12.8333 7 12.8333C3.77834 12.8333 1.16667 10.2217 1.16667 7C1.16667 3.77834 3.77834 1.16667 7 1.16667C10.2217 1.16667 12.8333 3.77834 12.8333 7Z"
            stroke="rgba(235, 235, 245, 0.6)"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

// Arrow Icon
const ArrowIcon = () => (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
            d="M5 12H19M19 12L12 5M19 12L12 19"
            stroke="#0E0E1F"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

// Helper to get goal label
const getGoalLabel = (goal: string): string => {
    const goals: Record<string, string> = {
        '5k': '5km',
        '10k': '10km',
        'half_marathon': '21km',
        'marathon': '42km',
        'general_fitness': 'Fitness',
    };
    return goals[goal] || '10km';
};

// Helper to get goal description
const getGoalDescription = (goal: string): string => {
    const descriptions: Record<string, string> = {
        '5k': '5km Sub-30',
        '10k': '10km Sub-50',
        'half_marathon': '21km Sub-2h',
        'marathon': '42km Sub-4h',
        'general_fitness': 'Fitness Geral',
    };
    return descriptions[goal] || '10km Sub-50';
};

export function SmartPlanScreen({ navigation, route }: any) {
    const { data, generatedPlan: storePlan } = useOnboardingStore();
    const { setAuthenticated } = useAuthStore();
    const userId = route?.params?.userId;
    const timeframe = route?.params?.timeframe;

    // DUPLICATE PLAN PROTECTION: Disable Android hardware back button
    useEffect(() => {
        const backAction = () => {
            // Return true to prevent default back behavior
            // User must use the "Unlock All" button to proceed
            return true;
        };

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction
        );

        return () => backHandler.remove();
    }, []);

    // Get plan data from route params (preferred) or from store
    const planData = route?.params?.planData || storePlan;

    // Extract data from AI-generated plan or fallback to onboarding store
    const goal = data.goal || '10k';
    const planHeader = planData?.planHeader;
    const nextWorkout = planData?.nextWorkout;
    const welcomeBadge = planData?.welcomeBadge;

    // Use AI-generated values if available, otherwise use store data
    const objectiveShort = planHeader?.objectiveShort || getGoalLabel(goal);
    const durationWeeks = planHeader?.durationWeeks || `${data.targetWeeks || 12} Sem`;
    const frequencyWeekly = planHeader?.frequencyWeekly || `${data.daysPerWeek || 4}x/Sem`;

    // Next workout data - use AI-generated or fallback
    const workoutTitle = nextWorkout?.title || 'Rodagem Leve - 5 km';
    const workoutDuration = nextWorkout?.duration || '35 min';
    const workoutPace = nextWorkout?.paceEstimate || 'Pace 5:30';

    const handleUnlockAll = async () => {
        try {
            if (userId) {
                // Re-fetch user data from backend.
                // Backend already marked onboarding_completed = true during /training/onboarding.
                // login() updates authStore with fresh user data → AppNavigator auto-transitions.
                const { login, user, setUser } = useAuthStore.getState();
                await login(userId);

                // Belt-and-suspenders: if login() returned but onboarding_completed is still false
                // (e.g., stale cache, race condition), force it locally.
                const updatedUser = useAuthStore.getState().user;
                if (updatedUser && !updatedUser.onboarding_completed) {
                    console.log('[SmartPlan] Force-setting onboarding_completed = true');
                    useAuthStore.getState().setUser({
                        ...updatedUser,
                        onboarding_completed: true,
                    });
                }
            }
        } catch (error) {
            console.error('Error completing onboarding:', error);
            // Fallback: force set onboarding_completed locally so navigation works
            const currentUser = useAuthStore.getState().user;
            if (currentUser) {
                useAuthStore.getState().setUser({
                    ...currentUser,
                    onboarding_completed: true,
                });
            }
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                    {/* Header Section */}
                    <View style={styles.headerSection}>
                        <Text style={styles.title}>
                            Seu Plano inteligente{'\n'}Está Pronto!
                        </Text>
                        <Text style={styles.subtitle}>
                            Personalizado para sua meta de{'\n'}
                            <Text style={styles.goalHighlight}>{getGoalDescription(goal)}</Text>
                            {' '}com base na sua{'\n'}performance.
                        </Text>
                    </View>

                    {/* Objective Pills */}
                    <View style={styles.pillsContainer}>
                        <View style={styles.pill}>
                            <Text style={styles.pillLabel}>Objetivo</Text>
                            <Text style={styles.pillValue}>{objectiveShort}</Text>
                        </View>
                        <View style={styles.pill}>
                            <Text style={styles.pillLabel}>Duração</Text>
                            <Text style={styles.pillValue}>{durationWeeks}</Text>
                        </View>
                        <View style={styles.pill}>
                            <Text style={styles.pillLabel}>Freq.</Text>
                            <Text style={styles.pillValue}>{frequencyWeekly}</Text>
                        </View>
                    </View>

                    {/* Badge de Boas-Vindas */}
                    <View style={styles.badgeCard}>
                        <BadgeIcon />
                        <View style={styles.badgeTextContainer}>
                            <Text style={styles.badgeTitle}>Badge de Boas-Vindas</Text>
                            <Text style={styles.badgeSubtitle}>CONQUISTADO</Text>
                        </View>
                        <CheckmarkIcon />
                    </View>

                    {/* Próximo Treino Section */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Próximo Treino</Text>
                        <View style={styles.todayBadge}>
                            <Text style={styles.todayBadgeText}>HOJE</Text>
                        </View>
                    </View>

                    <View style={styles.workoutCard}>
                        <View style={styles.workoutContent}>
                            <Text style={styles.workoutLabel}>TREINO #1</Text>
                            <Text style={styles.workoutTitle}>{workoutTitle}</Text>
                            <View style={styles.workoutMetrics}>
                                <View style={styles.metricItem}>
                                    <TimerIcon />
                                    <Text style={styles.metricText}>{workoutDuration}</Text>
                                </View>
                                <View style={styles.metricItem}>
                                    <SpeedIcon />
                                    <Text style={styles.metricText}>{workoutPace}</Text>
                                </View>
                            </View>
                        </View>
                        <TrainingIcon />
                    </View>

                    {/* Cronograma Completo Section */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Cronograma Completo</Text>
                        <View style={styles.weeksBadge}>
                            <Text style={styles.weeksBadgeText}>{durationWeeks}</Text>
                        </View>
                    </View>

                    {/* Locked Timeline Card */}
                    <View style={styles.lockedCard}>
                        <View style={styles.lockedContent}>
                            <LockIcon />
                            <TouchableOpacity
                                style={styles.unlockButton}
                                onPress={handleUnlockAll}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.unlockButtonText}>Desbloquear Tudo</Text>
                                <ArrowIcon />
                            </TouchableOpacity>
                            <Text style={styles.trialText}>
                                7 dias grátis depois R$ 29,90/mês. Cancele quando{'\n'}quiser.
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 16,
        paddingBottom: 80,
    },
    headerSection: {
        marginBottom: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 30,
        fontWeight: '600',
        color: '#EBEBF5',
        lineHeight: 38,
        marginBottom: 16,
        textAlign: 'left',
    },
    subtitle: {
        fontSize: 17,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 26,
        textAlign: 'left',
    },
    goalHighlight: {
        color: '#00D4FF',
    },
    pillsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 14,
        marginBottom: 20,
    },
    pill: {
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.1)',
    },
    pillLabel: {
        fontSize: 12,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 4,
    },
    pillValue: {
        fontSize: 20,
        fontWeight: '600',
        color: '#EBEBF5',
    },
    badgeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#FFC400',
    },
    badgeTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    badgeTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: '#EBEBF5',
        marginBottom: 2,
    },
    badgeSubtitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4CAF50',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#EBEBF5',
    },
    todayBadge: {
        backgroundColor: '#1C1C2E',
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.2)',
    },
    todayBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#EBEBF5',
    },
    weeksBadge: {
        backgroundColor: '#1C1C2E',
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.2)',
    },
    weeksBadgeText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    workoutCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#00D4FF',
    },
    workoutContent: {
        flex: 1,
    },
    workoutLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 10,
    },
    workoutTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#00D4FF',
        marginBottom: 16,
    },
    workoutMetrics: {
        flexDirection: 'row',
        gap: 16,
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metricText: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    lockedCard: {
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    lockedContent: {
        alignItems: 'center',
    },
    unlockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00D4FF',
        borderRadius: 30,
        paddingVertical: 16,
        paddingHorizontal: 40,
        gap: 12,
        marginTop: 20,
        marginBottom: 16,
        width: '100%',
    },
    unlockButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#0E0E1F',
    },
    trialText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
        lineHeight: 16,
    },
});

export default SmartPlanScreen;
