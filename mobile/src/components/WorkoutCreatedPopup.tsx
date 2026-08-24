import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    TouchableOpacity,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { semanticColors } from '../theme/semanticColors';
import { createThemeStyles, useThemeSubscription } from '../theme';

const checkAnimation = require('../assets/animate/animationCheck.json');

interface WorkoutCreatedPopupProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
}

export function WorkoutCreatedPopup({
    visible,
    onClose,
    title = 'Treino Criado!',
    message = 'Seu treino manual foi adicionando ao\ncalendário',
}: WorkoutCreatedPopupProps) {
    useThemeSubscription();
    const lottieRef = useRef<LottieView>(null);

    useEffect(() => {
        if (visible) {
            lottieRef.current?.reset();
            lottieRef.current?.play();
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable
                    style={styles.card}
                    onPress={(e) => e.stopPropagation()}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                >
                    <Text style={styles.title}>{title}</Text>

                    <View style={styles.lottieWrapper}>
                        <LottieView
                            ref={lottieRef}
                            source={checkAnimation}
                            autoPlay
                            loop={false}
                            style={styles.lottie}
                        />
                    </View>

                    <Text style={styles.message}>{message}</Text>

                    <TouchableOpacity
                        onPress={onClose}
                        style={styles.okBtn}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="OK, fechar"
                    >
                        <Text style={styles.okText}>OK</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = createThemeStyles(() => ({
    overlay: {
        flex: 1,
        backgroundColor: semanticColors.scrim,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: semanticColors.surface2,
        borderRadius: 20,
        paddingTop: 17,
        paddingBottom: 17,
        paddingHorizontal: 15,
        alignItems: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    title: {
        fontFamily: 'Poppins',
        fontSize: 20,
        fontWeight: '700',
        color: semanticColors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    lottieWrapper: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 4,
    },
    lottie: {
        width: 140,
        height: 140,
    },
    message: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '500',
        color: semanticColors.textSecondary,
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 20,
        lineHeight: 21,
    },
    okBtn: {
        width: 258,
        height: 41,
        backgroundColor: semanticColors.accent,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: semanticColors.canvas,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    okText: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '500',
        color: semanticColors.textOnAccent,
    },
}));
