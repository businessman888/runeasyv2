import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    Dimensions,
    Animated,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { colors } from '../../theme';
import { useOnboardingStore } from '../../stores/onboardingStore';

const { width } = Dimensions.get('window');

// Marathon animation 
const MarathonAnimation = require('../../../telas frontend/icons/icons second card/Marathon.json');

const LOADING_MESSAGES = [
    'Analisando seu perfil de corredor',
    'Computando suas respostas',
    'Montando seu cronograma de treino',
];

const MESSAGE_INTERVAL = 3000; // 3 seconds

export function PlanLoadingScreen({ navigation, route }: any) {
    const { userId, timeframe, onboardingData } = route?.params || {};
    const { submitOnboarding, clearError, errorCode } = useOnboardingStore();

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const pendingNavigation = useRef<{ planData: any } | null>(null);

    // Rotate messages every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            // Fade out
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start(() => {
                // Change message
                setCurrentMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
                // Fade in
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            });
        }, MESSAGE_INTERVAL);

        return () => clearInterval(interval);
    }, [fadeAnim]);

    // Animate progress bar progressively (simulates progress while waiting)
    useEffect(() => {
        // Animate to 70% over 4 seconds (simulating initial progress)
        Animated.timing(progressAnim, {
            toValue: 0.7,
            duration: 4000,
            useNativeDriver: false,
        }).start();
    }, [progressAnim]);

    // Complete progress bar when plan is ready
    useEffect(() => {
        if (isComplete && pendingNavigation.current) {
            // Animate to 100% quickly
            Animated.timing(progressAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: false,
            }).start(() => {
                // Navigate after progress bar completes
                const { planData } = pendingNavigation.current!;
                navigation.replace('SmartPlan', {
                    userId,
                    timeframe,
                    planData,
                });
            });
        }
    }, [isComplete]);

    // Trigger plan generation and navigate when complete
    useEffect(() => {
        const generatePlan = async () => {
            clearError();

            try {
                const planData = await submitOnboarding();

                if (planData) {
                    // Store navigation data and trigger completion animation
                    pendingNavigation.current = { planData };
                    setIsComplete(true);
                } else if (errorCode === 'AUTH_REQUIRED') {
                    // User needs to login - redirect to Login screen
                    navigation.replace('Login', {
                        returnTo: 'Quiz_PlanPreview',
                        message: 'Faça login para gerar seu plano de treino personalizado.',
                    });
                }
            } catch (err) {
                console.error('Failed to generate plan:', err);
                // Stay on loading screen and show error
                navigation.goBack();
            }
        };

        generatePlan();
    }, []);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
                <Animated.View
                    style={[
                        styles.progressBarFill,
                        { width: progressWidth }
                    ]}
                />
            </View>

            {/* Content */}
            <View style={styles.content}>
                {/* Animation Container */}
                <View style={styles.animationContainer}>
                    <LottieView
                        source={MarathonAnimation}
                        autoPlay
                        loop
                        style={styles.lottieAnimation}
                    />
                </View>

                {/* Text Container */}
                <View style={styles.textContainer}>
                    <Animated.Text
                        style={[
                            styles.loadingMessage,
                            { opacity: fadeAnim }
                        ]}
                    >
                        {LOADING_MESSAGES[currentMessageIndex]}
                    </Animated.Text>
                    <Text style={styles.subtitleText}>
                        Isso pode levar alguns segundos...
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
    },
    progressBarContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 10,
        backgroundColor: 'rgba(0, 127, 153, 0.3)',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#00D4FF',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    animationContainer: {
        width: width - 20,
        height: 308,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    lottieAnimation: {
        width: 200,
        height: 200,
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    loadingMessage: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#EBEBF5',
        textAlign: 'center',
        marginBottom: 20,
    },
    subtitleText: {
        fontSize: 15,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
    },
});

export default PlanLoadingScreen;


