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
    TextInput,
    KeyboardAvoidingView,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, fonts, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useAuthStore } from '../stores';
import { supabase } from '../services/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling — mirrors LoginScreen (Figma 375x822 baseline).
const scaleX = (size: number) => (SCREEN_WIDTH / 375) * size;
const scaleY = (size: number) => (SCREEN_HEIGHT / 822) * size;
const scaleFont = (size: number) => {
    const scale = Math.min(SCREEN_WIDTH / 375, SCREEN_HEIGHT / 822);
    return Math.round(size * scale);
};

// Eye / eye-off icon for the password visibility toggle (matches LoginScreen).
const EyeIcon = ({ visible }: { visible: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
            stroke={colors.textSecondary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M12 15a3 3 0 100-6 3 3 0 000 6z"
            stroke={colors.textSecondary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {!visible && (
            <Path
                d="M4 4l16 16"
                stroke={colors.textSecondary}
                strokeWidth={1.6}
                strokeLinecap="round"
            />
        )}
    </Svg>
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterScreen({
    navigation,
}: {
    navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const { login } = useAuthStore();

    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);

    // Maps Supabase Auth (GoTrue) messages to friendly Portuguese copy.
    const mapAuthError = (message: string): string => {
        const m = message.toLowerCase();
        if (m.includes('already registered') || m.includes('already exists')) {
            return 'Este e-mail já está cadastrado. Faça login.';
        }
        if (m.includes('password') && m.includes('6')) return 'A senha deve ter no mínimo 6 caracteres.';
        if (m.includes('weak') || m.includes('password')) return 'Senha muito fraca. Use ao menos 6 caracteres.';
        if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
        if (m.includes('network') || m.includes('unreachable') || m.includes('failed to fetch')) {
            return 'Sem conexão com o servidor. Tente novamente.';
        }
        return message || 'Não foi possível criar a conta. Tente novamente.';
    };

    const validate = (): string | null => {
        if (!name.trim()) return 'Informe seu nome.';
        if (!EMAIL_REGEX.test(email.trim())) return 'Informe um e-mail válido.';
        if (password.length < 6) return 'A senha deve ter no mínimo 6 caracteres.';
        if (password !== confirmPassword) return 'As senhas não coincidem.';
        return null;
    };

    const handleRegister = async () => {
        setError(null);
        setInfo(null);

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsLoading(true);
        try {
            console.log('[REGISTER] Creating account via Supabase...');
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: { data: { full_name: name.trim() } },
            });

            if (signUpError) {
                // Expected user-facing failures (email already registered, weak
                // password, etc.) — warn, not error, to avoid a red dev LogBox over
                // an already-handled message.
                console.warn('[REGISTER] Sign-up failed:', signUpError.message);
                setError(mapAuthError(signUpError.message));
                return;
            }

            // When "Confirm email" is OFF in Supabase, signUp returns a live
            // session → reuse the exact same backend login flow as social sign-in
            // (a DB trigger already created the public.users row), and AppNavigator
            // routes the fresh user straight into onboarding.
            if (data.session && data.user) {
                console.log('[REGISTER] Account created with session, userId:', data.user.id);
                await login(data.user.id);
                console.log('[REGISTER] Backend login complete — AppNavigator will auto-navigate');
                return;
            }

            // "Confirm email" is ON → no session yet. The user must confirm before
            // logging in. Surface that and send them back to the login screen.
            console.log('[REGISTER] Account created — email confirmation required');
            setInfo('Conta criada! Confirme seu e-mail e depois faça login.');
        } catch (err: unknown) {
            console.error('[REGISTER] Error:', err);
            setError(err instanceof Error ? mapAuthError(err.message) : 'Não foi possível criar a conta.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <StatusBar barStyle={getThemeStatusBarStyle()} translucent backgroundColor="transparent" />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingTop: insets.top + scaleY(25),
                        paddingBottom: insets.bottom + scaleY(40),
                    },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                {/* Title */}
                <View style={styles.titleSection}>
                    <Text style={styles.title}>
                        Criar sua{'\n'}
                        <Text style={styles.titleCyan}>conta</Text>
                    </Text>
                </View>

                {/* Form */}
                <View style={styles.formSection}>
                    {error && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}
                    {info && (
                        <View style={styles.infoContainer}>
                            <Text style={styles.infoText}>{info}</Text>
                        </View>
                    )}

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Nome</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="Seu nome"
                                placeholderTextColor={colors.textMuted}
                                value={name}
                                onChangeText={setName}
                                autoCapitalize="words"
                                autoCorrect={false}
                                textContentType="name"
                                editable={!isLoading}
                                returnKeyType="next"
                                accessibilityLabel="Campo de nome"
                            />
                        </View>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Email</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="seu@email.com"
                                placeholderTextColor={colors.textMuted}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                textContentType="emailAddress"
                                editable={!isLoading}
                                returnKeyType="next"
                                accessibilityLabel="Campo de e-mail"
                            />
                        </View>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Senha</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={[styles.input, styles.inputWithIcon]}
                                placeholder="Mínimo de 6 caracteres"
                                placeholderTextColor={colors.textMuted}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="newPassword"
                                editable={!isLoading}
                                returnKeyType="next"
                                accessibilityLabel="Campo de senha"
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword((v) => !v)}
                                style={styles.eyeButton}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                <EyeIcon visible={showPassword} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Confirmar senha</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="Repita a senha"
                                placeholderTextColor={colors.textMuted}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="newPassword"
                                editable={!isLoading}
                                returnKeyType="go"
                                onSubmitEditing={handleRegister}
                                accessibilityLabel="Campo de confirmação de senha"
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={handleRegister}
                        disabled={isLoading}
                        activeOpacity={0.8}
                        style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel="Criar conta"
                        accessibilityState={{ disabled: isLoading, busy: isLoading }}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color={semanticColors.textOnAccent} />
                        ) : (
                            <Text style={styles.primaryButtonText}>Criar conta</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        disabled={isLoading}
                        activeOpacity={0.8}
                        style={styles.secondaryButton}
                        accessibilityRole="button"
                        accessibilityLabel="Voltar"
                    >
                        <Text style={styles.secondaryButtonText}>Voltar</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    scrollContent: {
        flexGrow: 1,
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
        color: semanticColors.textPrimary,
        textAlign: 'left',
    },
    titleCyan: {
        color: semanticColors.accent,
    },
    formSection: {
        width: '100%',
        maxWidth: scaleX(303),
        alignSelf: 'center',
        gap: scaleY(16),
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        padding: 12,
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
    infoContainer: {
        backgroundColor: semanticColors.accentSubtle,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        width: '100%',
    },
    infoText: {
        color: colors.primary,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
    },
    fieldGroup: {
        gap: scaleY(8),
    },
    fieldLabel: {
        color: colors.textSecondary,
        fontSize: scaleFont(13),
        fontFamily: fonts.medium,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: scaleX(16),
        minHeight: scaleY(52),
    },
    input: {
        flex: 1,
        color: colors.text,
        fontSize: scaleFont(15),
        fontFamily: fonts.regular,
        paddingVertical: scaleY(14),
    },
    inputWithIcon: {
        paddingRight: scaleX(8),
    },
    eyeButton: {
        padding: scaleX(4),
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButton: {
        width: '100%',
        minHeight: scaleY(52),
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: scaleY(8),
    },
    primaryButtonDisabled: {
        opacity: 0.5,
    },
    primaryButtonText: {
        color: semanticColors.textOnAccent,
        fontSize: scaleFont(16),
        fontFamily: fonts.bold,
        fontWeight: '700',
    },
    secondaryButton: {
        width: '100%',
        minHeight: scaleY(52),
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    secondaryButtonText: {
        color: colors.textSecondary,
        fontSize: scaleFont(16),
        fontFamily: fonts.semibold,
        fontWeight: '600',
    },
}));
