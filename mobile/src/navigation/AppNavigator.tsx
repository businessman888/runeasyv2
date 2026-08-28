import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Linking } from 'react-native';
import { CustomTabBar } from '../components/CustomTabBar';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { SplashScreen } from '../components/SplashScreen';
import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { navigationRef, setNavigationReady } from './navigationRef';

import {
    LandingScreen,
    AuthScreen,
    WelcomeScreen,
    OnboardingScreen,
    HomeScreen,
    CalendarScreen,
    BadgesScreen,
    RankingScreen,
    FeedbackScreen,
    WellnessScreen,
    SettingsScreen,
    AppearanceScreen,
    CoachAnalysisScreen,
    WorkoutDetailScreen,
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
    SupportScreen,
    DeviceConnectScreen,
    DeviceReadMoreScreen,
    RetrospectiveScreen,
    WeeklyInsightScreen,
    MesoInsightScreen,
    DaySwapChatScreen,
    CustomizeGoalScreen,
    ManualWorkoutConfigScreen,
    RunningScreen,
    RunSummaryScreen,
    WorkoutProcessingScreen,
    PlanGoalsScreen,
    WeekDetailScreen,
    PrePaywallScreen,
    TreadmillSetupScreen,
    CoachAudioSettingsScreen,
} from '../screens';
import { PlanPreviewScreen as QuizPlanPreviewScreen } from '../screens/quiz/PlanPreviewScreen';
import { PlanLoadingScreen } from '../screens/quiz/PlanLoadingScreen';
import { BriefingScreen } from '../screens/quiz/BriefingScreen';
import { PlanPreviewScreen as OldPlanPreviewScreen } from '../screens/PlanPreviewScreen';
// DevMenuScreen é dev-only; o require() em vez de import preserva tree-shaking
// em produção (junto com o gate `__DEV__` na registration).
const DevMenuScreen = __DEV__ ? require('../screens/dev/DevMenuScreen').DevMenuScreen : null;
import { useAppTheme } from '../theme';
import { useAuthStore, useTrialModalStore } from '../stores';
import { TrialModal } from '../components/upgrade/TrialModal';
import { RunEnvironmentModal } from '../components/RunEnvironmentModal';
import { navigationMotion } from '../theme/motion';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MODAL_ROUTE_NAMES = new Set([
    'PrePaywall',
    'DeviceConnect',
    'DeviceReadMore',
    'CustomizeGoal',
    'DevMenu',
]);


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
            Onboarding: 'google-auth',
            Landing: 'landing',
            Login: 'login',
        },
    },
};

