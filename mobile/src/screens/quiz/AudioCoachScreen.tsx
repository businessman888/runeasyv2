/**
 * Step de onboarding — descoberta do Coach de Áudio (Figma screenStepCoachAudio 1622:1916).
 *
 * Só APRESENTA a feature e captura a INTENÇÃO. A ação (ligar a preferência) mora no
 * pai (OnboardingScreen: handleCoachYes/handleCoachNo), espelhando a step wearable —
 * por isso este componente é puramente presentacional e ignora as props padrão do
 * fluxo (value/onChange/onAdvance). Não verifica TTS, não concede Pro: é só a
 * preferência (mesmo estado do card no Profile → useCoachStore.setEnabled).
 *
 * Copy reusada verbatim de CoachAudioSettingsScreen (const BULLETS) para consistência.
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { fonts, createThemeStyles, useThemeSubscription } from '../../theme';
import { QUIZ } from './_tokens';

// Mesmos bullets da tela de config permanente (CoachAudioSettingsScreen).
const BULLETS = [
    'Conecte seus fones e receba avisos por voz enquanto corre, sem precisar olhar para a tela.',
    'A cada quilômetro completado, você ouve o tempo e o ritmo daquele trecho.',
    'Nos treinos do seu plano, o coach avisa quando você sai do ritmo-alvo e prepara você para cada tiro do intervalado.',
    'Sua música abaixa só no momento do aviso e volta logo em seguida. Funciona com o celular no bolso e a tela apagada.',
];

export function AudioCoachScreen() {
    useThemeSubscription();
    return (
        <>
            <View style={styles.titleContainer}>
                <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
                    Habilite seu coach{'\n'}de áudio
                </Text>
            </View>

            <View style={styles.illustrationContainer}>
                <Image
                    source={require('../../assets/images/wearables/imgCoachAudio.png')}
                    style={styles.illustration}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel="Ilustração do coach de áudio"
                />
            </View>

            <View style={styles.bullets}>
                {BULLETS.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text
                            style={styles.bulletText}
                            allowFontScaling
                            maxFontSizeMultiplier={1.4}
                        >
                            {b}
                        </Text>
                    </View>
                ))}
            </View>
        </>
    );
}

export default AudioCoachScreen;

const styles = createThemeStyles(() => ({
    titleContainer: {
        marginBottom: 4,
        alignItems: 'center',
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        color: QUIZ.color.text,
        lineHeight: 32,
        textAlign: 'center',
    },
    illustrationContainer: {
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
    illustration: {
        width: 218,
        height: 218,
    },
    bullets: {
        alignSelf: 'stretch',
        gap: 18,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    bulletDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: QUIZ.color.textDim,
        marginTop: 8,
    },
    bulletText: {
        flex: 1,
        fontFamily: fonts.semibold,
        color: QUIZ.color.textDim,
        fontSize: 14,
        lineHeight: 20,
    },
}));
