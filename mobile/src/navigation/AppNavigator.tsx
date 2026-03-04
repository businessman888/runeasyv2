import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Linking } from 'react-native';
import { CustomTabBar } from '../components/CustomTabBar';
import { SplashScreen } from '../components/SplashScreen';
import { navigationRef, setNavigationReady } from './navigationRef';

import {
    LoginScreen,
    OnboardingScreen,
    HomeScreen,
    CalendarScreen,
    BadgesScreen,
    FeedbackScreen,
    EvolutionScreen,
    SettingsScreen,
    CoachAnalysisScreen,
    NotificationsScreen,
    ObjectiveScreen,
    LevelScreen,
    FrequencyScreen,
    LimitationsScreen,
    ReadinessQuizScreen,
    ReadinessResultScreen,
    ReadinessSuccessScreen,
    PersonalInfoScreen,
    TrainingHistoryScreen,
    NotificationSettingsScreen,
    HelpScreen,
    RetrospectiveScreen,
    CustomizeGoalScreen,
} from '../screens';
import { PlanPreviewScreen as QuizPlanPreviewScreen } from '../screens/quiz/PlanPreviewScreen';
import { PlanLoadingScreen } from '../screens/quiz/PlanLoadingScreen';
import { SmartPlanScreen } from '../screens/quiz/SmartPlanScreen';
import { PlanPreviewScreen as OldPlanPreviewScreen } from '../screens/PlanPreviewScreen';
import { colors, typography } from '../theme';
import { useAuthStore } from '../stores';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// CRITICAL: Dark background color for entire Navigator
const FORCED_DARK_BG = '#0F0F1E';

// Deep Linking Configuration
// Maps runeasy://--/callback/onboarding?user_id=xxx to Onboarding screen
const linking: LinkingOptions<any> = {
    prefixes: [
        'runeasy://',
        'exp://',
        'exp://192.168.0.0:8081', // Expo Go dev
    ],
    config: {
        screens: {
            // Map the callback path to Onboarding screen
            Onboarding: '--/callback/onboarding',
            Login: 'login',
        },
    },
};

// Placeholder screens
function WorkoutDetailScreen({ route }: any) {
    return (
        <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>🏃 Detalhes do Treino</Text>
            <Text style={styles.placeholderSubtext}>ID: {route.params?.workoutId}</Text>
        </View>
    );
}


// Tab Navigator
function MainTabs({ route, navigation }: any) {
    const { initialTab } = route.params || {};

    // Navigate to the correct tab after mount if initialTab is specified
    React.useEffect(() => {
        if (initialTab && initialTab !== 'Home') {
            // Small delay to ensure tabs are mounted
            const timer = setTimeout(() => {
                navigation.navigate(initialTab);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [initialTab, navigation]);

    return (
        <Tab.Navigator
            id="MainTabs"
            initialRouteName="Home"
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerStyle: {
                    backgroundColor: colors.background,
                },
                headerTintColor: colors.text,
                headerTitleStyle: {
                    fontWeight: '600',
                },
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    title: 'Início',
                    headerShown: false,
                }}
            />
            <Tab.Screen
                name="Calendar"
                component={CalendarScreen}
                options={{
                    title: 'Calendário',
                    headerTitle: 'Meu Calendário',
                    headerShown: false,
                }}
            />
            <Tab.Screen
                name="Badges"
                component={BadgesScreen}
                options={{
                    title: 'Badges',
                    headerTitle: 'Minhas Badges',
                    headerShown: false,
                }}
            />
            <Tab.Screen
                name="Evolution"
                component={EvolutionScreen}
                options={{
                    title: 'Evolução',
                    headerTitle: 'Minha Evolução',
                    headerShown: false,
                }}
            />
            <Tab.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    title: 'Config',
                    headerTitle: 'Configurações',
                    headerShown: false,
                }}
            />
        </Tab.Navigator>
    );
}

