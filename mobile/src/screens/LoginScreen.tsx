import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../theme';
import { useAuthStore } from '../stores';
import { supabase } from '../services/supabase';
import { BASE_API_URL } from '../config/api.config';
import Svg, { Path } from 'react-native-svg';
import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

// Configure Google Sign-In
GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    offlineAccess: true,
});

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling based on Figma 375x822 design
const scaleX = (size: number) => (SCREEN_WIDTH / 375) * size;
const scaleY = (size: number) => (SCREEN_HEIGHT / 822) * size;
const scaleFont = (size: number) => {
    const scale = Math.min(SCREEN_WIDTH / 375, SCREEN_HEIGHT / 822);
    return Math.round(size * scale);
};

// Google "G" icon SVG
const GoogleIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 48 48">
        <Path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#FFC107" />
        <Path d="M5.3 14.7l7 5.1C14.2 15.7 18.7 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 15.4 2 8.1 7.3 5.3 14.7z" fill="#FF3D00" />
        <Path d="M24 46c5.2 0 10-1.8 13.7-4.9l-6.7-5.5C29.1 37.1 26.7 38 24 38c-6 0-11.1-4-12.8-9.5l-7 5.4C7 41 14.7 46 24 46z" fill="#4CAF50" />
        <Path d="M44.5 20H24v8.5h11.8c-1 3.2-3.1 5.8-5.8 7.6l6.7 5.5C40.5 38.2 46 32 46 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2" />
    </Svg>
);

