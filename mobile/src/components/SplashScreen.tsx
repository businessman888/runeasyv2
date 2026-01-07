import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import LottieView from 'lottie-react-native';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

export function SplashScreen() {
    return (
        <View style={styles.container}>
            <StatusBar style="light" translucent backgroundColor="transparent" />
            <LottieView
                source={require('../assets/animate/animation (1).json')}
                autoPlay
                loop
                style={styles.animation}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
        justifyContent: 'center',
        alignItems: 'center',
    },
    animation: {
        width: width * 0.6,
        height: width * 0.6,
    },
});
