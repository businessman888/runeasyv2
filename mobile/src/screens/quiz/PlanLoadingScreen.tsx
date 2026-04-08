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
import { useOnboardingStore } from '../../stores/onboardingStore';
import { determineArchetype } from '../../utils/archetypes';

const { width } = Dimensions.get('window');

// Marathon animation
const MarathonAnimation = require('../../../telas frontend/icons/icons second card/Marathon.json');

const LOADING_MESSAGES = [
    'Analisando seu perfil de corredor',
    'Identificando seu perfil de corredor',
    'Computando suas respostas',
    'Montando seu cronograma de treino',
];

const MESSAGE_INTERVAL = 2000; // 2 seconds (4 messages in 8s)
const TOTAL_DURATION = 8000; // 8 seconds fixed

export function PlanLoadingScreen({ navigation, route }: any) {
    const { userId } = route?.params || {};
    const { data } = useOnboardingStore();

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;

    // Rotate messages every 2 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start(() => {
                setCurrentMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }).start();
            });
        }, MESSAGE_INTERVAL);

        return () => clearInterval(interval);
    }, [fadeAnim]);

    // Animate progress bar 0→100% over 8 seconds
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: 1,
            duration: TOTAL_DURATION,
            useNativeDriver: false,
        }).start();
    }, [progressAnim]);

    // After 8 seconds, compute archetype and navigate to BriefingScreen
    useEffect(() => {
        const timer = setTimeout(() => {
            const archetype = determineArchetype({
                goal: data.goal || '5k',
                experience_level: data.experience_level || 'beginner',
                daysPerWeek: data.daysPerWeek || 3,
                goalTimeframe: data.goalTimeframe,
                calculatedPace: data.calculatedPace,
                limitations: data.limitations,
                hasInjury: data.hasInjury,
            });

            navigation.replace('BriefingScreen', {
                archetype,
                userId,
            });
        }, TOTAL_DURATION);

        return () => clearTimeout(timer);
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
