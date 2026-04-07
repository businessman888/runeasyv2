import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ImageBackground,
    Image,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling based on Figma 375x812 design
const scaleX = (size: number) => (SCREEN_WIDTH / 375) * size;
const scaleY = (size: number) => (SCREEN_HEIGHT / 812) * size;
const scaleFont = (size: number) => {
    const scale = Math.min(SCREEN_WIDTH / 375, SCREEN_HEIGHT / 812);
    return Math.round(size * scale);
};

export function LandingScreen({ navigation }: { navigation: any }) {
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ImageBackground
                source={require('../assets/images/backgroundAppLandingScreen.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <View style={styles.overlay} />

                <View style={[
                    styles.content,
                    {
                        paddingTop: insets.top + scaleY(20),
                        paddingBottom: insets.bottom + scaleY(29),
                    }
                ]}>
                    {/* Logo */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/images/lpLogoRuneasy.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Text + Button section */}
                    <View style={styles.bottomContent}>
                        {/* Title & Subtitle */}
                        <View style={styles.textContainer}>
                            <Text style={styles.headline}>Sua corrida</Text>
                            <Text style={styles.headline}>
                                mais <Text style={styles.headlineCyan}>inteligente</Text>
                            </Text>
                            <Text style={styles.subheadline}>
                                Transforme cada pace em{'\n'}performance alta
                            </Text>
                        </View>

                        {/* Get Started Button */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Login')}
                            activeOpacity={0.8}
                            style={styles.getStartedButton}
                            accessibilityRole="button"
                            accessibilityLabel="Get started"
                        >
                            <Text style={styles.getStartedText}>Get started</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ImageBackground>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(14, 14, 31, 0.65)',
    },
    content: {
        flex: 1,
        paddingHorizontal: scaleX(10),
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: scaleY(60),
    },
    logo: {
        width: scaleX(380),
        height: scaleY(185),
    },
    bottomContent: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: scaleY(40),
        gap: scaleY(50),
    },
    textContainer: {
        alignItems: 'center',
    },
    headline: {
        fontSize: scaleFont(36),
        fontFamily: Platform.OS === 'web' ? '"Roboto Condensed", sans-serif' : 'RobotoCondensed-ExtraBold',
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        lineHeight: scaleFont(42),
    },
    headlineCyan: {
        color: '#00D4FF',
        fontWeight: '800',
    },
    subheadline: {
        fontSize: scaleFont(20),
        fontFamily: Platform.OS === 'web' ? '"Roboto Condensed", sans-serif' : 'RobotoCondensed-Regular',
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
        lineHeight: scaleFont(23),
        marginTop: scaleY(16),
    },
    getStartedButton: {
        width: scaleX(254),
        height: scaleY(51),
        backgroundColor: '#00D4FF',
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    getStartedText: {
        fontFamily: Platform.OS === 'web' ? '"Roboto Condensed", sans-serif' : 'RobotoCondensed-Bold',
        fontWeight: '700',
        fontSize: scaleFont(20),
        color: '#0E0E1F',
    },
});