// Tab Navigator
function MainTabs({ route, navigation }: any) {
    const { theme } = useAppTheme();
    const { initialTab } = route.params || {};

    // Tablet landscape: a tab bar vira side rail à esquerda (tabBarPosition
    // 'left' faz o react-navigation posicionar a barra na lateral e a cena ao
    // lado, sem sobreposição). Phone e tablet portrait mantêm a pill inferior.
    const { isTablet, isLandscape } = useBreakpoint();
    const useSideRail = isTablet && isLandscape;

    // One-time "Iniciar Teste Grátis" promo sheet — mounted once here (over the
    // tabs) and driven by the store; triggered from Calendar/Settings on focus.
    const trialVisible = useTrialModalStore((s) => s.visible);
    const hideTrial = useTrialModalStore((s) => s.hide);

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
        <View style={{ flex: 1 }}>
        <Tab.Navigator
            id="MainTabs"
            initialRouteName="Home"
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                tabBarPosition: useSideRail ? 'left' : 'bottom',
                headerStyle: {
                    backgroundColor: theme.colors.canvas,
                },
                headerTintColor: theme.colors.textPrimary,
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
                name="Ranking"
                component={RankingScreen}
                options={{
                    title: 'Ranking',
                    headerTitle: 'Ranking',
                    headerShown: false,
                }}
            />
            <Tab.Screen
                name="Wellness"
                component={WellnessScreen}
                options={{
                    title: 'Wellness',
                    headerTitle: 'Wellness',
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
        <TrialModal visible={trialVisible} onClose={hideTrial} />
        </View>
    );
}

// Root Navigator
export function AppNavigator() {
    const { theme, navigationTheme } = useAppTheme();
    const { isAuthenticated, isLoading, checkAuth, user, login } = useAuthStore();

    const { reduceMotion } = useMotionPreferences();
    React.useEffect(() => {
        checkAuth();
    }, []);

    // Deep Link listener — handles OAuth redirects and app links
    React.useEffect(() => {
        const handleDeepLink = async (url: string | null) => {
            if (!url) return;
            console.log('[DeepLink] Received URL:', url);

            try {
                // Parse URL to check for auth callback
                const urlObj = new URL(url.replace('runeasy://', 'https://app.runeasy.com/'));
                const path = urlObj.pathname;
                console.log('[DeepLink] Path:', path);

                // Google Auth callback is handled natively by GoogleSignin SDK
                // No manual parsing needed — the AuthScreen handles the flow
                if (path.includes('google-auth')) {
                    console.log('[DeepLink] Google auth callback detected');
                }
            } catch (error) {
                console.error('[DeepLink] Error parsing URL:', error);
            }
        };

        Linking.getInitialURL().then(handleDeepLink);

        const subscription = Linking.addEventListener('url', (event) => {
            handleDeepLink(event.url);
        });

        return () => subscription.remove();
    }, []);

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
            theme={navigationTheme}
            ref={navigationRef}
            linking={linking}
            onReady={() => {
                setNavigationReady(true);
                console.log('[Navigation] NavigationContainer is ready');
            }}
        >
            <Stack.Navigator
                id="RootStack"
                screenOptions={({ route }) => ({
                    // The resolved theme owns native-stack surfaces and headers.
                    contentStyle: { backgroundColor: theme.colors.canvas },
                    headerStyle: {
                        backgroundColor: theme.colors.canvas,
                    },
                    headerTintColor: theme.colors.textPrimary,
                    headerTitleStyle: {
                        fontWeight: '600',
                    },
                    animation: reduceMotion
                        ? 'none'
                        : MODAL_ROUTE_NAMES.has(route.name) ? 'slide_from_bottom' : 'slide_from_right',
                    animationDuration: reduceMotion
                        ? 0
                        : MODAL_ROUTE_NAMES.has(route.name) ? navigationMotion.modal : navigationMotion.card,
                })}
            >
                {!isAuthenticated ? (
                    /* ================================================
                       STATE 1: NOT AUTHENTICATED - Landing + Login
                       ================================================ */
                    <>
                        <Stack.Screen
                            name="Landing"
                            component={LandingScreen}
                            options={{ headerShown: false }}
                        />
                        {/* Single-card auth flow (method → email → signup). Keeps
                            the "Login" route name so Landing + deep links are
                            untouched. The old Register route is gone (its states
                            now live inside AuthScreen). */}
                        <Stack.Screen
                            name="Login"
                            component={AuthScreen}
                            options={{ headerShown: false }}
                        />
                    </>
                ) : !onboardingCompleted ? (
                    /* ================================================
                       STATE 2: AUTHENTICATED but ONBOARDING INCOMPLETE
                       User is LOCKED here - cannot escape to Home
                       ================================================ */
                    <>
                        {/* Tela de boas-vindas: rota inicial do fluxo de onboarding.
                            Reaparece a cada cold start enquanto onboarding_completed=false. */}
                        <Stack.Screen
                            name="Welcome"
                            component={WelcomeScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false,
                            }}
                        />
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
                            name="BriefingScreen"
                            component={BriefingScreen}
                            options={{ headerShown: false, gestureEnabled: false }}
                        />
                        {/* Device pre-config + "ler mais", reached from the
                            onboarding wearable step. Registered here (not only
                            in State 3) so navigation works while the user is
                            locked in onboarding — presenting these as native
                            modal routes avoids the iOS Modal-over-Modal bug. */}
                        <Stack.Screen
                            name="DeviceConnect"
                            component={DeviceConnectScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                                gestureEnabled: true,
                            }}
                        />
                        <Stack.Screen
                            name="DeviceReadMore"
                            component={DeviceReadMoreScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                                gestureEnabled: true,
                            }}
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
                            name="PrePaywall"
                            component={PrePaywallScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                                gestureEnabled: true,
                            }}
                        />
                        <Stack.Screen
                            name="Badges"
                            component={BadgesScreen}
                            options={{
                                headerShown: false,
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
                            name="WorkoutDetail"
                            component={WorkoutDetailScreen}
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
                            name="WeeklyInsight"
                            component={WeeklyInsightScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="MesoInsight"
                            component={MesoInsightScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        {/* Troca de Dias (T.2). `modal` porque é uma conversa
                            com começo e fim: entra por cima, resolve, sai — e
                            o corredor volta para o calendário de onde saiu. */}
                        <Stack.Screen
                            name="DaySwapChat"
                            component={DaySwapChatScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
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
                                animation: reduceMotion ? 'none' : 'fade',
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
                            name="Appearance"
                            component={AppearanceScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="CoachAudioSettings"
                            component={CoachAudioSettingsScreen}
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
                            name="DeviceConnect"
                            component={DeviceConnectScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                                gestureEnabled: true,
                            }}
                        />
                        <Stack.Screen
                            name="DeviceReadMore"
                            component={DeviceReadMoreScreen}
                            options={{
                                headerShown: false,
                                presentation: 'modal',
                                gestureEnabled: true,
                            }}
                        />
                        <Stack.Screen
                            name="Support"
                            component={SupportScreen}
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
                        <Stack.Screen
                            name="ManualWorkoutConfig"
                            component={ManualWorkoutConfigScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="PlanGoals"
                            component={PlanGoalsScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="WeekDetail"
                            component={WeekDetailScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                            }}
                        />
                        <Stack.Screen
                            name="Running"
                            component={RunningScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false, // Bloquear swipe down para não cancelar o rastreio
                            }}
                            initialParams={{
                                workoutId: undefined,
                                dayLabel: undefined,
                                title: undefined,
                                workoutBlocks: undefined,
                                mode: 'planned',
                                targetPaceSeconds: undefined,
                                targetDistanceKm: undefined,
                            }}
                        />
                        <Stack.Screen
                            name="RunSummary"
                            component={RunSummaryScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false,
                                animation: reduceMotion ? 'none' : 'fade',
                            }}
                        />
                        <Stack.Screen
                            name="WorkoutProcessing"
                            component={WorkoutProcessingScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false,
                                animation: reduceMotion ? 'none' : 'fade',
                            }}
                        />
                        <Stack.Screen
                            name="TreadmillSetup"
                            component={TreadmillSetupScreen}
                            options={{
                                headerShown: false,
                                presentation: 'card',
                                gestureEnabled: true,
                            }}
                        />
                        {__DEV__ && DevMenuScreen && (
                            <Stack.Screen
                                name="DevMenu"
                                component={DevMenuScreen}
                                options={{
                                    headerShown: false,
                                    presentation: 'modal',
                                }}
                            />
                        )}
                    </>
                )}
            </Stack.Navigator>
            <RunEnvironmentModal />
        </NavigationContainer >
    );
}