export function LoginScreen({ navigation }: { navigation: unknown }) {
    const [isLoading, setIsLoading] = React.useState(false);
    const [isAppleLoading, setIsAppleLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const { login } = useAuthStore();

    const getErrorMessage = (errorCode: string): string => {
        const messages: Record<string, string> = {
            'auth_failed': 'Falha na autenticação. Tente novamente.',
            'sign_in_cancelled': 'Login cancelado.',
            'in_progress': 'Login já em andamento.',
            'play_services': 'Google Play Services indisponível.',
        };
        return messages[errorCode] || 'Erro desconhecido. Tente novamente.';
    };

    const handleGoogleLogin = async () => {
        setError(null);
        setIsLoading(true);

        try {
            console.log('[LOGIN] Starting Google Sign-In...');

            // Check Google Play Services availability
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

            // Sign in with Google natively
            const signInResult = await GoogleSignin.signIn();
            console.log('[LOGIN] Google Sign-In successful');

            const idToken = signInResult.data?.idToken;
            if (!idToken) {
                throw new Error('No idToken returned from Google Sign-In');
            }

            // Exchange Google token via backend (avoids DNS issues with direct Supabase calls)
            console.log('[LOGIN] Exchanging token via backend...');
            const authResponse = await fetch(`${BASE_API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
            });

            if (!authResponse.ok) {
                const errorBody = await authResponse.text();
                console.error('[LOGIN] Backend auth error:', errorBody);
                throw new Error('Falha na autenticação. Tente novamente.');
            }

            const authData = await authResponse.json();

            // Set the session in the local Supabase client for session persistence
            const { error: sessionError } = await supabase.auth.setSession({
                access_token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
            });

            if (sessionError) {
                console.warn('[LOGIN] Could not persist session locally:', sessionError.message);
            }

            console.log('[LOGIN] Auth successful, userId:', authData.user.id);
            const data = { user: authData.user, session: authData.session };

            // Login to our backend (fetch/create user data)
            await login(data.user.id);
            console.log('[LOGIN] Backend login complete — AppNavigator will auto-navigate');

        } catch (err: unknown) {
            console.error('[LOGIN] Error:', err);

            if (err !== null && typeof err === 'object' && 'code' in err) {
                const googleError = err as { code: string; message?: string };
                switch (googleError.code) {
                    case statusCodes.SIGN_IN_CANCELLED:
                        setError(getErrorMessage('sign_in_cancelled'));
                        break;
                    case statusCodes.IN_PROGRESS:
                        setError(getErrorMessage('in_progress'));
                        break;
                    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
                        setError(getErrorMessage('play_services'));
                        break;
                    default:
                        setError(googleError.message || getErrorMessage('auth_failed'));
                }
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(getErrorMessage('auth_failed'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleAppleLogin = async () => {
        setError(null);
        setIsAppleLoading(true);

        try {
            console.log('[LOGIN] Starting Apple Sign-In...');

            // 1. Generate raw nonce and its SHA256 hash (Supabase security requirement)
            const rawNonce = Crypto.randomUUID();
            const hashedNonce = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                rawNonce,
            );

            // 2. Request Apple credentials with hashed nonce
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
                nonce: hashedNonce,
            });

            const { identityToken, fullName } = credential;

            if (!identityToken) {
                throw new Error('No identityToken returned from Apple Sign-In');
            }

            // 3. Capture fullName on first login (Apple only sends it once)
            const displayName = fullName
                ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
                : undefined;

            if (displayName) {
                console.log('[LOGIN] Apple fullName captured:', displayName);
            }

            // 4. Exchange Apple token via backend (avoids DNS issues with direct Supabase calls)
            console.log('[LOGIN] Exchanging Apple token via backend...');
            const authResponse = await fetch(`${BASE_API_URL}/auth/apple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: identityToken, nonce: rawNonce }),
            });

            if (!authResponse.ok) {
                const errorBody = await authResponse.text();
                console.error('[LOGIN] Backend auth error:', errorBody);
                throw new Error('Falha na autenticação. Tente novamente.');
            }

            const authData = await authResponse.json();

            // Set the session in the local Supabase client for session persistence
            const { error: sessionError } = await supabase.auth.setSession({
                access_token: authData.session.access_token,
                refresh_token: authData.session.refresh_token,
            });

            if (sessionError) {
                console.warn('[LOGIN] Could not persist session locally:', sessionError.message);
            }

            // 5. Update user metadata with fullName if available (first login only)
            if (displayName) {
                try {
                    await supabase.auth.updateUser({
                        data: { full_name: displayName },
                    });
                } catch {
                    console.warn('[LOGIN] Could not update displayName locally, will sync via backend');
                }
            }

            console.log('[LOGIN] Auth successful, userId:', authData.user.id);
            const data = { user: authData.user, session: authData.session };

            // 6. Login to backend
            await login(data.user.id);
            console.log('[LOGIN] Backend login complete — AppNavigator will auto-navigate');

        } catch (err: unknown) {
            console.error('[LOGIN] Apple error:', err);

            if (
                err !== null &&
                typeof err === 'object' &&
                'code' in err &&
                (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
            ) {
                setError(getErrorMessage('sign_in_cancelled'));
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(getErrorMessage('auth_failed'));
            }
        } finally {
            setIsAppleLoading(false);
        }
    };

    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <View style={[
                styles.content,
                {
                    paddingTop: insets.top + scaleY(25),
                    paddingBottom: insets.bottom + scaleY(80),
                }
            ]}>
                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Text style={styles.title}>
                        Criar uma conta ou{'\n'}conectar-se{'\n'}
                        <Text style={styles.titleCyan}>gratuitamente</Text>
                    </Text>
                </View>

                {/* Buttons Section */}
                <View style={styles.buttonsSection}>
                    {/* Error Message */}
                    {error && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Apple Sign-In Button (iOS only, displayed first per Apple guidelines) */}
                    {Platform.OS === 'ios' && (
                        <View style={styles.appleButtonWrapper}>
                            {isAppleLoading ? (
                                <View style={styles.appleLoadingContainer}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.appleLoadingText}>Conectando...</Text>
                                </View>
                            ) : (
                                <AppleAuthentication.AppleAuthenticationButton
                                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                                    cornerRadius={16}
                                    style={styles.appleButton}
                                    onPress={handleAppleLogin}
                                />
                            )}
                        </View>
                    )}

                    {/* Google Sign-In Button */}
                    <TouchableOpacity
                        onPress={handleGoogleLogin}
                        disabled={isLoading || isAppleLoading}
                        activeOpacity={0.8}
                        style={styles.googleButton}
                        accessibilityRole="button"
                        accessibilityLabel="Continuar com Google"
                    >
                        {isLoading ? (
                            <View style={styles.googleLoadingContainer}>
                                <ActivityIndicator size="small" color="#00D4FF" />
                                <Text style={styles.googleLoadingText}>Conectando...</Text>
                            </View>
                        ) : (
                            <View style={styles.googleButtonContent}>
                                <GoogleIcon />
                                <Text style={styles.googleButtonText}>Conectar com Google</Text>
                            </View>
                        )}
                    </TouchableOpacity>
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
    content: {
        flex: 1,
        paddingHorizontal: scaleX(16),
        justifyContent: 'space-between',
    },
    titleSection: {
        marginTop: scaleY(53),
        paddingHorizontal: scaleX(9),
    },
    title: {
        fontFamily: Platform.OS === 'web' ? '"Poppins", sans-serif' : 'Poppins-Bold',
        fontWeight: '700',
        fontSize: scaleFont(24),
        lineHeight: scaleFont(36),
        color: '#EBEBF5',
        textAlign: 'left',
    },
    titleCyan: {
        color: '#00D4FF',
    },
    buttonsSection: {
        alignItems: 'center',
        gap: scaleY(24),
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        padding: spacing.md,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        width: '100%',
        maxWidth: scaleX(303),
    },
    errorText: {
        color: '#EF4444',
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
    },
    appleButtonWrapper: {
        width: '100%',
        maxWidth: scaleX(303),
        alignSelf: 'center',
    },
    appleButton: {
        width: '100%',
        height: scaleY(52),
    },
    appleLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        height: scaleY(52),
        borderRadius: 16,
        gap: 12,
    },
    appleLoadingText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    googleButton: {
        width: '100%',
        maxWidth: scaleX(303),
        minHeight: scaleY(52),
        borderRadius: 16,
        overflow: 'hidden',
    },
    googleButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: scaleY(14),
        paddingHorizontal: scaleX(24),
        borderRadius: 16,
        gap: 12,
    },
    googleButtonText: {
        fontSize: scaleFont(16),
        fontWeight: '600',
        color: '#1F1F1F',
    },
    googleLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        paddingVertical: scaleY(14),
        paddingHorizontal: scaleX(24),
        borderRadius: 16,
        gap: 12,
    },
    googleLoadingText: {
        color: '#00D4FF',
        fontSize: 16,
        fontWeight: '600',
    },
});
