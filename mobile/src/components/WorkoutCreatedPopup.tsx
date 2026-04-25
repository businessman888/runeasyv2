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

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        paddingTop: 17,
        paddingBottom: 17,
        paddingHorizontal: 15,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    title: {
        fontFamily: 'Poppins',
        fontSize: 20,
        fontWeight: '700',
        color: '#EBEBF5',
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
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 20,
        lineHeight: 21,
    },
    okBtn: {
        width: 258,
        height: 41,
        backgroundColor: '#00D4FF',
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    okText: {
        fontFamily: 'Poppins',
        fontSize: 14,
        fontWeight: '500',
        color: '#0E0E1F',
    },
});
