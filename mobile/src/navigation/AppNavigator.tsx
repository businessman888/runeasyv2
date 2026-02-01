import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
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
    PaceScreen,
    TimeframeScreen,
    LimitationsScreen,
    ReadinessQuizScreen,
    ReadinessResultScreen,
    ReadinessSuccessScreen,
    PersonalInfoScreen,
    TrainingHistoryScreen,
    NotificationSettingsScreen,
    HelpScreen,
    RetrospectiveScreen,
} from '../screens';
import { PlanPreviewScreen as QuizPlanPreviewScreen } from '../screens/quiz/PlanPreviewScreen';
import { PlanLoadingScreen } from '../screens/quiz/PlanLoadingScreen';
import { SmartPlanScreen } from '../screens/quiz/SmartPlanScreen';
import { PlanPreviewScreen as OldPlanPreviewScreen } from '../screens/PlanPreviewScreen';
import { colors, typography } from '../theme';
import { useAuthStore } from '../stores';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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
    const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

    React.useEffect(() => {
        checkAuth();
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

    return (
        <NavigationContainer
            ref={navigationRef}
            onReady={() => {
                setNavigationReady(true);
                console.log('[Navigation] NavigationContainer is ready');
            }}
        >
            <Stack.Navigator
                id="RootStack"
                screenOptions={{
                    headerStyle: {
                        backgroundColor: colors.white,
                    },
                    headerTintColor: colors.text,
                    headerTitleStyle: {
                        fontWeight: '600',
                    },
                }}
            >
                {!isAuthenticated ? (
                    <>
                        <Stack.Screen
                            name="Login"
                            component={LoginScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Onboarding"
                            component={OnboardingScreen}
                            options={{
                                headerShown: false,
                                gestureEnabled: false,
                            }}
                        />
                        {/* Quiz Screens */}
                        <Stack.Screen
                            name="Quiz_Objective"
                            component={ObjectiveScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Level"
                            component={LevelScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Frequency"
                            component={FrequencyScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Pace"
                            component={PaceScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Timeframe"
                            component={TimeframeScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Limitations"
                            component={LimitationsScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_PlanPreview"
                            component={QuizPlanPreviewScreen}
                            options={{ headerShown: false }}
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
                        {/* Plan Preview Screen */}
                        <Stack.Screen
                            name="PlanPreview"
                            component={OldPlanPreviewScreen}
                            options={{ headerShown: false }}
                        />
                    </>
                ) : (
                    <>
                        <Stack.Screen
                            name="Main"
                            component={MainTabs}
                            options={{ headerShown: false }}
                        />
                        {/* Quiz Screens - accessible after auth for new users */}
                        <Stack.Screen
                            name="Quiz_Objective"
                            component={ObjectiveScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Level"
                            component={LevelScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Frequency"
                            component={FrequencyScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Pace"
                            component={PaceScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Timeframe"
                            component={TimeframeScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_Limitations"
                            component={LimitationsScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="Quiz_PlanPreview"
                            component={QuizPlanPreviewScreen}
                            options={{ headerShown: false }}
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
                        <Stack.Screen
                            name="PlanPreview"
                            component={OldPlanPreviewScreen}
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
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
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