// Root Navigator
export function AppNavigator() {
    const { isAuthenticated, isLoading, checkAuth, user, login } = useAuthStore();

    React.useEffect(() => {
        checkAuth();
    }, []);

    // CRITICAL: Deep Link listener - extracts user_id from callback URL
    React.useEffect(() => {
        const handleDeepLink = async (url: string | null) => {
            if (!url) return;
            console.log('[DeepLink] Received URL:', url);

            try {
                // Extract user_id from URL query params
                // URL format: runeasy://--/callback/onboarding?user_id=xxx
                const urlObj = new URL(url.replace('runeasy://', 'https://app.runeasy.com/'));
                const userId = urlObj.searchParams.get('user_id');

                if (userId) {
                    console.log('[DeepLink] Extracted user_id:', userId);
                    await login(userId);
                    console.log('[DeepLink] Login complete — AppNavigator will auto-navigate based on onboarding_completed state');
                    // No manual navigation needed:
                    // - If onboarding_completed = false → AppNavigator renders State 2 (Onboarding)
                    // - If onboarding_completed = true  → AppNavigator renders State 3 (Main tabs)
                } else {
                    console.warn('[DeepLink] No user_id found in URL');
                }
            } catch (error) {
                console.error('[DeepLink] Error parsing URL:', error);
            }
        };

        // Handle initial URL (cold start - app was closed)
        Linking.getInitialURL().then((url) => {
            console.log('[DeepLink] Initial URL:', url);
            handleDeepLink(url);
        });

        // Handle URL while app is running (warm start)
        const subscription = Linking.addEventListener('url', (event) => {
            console.log('[DeepLink] URL Event:', event.url);
            handleDeepLink(event.url);
        });

        return () => subscription.remove();
    }, [login]);

    // Set navigation as not ready when unmounting
    React.useEffect(() => {
        return () => {
            setNavigationReady(false);
        };
    }, []);

    if (isLoading) {
        return <SplashScreen />;
    }

    // CRITICAL: 3-state navigation logic
    // 1. NOT authenticated -> Login only
    // 2. Authenticated BUT onboarding NOT complete -> Onboarding ONLY (LOCKED)
    // 3. Authenticated AND onboarding complete -> Main + other screens
    const onboardingCompleted = user?.onboarding_completed ?? false;

    console.log('[Navigation] isAuthenticated:', isAuthenticated, 'onboardingCompleted:', onboardingCompleted);

    return (
        <NavigationContainer
            ref={navigationRef}
            linking={linking}
            onReady={() => {
                setNavigationReady(true);
                console.log('[Navigation] NavigationContainer is ready');
            }}
        >
            <Stack.Navigator
                id="RootStack"
                screenOptions={{
                    // CRITICAL: Force dark background on ALL screens
                    contentStyle: { backgroundColor: FORCED_DARK_BG },
                    headerStyle: {
                        backgroundColor: FORCED_DARK_BG,
                    },
                    headerTintColor: colors.text,
                    headerTitleStyle: {
                        fontWeight: '600',
                    },
                }}
            >
                {!isAuthenticated ? (
                    /* ================================================
                       STATE 1: NOT AUTHENTICATED - Login screen only
                       ================================================ */
                    <>
                        <Stack.Screen
                            name="Login"
                            component={LoginScreen}
                            options={{ headerShown: false }}
                        />
                    </>
                ) : !onboardingCompleted ? (
                    /* ================================================
                       STATE 2: AUTHENTICATED but ONBOARDING INCOMPLETE
                       User is LOCKED here - cannot escape to Home
                       ================================================ */
                    <>
                        <Stack.Screen
                            name="Onboarding"
                            component={OnboardingScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false, // Prevent swipe back
                            }}
                        />
                        <Stack.Screen
                            name="Quiz_PlanLoading"
                            component={PlanLoadingScreen}
                            options={{ headerShown: false, gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="SmartPlan"
                            component={SmartPlanScreen}
                            options={{ headerShown: false }}
                        />
                    </>
                ) : (
                    /* ================================================
                       STATE 3: AUTHENTICATED and ONBOARDING COMPLETE
                       Full app access - Home and all features
                       ================================================ */
                    <>
                        <Stack.Screen
                            name="Main"
                            component={MainTabs}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="WorkoutDetail"
                            component={WorkoutDetailScreen}
                            options={{
                                title: 'Treino',
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="Feedback"
                            component={FeedbackScreen}
                            options={{
                                title: 'Análise do Treino',
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="CoachAnalysis"
                            component={CoachAnalysisScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="Retrospective"
                            component={RetrospectiveScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="ReadinessQuiz"
                            component={ReadinessQuizScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="ReadinessResult"
                            component={ReadinessResultScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="ReadinessSuccess"
                            component={ReadinessSuccessScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                                animation: 'fade',
                                gestureEnabled: false,
                            }}
                        />
                        <Stack.Screen
                            name="Notifications"
                            component={NotificationsScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="PersonalInfo"
                            component={PersonalInfoScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="TrainingHistory"
                            component={TrainingHistoryScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="NotificationSettings"
                            component={NotificationSettingsScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="Help"
                            component={HelpScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="CustomizeGoal"
                            component={CustomizeGoalScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                            }}
                        />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer >
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    loadingText: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: '700' as const,
        color: colors.primary,
    },
    placeholder: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderText: {
        fontSize: 48,
        marginBottom: 8,
    },
    placeholderSubtext: {
        fontSize: typography.fontSizes.lg,
        color: colors.textSecondary,
    },
});
