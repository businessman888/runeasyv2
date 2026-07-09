import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    StatusBar,
    Image,
    Linking,
    AccessibilityInfo,
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, spacing, borderRadius } from '../../theme';
import { useAuthActions } from '../../hooks/useAuthActions';
import { AuthBackground } from '../../components/auth/AuthBackground';
import { GlassSurface } from '../../components/ui/GlassSurface';
import {
    GoogleIcon,
    EyeIcon,
    BackIcon,
    MailIcon,
} from '../../components/auth/AuthIcons';

/**
 * AuthScreen — single glass card with three states (method → email → signup).
 *
 * Replaces the previous two-screen Login/Register flow. The card transforms in
 * place (the user never changes screens); its height springs to fit the active
 * state's content and the content cross-fades. All auth logic lives in
 * [useAuthActions] — this file is presentation only (frontend-mobile skill).
 *
 * Design anchored to apple-hig-design: one glass layer ([GlassSurface] material,
 * reused from the tab bar), brand cyan reserved for primary actions, spring
 * motion, ≥44pt touch targets, and a reduce-motion path (crossfade, no height
 * animation). See the redesign plan for the full rationale.
 */

const HEADER_LOGO = require('../../assets/images/lpLogoRuneasyHeader.png');

const TERMS_URL = 'https://runeasy.com.br/termos.html';
const PRIVACY_URL = 'https://runeasy.com.br/privacidade.html';

// "Padrão, equilibrado" spring from apple-hig-design/references/motion.md.
const CARD_SPRING = { damping: 20, stiffness: 190 } as const;

type AuthMode = 'method' | 'email' | 'signup';

