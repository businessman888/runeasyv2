import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Platform,
    ImageBackground,
    Image,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../theme';
import * as Storage from '../utils/storage';
import { useAuthStore } from '../stores';
import Svg, { Path } from 'react-native-svg';
import { API_URL } from '../config/api.config';

const { width, height } = Dimensions.get('window');

// RunEasy Logo Component (exact from Figma SVG) - 355x116
const RunEasyLogo = () => (
    <Svg width={355} height={116} viewBox="0 0 355 116" fill="none">
        <Path d="M20.168 35.0416C20.168 35.6446 19.2206 43.7412 18.0147 52.9575C16.8088 62.1738 15.6891 72.3376 15.4307 75.5246L15 81.3817H20.5987C23.7857 81.3817 26.1974 81.0372 26.1974 80.5204C26.1974 80.0036 23.8718 79.659 20.9432 79.659C16.1197 79.659 15.7752 79.5729 16.8088 78.1948C17.7563 77.075 17.7563 76.7305 16.9811 76.4721C15 75.783 15.7752 74.491 18.1008 74.491C19.3067 74.491 20.0819 74.1465 19.8235 73.7158C19.5651 73.3713 20.168 72.2515 21.1155 71.3902C22.063 70.5288 24.2163 67.9448 25.939 65.7053C28.6092 62.0016 29.2982 61.5709 32.3129 61.5709C35.1554 61.5709 35.6722 61.8293 35.6722 63.4658C35.6722 64.4994 34.6385 66.3944 33.4327 67.6864C30.6764 70.5288 31.1932 73.0267 34.897 74.8355C37.3948 76.0414 37.3948 76.0414 37.3948 73.6297C37.3948 70.1843 38.3423 65.8776 39.0314 66.3083C39.3759 66.4805 39.3759 68.72 39.0314 71.2179C38.6868 73.7158 38.3423 77.075 38.3423 78.5393L38.2562 81.3817H48.9368H59.5313L60.5649 73.8019C61.8569 63.6381 61.7708 62.949 59.7897 61.1402C57.5502 59.073 57.6363 58.4701 60.3065 56.1445C62.7182 54.0772 64.0102 49.5121 64.0964 43.3105C64.0964 40.2958 63.5796 38.6592 62.0292 36.8504L59.9619 34.4387L40.065 34.1803C24.0441 33.9219 20.168 34.0941 20.168 35.0416ZM40.9263 53.5604C40.2373 54.8524 40.065 54.4218 39.9789 51.5793C39.9789 49.6844 40.2373 47.7895 40.6679 47.4449C41.6154 46.4113 41.8738 51.9239 40.9263 53.5604Z" fill="#00D4FF" />
        <Path d="M67.2835 34.611C67.0251 35.0416 65.8192 44.0857 64.5272 54.8524C62.5461 70.615 62.2877 74.9217 63.0629 76.6443C64.8717 80.5204 68.6616 81.3817 83.8212 81.3817C99.6699 81.3817 103.718 80.4342 105.958 76.0414C107.422 73.1129 112.418 35.7307 111.47 34.611C111.126 34.2664 106.302 34.0941 100.617 34.1803L90.3674 34.4387L88.214 51.4071C87.0943 60.7957 85.8023 68.4616 85.4578 68.4616C84.5103 68.4616 84.5964 67.428 86.8359 50.1151C87.8695 41.7601 88.5586 34.6971 88.3863 34.4387C87.6972 33.7496 67.7142 33.9219 67.2835 34.611Z" fill="#00D4FF" />
        <Path d="M113.709 35.0417C113.537 35.6446 112.331 44.8609 111.039 55.5416C109.833 66.2222 108.541 76.386 108.283 78.1948L107.766 81.4679L118.016 81.2095L128.266 80.9511L128.524 77.2473C128.697 75.1801 128.18 71.5625 127.405 69.2369C124.907 61.7432 126.629 63.7243 130.419 72.7684L134.037 81.3818H143.426H152.728L153.245 78.5393C153.503 77.0751 154.623 67.6003 155.829 57.6949C157.035 47.7034 158.155 38.3148 158.413 36.7644L158.93 34.0081H148.68H138.43L137.913 37.6257C137.568 40.0374 137.999 42.6215 139.119 45.55C140.928 50.2874 141.1 51.5794 140.066 50.8903C139.722 50.7181 137.913 46.7559 136.104 42.2769L132.745 34.0081H123.356C116.638 34.0081 113.882 34.2665 113.709 35.0417Z" fill="#00D4FF" />
        <Path d="M160.222 36.7643C159.963 38.3147 158.758 47.9617 157.552 58.1255C156.346 68.2893 155.14 77.678 154.882 78.97L154.365 81.3817H174.176H193.9L194.934 73.8019C195.451 69.5814 195.881 65.7053 195.881 65.1885C195.881 64.4994 193.297 64.1549 187.268 64.1549C182.1 64.1549 178.655 63.8104 178.655 63.2936C178.655 62.7768 182.1 62.4322 187.182 62.4322C191.919 62.4322 195.967 62.1738 196.14 61.7432C196.398 61.3986 196.743 59.4175 196.829 57.2642L197.173 53.3882L188.56 52.8714L179.947 52.4407L188.646 52.2684L197.432 52.0962L197.862 49.2537C198.207 47.7895 198.638 43.655 198.982 40.2097L199.585 34.008H180.119H160.653L160.222 36.7643Z" fill="#00D4FF" />
        <Path d="M208.371 35.4724C201.653 52.5269 197.69 64.7579 196.829 70.9596C195.279 82.5016 194.245 81.3818 206.562 81.3818H217.243L217.76 78.7117C218.018 77.2474 218.276 74.9218 218.276 73.5436C218.276 72.1655 218.707 71.0457 219.224 71.0457C219.913 71.0457 219.999 72.6823 219.568 76.2138L218.965 81.3818H229.732H240.585L241.102 77.678C242.738 65.7916 242.825 63.2075 241.36 51.6656C240.585 45.0333 239.638 38.3148 239.379 36.7644L238.862 34.0081H223.961C210.524 34.0081 208.888 34.1804 208.371 35.4724ZM222.152 55.1971C221.808 58.2118 221.205 60.7096 220.688 60.7096C219.827 60.7096 220.085 57.092 221.463 49.5122C222.411 44.7749 222.841 48.9093 222.152 55.1971Z" fill="#00D4FF" />
        <Path d="M253.677 35.1278C249.371 36.6782 247.562 39.6929 246.528 47.2727C244.805 60.4512 246.356 62.4323 258.845 62.4323C263.324 62.4323 267.286 62.6046 267.545 62.863C268.234 63.6382 267.2 68.4617 266.339 68.4617C265.822 68.4617 265.736 67.5142 265.994 66.3083L266.511 64.155H255.486H244.375L243.772 68.8924C243.427 72.1655 243.6 74.5772 244.461 76.5583C246.27 80.865 249.457 81.5541 266.683 81.2095C279.604 80.9511 281.24 80.7789 283.48 79.1423C287.011 76.6444 288.734 72.3377 289.423 64.9302C289.94 58.8147 289.854 58.2979 287.786 55.8861C285.633 53.4744 285.375 53.3882 276.417 53.1298C268.751 52.8714 267.286 52.613 267.717 51.4933C267.975 50.8042 268.234 49.5122 268.234 48.5647C268.234 47.7034 268.665 46.9282 269.181 46.9282C269.784 46.9282 269.957 47.7895 269.612 49.0815L269.095 51.2349H280.12H291.232L291.835 46.4975C292.524 40.2097 290.973 36.3337 287.183 34.9556C283.393 33.6636 257.553 33.7497 253.677 35.1278Z" fill="#00D4FF" />
        <Path d="M294.591 36.7643C293.73 42.0185 292.352 54.0772 292.352 55.886C292.352 56.9197 294.505 60.7957 297.175 64.4133L301.999 71.1318L301.396 76.2137L300.793 81.3817H311.559H322.326L322.843 78.7116C323.101 77.2473 323.36 75.0078 323.36 73.7158C323.36 72.0792 324.824 70.012 328.614 66.3083C336.797 58.2117 337.055 57.6949 338.433 46.3252C339.122 40.8126 339.725 35.7307 339.725 35.1278C339.725 34.2664 337.227 34.008 329.045 34.008H318.364L317.847 36.7643C317.589 38.3147 317.158 42.2769 316.814 45.4638C316.469 48.6508 315.866 51.4932 315.349 51.8377C314.488 52.3546 314.66 49.7705 316.125 38.0563L316.727 34.008H305.875H295.022L294.591 36.7643Z" fill="#00D4FF" />
        <Path d="M29.212 63.2074C28.609 64.241 31.9682 66.136 33.088 65.4469C33.6048 65.1885 33.9493 64.3272 33.9493 63.6381C33.9493 62.26 30.0733 61.9154 29.212 63.2074Z" fill="#00D4FF" />
        <Path d="M26.1973 68.031C26.1973 68.7201 26.9725 69.323 27.9199 69.323C28.8674 69.323 29.6426 69.1507 29.6426 68.8923C29.6426 68.7201 28.8674 68.1171 27.9199 67.6003C26.5418 66.8251 26.1973 66.9112 26.1973 68.031Z" fill="#00D4FF" />
        <Path d="M25.3359 72.1654C25.3359 75.1801 28.7813 77.9364 32.4851 77.9364C34.2077 77.9364 35.672 77.5057 35.672 77.0751C35.672 76.5583 34.5523 76.2137 33.088 76.2137C31.3653 76.2137 30.504 75.7831 30.504 74.9217C30.504 72.51 30.4178 72.3377 28.5229 71.3041C25.8527 69.7537 25.3359 69.9259 25.3359 72.1654Z" fill="#00D4FF" />
    </Svg>
);