export function AuthScreen() {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const cardMaxWidth = Math.min(width - spacing.xl * 2, 420);

    const auth = useAuthActions();

    const [mode, setMode] = React.useState<AuthMode>('method');

    // Form fields (email shared between login & signup for convenience).
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [name, setName] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);

    // Reduce-motion: degrade transitions to a plain crossfade with no height anim.
    const [reduceMotion, setReduceMotion] = React.useState(false);
    React.useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
        const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);

    // ── Animated card height (springs to fit the active state's content) ────
    const cardHeight = useSharedValue(0);
    const [measuredOnce, setMeasuredOnce] = React.useState(false);
    const animateHeight = measuredOnce && !reduceMotion;

    const cardBodyStyle = useAnimatedStyle(() => ({
        height: animateHeight ? withSpring(cardHeight.value, CARD_SPRING) : cardHeight.value,
    }));

    const onContentLayout = React.useCallback(
        (e: LayoutChangeEvent) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) {
                cardHeight.value = h;
                if (!measuredOnce) setMeasuredOnce(true);
            }
        },
        [cardHeight, measuredOnce],
    );

    const goTo = React.useCallback(
        (next: AuthMode) => {
            auth.clearMessages();
            setMode(next);
        },
        [auth],
    );

    const openTerms = React.useCallback(() => Linking.openURL(TERMS_URL), []);
    const openPrivacy = React.useCallback(() => Linking.openURL(PRIVACY_URL), []);

    // ── Shared sub-views ────────────────────────────────────────────────────
    // NOTE: these are invoked as functions ({renderX()}), NOT rendered as
    // <X/> components. Rendering a component defined inline as JSX remounts it
    // every render (new function identity each time) — which would drop the
    // TextInput's focus on every keystroke. Calling them keeps the elements
    // reconciled by position, preserving focus.
    const renderMessages = () => (
        <>
            {auth.error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText} allowFontScaling maxFontSizeMultiplier={1.3}>
                        {auth.error}
                    </Text>
                </View>
            )}
            {auth.info && (
                <View style={styles.infoContainer}>
                    <Text style={styles.infoText} allowFontScaling maxFontSizeMultiplier={1.3}>
                        {auth.info}
                    </Text>
                </View>
            )}
        </>
    );

    const renderBackControl = (to: AuthMode) => (
        <TouchableOpacity
            onPress={() => goTo(to)}
            disabled={auth.anyLoading}
            style={styles.backControl}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
        >
            <BackIcon />
            <Text style={styles.backText} allowFontScaling maxFontSizeMultiplier={1.2}>
                Voltar
            </Text>
        </TouchableOpacity>
    );

    const renderPasswordField = ({
        value,
        onChangeText,
        placeholder,
        label,
        textContentType,
        returnKeyType,
        onSubmitEditing,
    }: {
        value: string;
        onChangeText: (t: string) => void;
        placeholder: string;
        label: string;
        textContentType: 'password' | 'newPassword';
        returnKeyType?: 'next' | 'go';
        onSubmitEditing?: () => void;
    }) => (
        <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel} allowFontScaling maxFontSizeMultiplier={1.2}>
                {label}
            </Text>
            <View style={styles.inputWrapper}>
                <TextInput
                    style={[styles.input, styles.inputWithIcon]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textMuted}
                    value={value}
                    onChangeText={onChangeText}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType={textContentType}
                    editable={!auth.anyLoading}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    accessibilityLabel={label}
                />
                <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eyeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                    <EyeIcon visible={showPassword} />
                </TouchableOpacity>
            </View>
        </View>
    );

    // ── State 1: method choice ──────────────────────────────────────────────
    const renderMethod = () => (
        <View style={styles.stateContent}>
            <Image
                source={HEADER_LOGO}
                style={styles.logo}
                resizeMode="contain"
                accessibilityRole="image"
                accessibilityLabel="RunEasy"
            />
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
                Vamos correr juntos
            </Text>
            <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                Crie sua conta ou entre gratuitamente
            </Text>

            <View style={styles.messagesSlot}>
                {renderMessages()}
            </View>

            <View style={styles.buttonStack}>
                {/* Apple — iOS only, first, per Apple guidelines. Native button keeps
                    us compliant (title + logo unaltered); only radius/height tuned. */}
                {auth.appleAvailable && (
                    <View style={styles.providerButton}>
                        {auth.isAppleLoading ? (
                            <View style={[styles.providerButton, styles.appleLoading]}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text style={styles.appleLoadingText}>Conectando...</Text>
                            </View>
                        ) : (
                            <AppleAuthentication.AppleAuthenticationButton
                                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                                cornerRadius={borderRadius.xl}
                                style={styles.appleButton}
                                onPress={auth.handleAppleLogin}
                            />
                        )}
                    </View>
                )}

                {/* Google — colored "G" on white (branding compliance). */}
                <TouchableOpacity
                    onPress={auth.handleGoogleLogin}
                    disabled={auth.anyLoading}
                    activeOpacity={0.85}
                    style={[styles.providerButton, styles.googleButton]}
                    accessibilityRole="button"
                    accessibilityLabel="Continuar com Google"
                    accessibilityState={{ disabled: auth.anyLoading, busy: auth.isGoogleLoading }}
                >
                    {auth.isGoogleLoading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                        <>
                            <GoogleIcon />
                            <Text style={styles.googleText} allowFontScaling maxFontSizeMultiplier={1.2}>
                                Continuar com Google
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Email — same size as the social buttons, subtler surface so the
                    branded providers stay at least as prominent (compliance). */}
                <TouchableOpacity
                    onPress={() => goTo('email')}
                    disabled={auth.anyLoading}
                    activeOpacity={0.85}
                    style={[styles.providerButton, styles.emailProviderButton]}
                    accessibilityRole="button"
                    accessibilityLabel="Continuar com e-mail"
                >
                    <MailIcon color={colors.text} />
                    <Text style={styles.emailProviderText} allowFontScaling maxFontSizeMultiplier={1.2}>
                        Continuar com e-mail
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Terms + Privacy — mandatory (Apple rejected a prior build without them). */}
            <View style={styles.legalBlock}>
                <Text style={styles.legalIntro} allowFontScaling maxFontSizeMultiplier={1.2}>
                    Ao continuar, você concorda com
                </Text>
                <View style={styles.legalLinksRow}>
                    <TouchableOpacity
                        onPress={openTerms}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="link"
                        accessibilityLabel="Abrir Termos de Uso"
                    >
                        <Text style={styles.legalLink} allowFontScaling maxFontSizeMultiplier={1.2}>
                            Termos de Uso
                        </Text>
                    </TouchableOpacity>
                    <Text style={styles.legalSep}>e</Text>
                    <TouchableOpacity
                        onPress={openPrivacy}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        accessibilityRole="link"
                        accessibilityLabel="Abrir Política de Privacidade"
                    >
                        <Text style={styles.legalLink} allowFontScaling maxFontSizeMultiplier={1.2}>
                            Política de Privacidade
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    // ── State 2: email login ────────────────────────────────────────────────
    const renderEmail = () => (
        <View style={styles.stateContent}>
            {renderBackControl('method')}
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
                Entrar
            </Text>

            <View style={styles.messagesSlot}>
                {renderMessages()}
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
                        editable={!auth.anyLoading}
                        returnKeyType="next"
                        accessibilityLabel="Campo de e-mail"
                    />
                </View>
            </View>

            {renderPasswordField({
                label: 'Senha',
                placeholder: 'Sua senha',
                value: password,
                onChangeText: setPassword,
                textContentType: 'password',
                returnKeyType: 'go',
                onSubmitEditing: () => auth.handleEmailLogin(email, password),
            })}

            <TouchableOpacity
                onPress={() => auth.handleEmailLogin(email, password)}
                disabled={auth.anyLoading}
                activeOpacity={0.85}
                style={[styles.primaryButton, auth.anyLoading && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Entrar"
                accessibilityState={{ disabled: auth.anyLoading, busy: auth.isEmailLoading }}
            >
                {auth.isEmailLoading ? (
                    <ActivityIndicator size="small" color={colors.background} />
                ) : (
                    <Text style={styles.primaryButtonText} allowFontScaling maxFontSizeMultiplier={1.2}>
                        Entrar
                    </Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => goTo('signup')}
                disabled={auth.anyLoading}
                style={styles.switchLink}
                accessibilityRole="button"
                accessibilityLabel="Criar conta"
            >
                <Text style={styles.switchLinkText} allowFontScaling maxFontSizeMultiplier={1.2}>
                    Não tem conta? <Text style={styles.switchLinkAccent}>Criar conta</Text>
                </Text>
            </TouchableOpacity>
        </View>
    );

    // ── State 3: create account ─────────────────────────────────────────────
    const renderSignup = () => (
        <View style={styles.stateContent}>
            {renderBackControl('email')}
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
                Criar conta
            </Text>

            <View style={styles.messagesSlot}>
                {renderMessages()}
            </View>

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
                        editable={!auth.anyLoading}
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
                        editable={!auth.anyLoading}
                        returnKeyType="next"
                        accessibilityLabel="Campo de e-mail"
                    />
                </View>
            </View>

            {renderPasswordField({
                label: 'Senha',
                placeholder: 'Mínimo de 6 caracteres',
                value: password,
                onChangeText: setPassword,
                textContentType: 'newPassword',
                returnKeyType: 'next',
            })}

            {renderPasswordField({
                label: 'Confirmar senha',
                placeholder: 'Repita a senha',
                value: confirmPassword,
                onChangeText: setConfirmPassword,
                textContentType: 'newPassword',
                returnKeyType: 'go',
                onSubmitEditing: () =>
                    auth.handleRegister({ name, email, password, confirmPassword }),
            })}

            <TouchableOpacity
                onPress={() => auth.handleRegister({ name, email, password, confirmPassword })}
                disabled={auth.anyLoading}
                activeOpacity={0.85}
                style={[styles.primaryButton, auth.anyLoading && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Criar conta"
                accessibilityState={{ disabled: auth.anyLoading, busy: auth.isRegisterLoading }}
            >
                {auth.isRegisterLoading ? (
                    <ActivityIndicator size="small" color={colors.background} />
                ) : (
                    <Text style={styles.primaryButtonText} allowFontScaling maxFontSizeMultiplier={1.2}>
                        Criar conta
                    </Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => goTo('email')}
                disabled={auth.anyLoading}
                style={styles.switchLink}
                accessibilityRole="button"
                accessibilityLabel="Entrar"
            >
                <Text style={styles.switchLinkText} allowFontScaling maxFontSizeMultiplier={1.2}>
                    Já tem conta? <Text style={styles.switchLinkAccent}>Entrar</Text>
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderContent = () => {
        if (mode === 'email') return renderEmail();
        if (mode === 'signup') return renderSignup();
        return renderMethod();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <AuthBackground />

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        {
                            paddingTop: insets.top + spacing.xl,
                            paddingBottom: insets.bottom + spacing['2xl'],
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    <GlassSurface radius={borderRadius['3xl']} intensity={40} style={{ width: cardMaxWidth }}>
                        <Animated.View style={[styles.cardBody, cardBodyStyle]}>
                            <Animated.View
                                key={mode}
                                onLayout={onContentLayout}
                                entering={animateHeight ? FadeIn.duration(200) : undefined}
                                exiting={animateHeight ? FadeOut.duration(140) : undefined}
                                style={styles.measure}
                            >
                                {renderContent()}
                            </Animated.View>
                        </Animated.View>
                    </GlassSurface>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    flex: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },

    // Card body: height is animated to fit content; the measured content is
    // absolutely positioned so its intrinsic height drives the spring.
    cardBody: {
        width: '100%',
        overflow: 'hidden',
    },
    measure: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: spacing.xl,
    },
    stateContent: {
        width: '100%',
        gap: spacing.base,
    },

    logo: {
        height: 34,
        width: 150,
        alignSelf: 'center',
        marginBottom: spacing.xs,
    },
    title: {
        fontFamily: fonts.bold,
        fontSize: 24,
        lineHeight: 30,
        color: colors.text,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: fonts.regular,
        fontSize: 15,
        lineHeight: 20,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: -spacing.sm,
    },

    messagesSlot: {
        width: '100%',
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        width: '100%',
    },
    errorText: {
        color: colors.error,
        textAlign: 'center',
        fontSize: 13,
        fontFamily: fonts.medium,
    },
    infoContainer: {
        backgroundColor: 'rgba(0, 212, 255, 0.12)',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        width: '100%',
    },
    infoText: {
        color: colors.primary,
        textAlign: 'center',
        fontSize: 13,
        fontFamily: fonts.medium,
    },

    // Provider buttons — all share height/radius (equal visual weight).
    buttonStack: {
        width: '100%',
        gap: spacing.md,
    },
    providerButton: {
        width: '100%',
        height: 52,
        borderRadius: borderRadius.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        overflow: 'hidden',
    },
    appleButton: {
        width: '100%',
        height: 52,
    },
    appleLoading: {
        backgroundColor: '#000000',
    },
    appleLoadingText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: fonts.semibold,
    },
    googleButton: {
        backgroundColor: '#FFFFFF',
    },
    googleText: {
        color: '#1F1F1F',
        fontSize: 16,
        fontFamily: fonts.semibold,
    },
    emailProviderButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: colors.border,
    },
    emailProviderText: {
        color: colors.text,
        fontSize: 16,
        fontFamily: fonts.semibold,
    },

    // Back control (email/signup states).
    backControl: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: spacing.xs,
        minHeight: 44,
        paddingRight: spacing.sm,
    },
    backText: {
        color: colors.textSecondary,
        fontSize: 15,
        fontFamily: fonts.medium,
    },

    // Fields.
    fieldGroup: {
        width: '100%',
        gap: spacing.sm,
    },
    fieldLabel: {
        color: colors.textSecondary,
        fontSize: 13,
        fontFamily: fonts.medium,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(10, 10, 24, 0.55)',
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.base,
        minHeight: 52,
    },
    input: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
        fontFamily: fonts.regular,
        paddingVertical: spacing.md,
    },
    inputWithIcon: {
        paddingRight: spacing.sm,
    },
    eyeButton: {
        padding: spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Primary CTA (cyan — reserved for the primary action of the state).
    primaryButton: {
        width: '100%',
        height: 52,
        borderRadius: borderRadius.xl,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.xs,
    },
    primaryButtonText: {
        color: colors.background,
        fontSize: 16,
        fontFamily: fonts.bold,
    },
    disabled: {
        opacity: 0.5,
    },

    switchLink: {
        alignSelf: 'center',
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    switchLinkText: {
        color: colors.textSecondary,
        fontSize: 14,
        fontFamily: fonts.regular,
    },
    switchLinkAccent: {
        color: colors.primary,
        fontFamily: fonts.semibold,
    },

    // Legal (Terms + Privacy) — required in the method state.
    legalBlock: {
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: spacing.xs,
    },
    legalIntro: {
        color: colors.textMuted,
        fontSize: 12,
        fontFamily: fonts.regular,
        textAlign: 'center',
    },
    legalLinksRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    legalLink: {
        color: colors.textSecondary,
        fontSize: 12,
        fontFamily: fonts.semibold,
        textDecorationLine: 'underline',
    },
    legalSep: {
        color: colors.textMuted,
        fontSize: 12,
        fontFamily: fonts.regular,
    },
});

export default AuthScreen;