// Official Strava "Connect with Strava" button image
const STRAVA_CONNECT_BUTTON = require('../assets/images/strava/btn_strava_connect_with_orange_x2.png');

export function LoginScreen({ navigation }: any) {
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const { login } = useAuthStore();

    // Check for auth callback params on web
    React.useEffect(() => {
        if (Platform.OS === 'web') {
            handleWebCallback();
        }
    }, []);

    const handleWebCallback = async () => {
        try {
            const currentUrl = window.location.href;
            const url = new URL(currentUrl);
            const userId = url.searchParams.get('user_id');
            const errorParam = url.searchParams.get('error');

            if (errorParam) {
                setError(getErrorMessage(errorParam));
                // Clean URL
                window.history.replaceState({}, '', '/');
                return;
            }

            if (userId) {
                // Clean URL first
                window.history.replaceState({}, '', '/');

                // Save userId to storage
                await Storage.setItemAsync('user_id', userId);

                // Always use login() — AppNavigator decides the screen based on:
                // - onboarding_completed = false → State 2 (Onboarding)
                // - onboarding_completed = true  → State 3 (Main tabs)
                console.log('User authenticated — AppNavigator will auto-navigate');
                await login(userId);
            }
        } catch (err) {
            console.error('Web callback error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const getErrorMessage = (errorCode: string): string => {
        const messages: Record<string, string> = {
            'auth_failed': 'Falha na autenticação. Tente novamente.',
            'missing_code': 'Código de autorização não recebido.',
            'access_denied': 'Acesso negado pelo Strava.',
        };
        return messages[errorCode] || 'Erro desconhecido. Tente novamente.';
    };

    const handleStravaLogin = async () => {
        setError(null);

        // DEBUG: Log the URL being used
        // Backend uses /api prefix (set in main.ts), so route is /api/auth/strava/login
        const loginUrl = `${API_URL}/api/auth/strava/login`;
        console.log('=== STRAVA LOGIN DEBUG ===');
        console.log('API_URL:', API_URL);
        console.log('Full login URL:', loginUrl);
        console.log('Platform:', Platform.OS);

        if (Platform.OS === 'web') {
            // On web, redirect directly to Strava login
            console.log('Redirecting to:', loginUrl);
            window.location.href = loginUrl;
        } else {
            // On native (Expo Go), use simple browser opening
            // The deep link callback will be handled by Linking listener
            try {
                setIsLoading(true);
                const WebBrowser = require('expo-web-browser');
                const Linking = require('expo-linking');

                // Get the callback URL that Expo Go can handle
                const callbackUrl = Linking.createURL('callback');
                console.log('=== EXPO GO OAUTH FLOW ===');
                console.log('Callback URL (for backend FRONTEND_URL):', callbackUrl);
                console.log('Login URL:', loginUrl);
                console.log('=== URL RECEBIDA NO APP ===');
                console.log('URL RECEBIDA NO APP:', loginUrl);

                // Set up a listener for deep link callback BEFORE opening browser
                const handleDeepLink = async (event: { url: string }) => {
                    console.log('=== DEEP LINK RECEIVED ===');
                    console.log('URL:', event.url);

                    try {
                        const url = new URL(event.url);
                        const userId = url.searchParams.get('user_id');
                        const errorParam = url.searchParams.get('error');

                        console.log('Parsed - userId:', userId, 'error:', errorParam);

                        if (errorParam) {
                            setError(getErrorMessage(errorParam));
                            setIsLoading(false);
                            return;
                        }

                        if (userId) {
                            await Storage.setItemAsync('user_id', userId);

                            // Always use login() — AppNavigator decides the screen
                            console.log('User authenticated — AppNavigator will auto-navigate');
                            await login(userId);
                        }
                    } catch (parseError) {
                        console.error('Error parsing deep link:', parseError);
                    } finally {
                        setIsLoading(false);
                    }
                };

                // Add listener
                const subscription = Linking.addEventListener('url', handleDeepLink);

                console.log('Opening browser with openBrowserAsync...');

                // Open browser - user will be redirected back via deep link
                await WebBrowser.openBrowserAsync(loginUrl, {
                    showInRecents: true,
                    dismissButtonStyle: 'close',
                });

                console.log('Browser closed');

                // Note: The deep link handler above will process the callback
                // If browser was closed without completing auth, remove listener after delay
                setTimeout(() => {
                    subscription.remove();
                    setIsLoading(false);
                }, 30000); // 30 second timeout

            } catch (err: any) {
                console.error('=== STRAVA LOGIN ERROR ===');
                console.error('Error name:', err?.name);
                console.error('Error message:', err?.message);
                console.error('Full error:', JSON.stringify(err, null, 2));
                setError('Erro ao conectar com Strava: ' + (err?.message || 'Erro desconhecido'));
                setIsLoading(false);
            }
        }
    };

    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background with overlay */}
            <ImageBackground
                source={require('../assets/images/login-background.avif')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                {/* Overlay with #0E0E1F at 80% opacity */}
                <View style={styles.overlay} />

                <View style={[
                    styles.content,
                    {
                        paddingTop: insets.top + 20,
                        paddingBottom: insets.bottom + 20
                    }
                ]}>
                    {/* Logo Section - Top */}
                    <View style={styles.logoContainer}>
                        <RunEasyLogo />
                    </View>

                    {/* Central Text Section */}
                    <View style={styles.centerSection}>
                        <View style={styles.textContainer}>
                            <Text style={styles.headline}>Sua corrida</Text>
                            <Text style={styles.headline}>
                                mais <Text style={styles.headlineBlue}>inteligente</Text>
                            </Text>
                            <Text style={styles.subheadline}>
                                Transforme cada pace em{'\n'}performance alta
                            </Text>
                        </View>
                    </View>

                    {/* Bottom Section */}
                    <View style={styles.bottomSection}>
                        {/* Error Message */}
                        {error && (
                            <View style={styles.errorContainer}>
                                <Text style={styles.errorText}>⚠️ {error}</Text>
                            </View>
                        )}

                        {/* Official Strava Connect Button */}
                        <TouchableOpacity
                            onPress={handleStravaLogin}
                            disabled={isLoading}
                            activeOpacity={0.8}
                            style={styles.stravaButtonContainer}
                        >
                            {isLoading ? (
                                <View style={styles.stravaLoadingContainer}>
                                    <ActivityIndicator size="small" color="#FC4C02" />
                                    <Text style={styles.stravaLoadingText}>Conectando...</Text>
                                </View>
                            ) : (
                                <Image
                                    source={STRAVA_CONNECT_BUTTON}
                                    style={styles.stravaButtonImage}
                                    resizeMode="contain"
                                />
                            )}
                        </TouchableOpacity>

                        {/* Terms and Privacy */}
                        <Text style={styles.disclaimer}>
                            Ao entrar, você concorda com nossos <Text style={styles.link}>termos de</Text>
                            {'\n'}<Text style={styles.link}>uso</Text> e <Text style={styles.link}>Política de Privacidade</Text>
                        </Text>
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
        backgroundColor: 'rgba(14, 14, 31, 0.8)', // #0E0E1F with 80% opacity
    },
    content: {
        flex: 1,
        paddingHorizontal: 10,
        paddingTop: 29,
        paddingBottom: 29,
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: 80,
    },
    centerSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        alignItems: 'center',
    },
    headline: {
        fontSize: 36,
        fontFamily: Platform.OS === 'web' ? '"Roboto Condensed", sans-serif' : 'RobotoCondensed-ExtraBold',
        fontWeight: '800', // Extra Bold
        color: colors.white,
        textAlign: 'center',
        lineHeight: 44,
    },
    headlineBlue: {
        color: '#00D4FF', // Same blue as logo
        fontWeight: '800',
    },
    subheadline: {
        fontSize: 20,
        fontFamily: Platform.OS === 'web' ? '"Roboto Condensed", sans-serif' : 'RobotoCondensed-Regular',
        fontWeight: '400', // Regular
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        lineHeight: 26,
        marginTop: 16,
    },
    bottomSection: {
        gap: 16,
        alignItems: 'center',
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        width: '100%',
    },
    errorText: {
        color: '#EF4444',
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
    },
    stravaButtonContainer: {
        width: '100%',
        maxWidth: 340,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    stravaButtonImage: {
        width: 280,
        height: 48,
    },
    stravaLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(252, 76, 2, 0.1)',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        gap: 12,
    },
    stravaLoadingText: {
        color: '#FC4C02',
        fontSize: 16,
        fontWeight: '600',
    },
    disclaimer: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        lineHeight: 18,
    },
    link: {
        color: 'rgba(255, 255, 255, 0.6)',
        textDecorationLine: 'underline',
    },
});
