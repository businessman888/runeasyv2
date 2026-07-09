import React from 'react';
import { Platform } from 'react-native';
import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../stores';
import { supabase } from '../services/supabase';
import { BASE_API_URL } from '../config/api.config';

/**
 * useAuthActions — the auth LOGIC layer for the login/signup card.
 *
 * The handlers below were lifted VERBATIM from the previous `LoginScreen` and
 * `RegisterScreen` (Apple/Google/email sign-in + email sign-up). Nothing about
 * the auth flow changed: same Supabase / backend calls, same order, same
 * params, same best-effort session persistence. They live here only so the new
 * `AuthScreen` can be pure presentation (frontend-mobile skill: separate logic
 * from UI). If a change here would alter the auth flow, STOP — that's out of
 * scope for this redesign.
 */

// Configure Google Sign-In once at module load (was at the top of LoginScreen).
GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    offlineAccess: true,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterFields {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export function useAuthActions() {
    const { login } = useAuthStore();

    const [error, setError] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);

    // Per-method loading flags (mirrors the previous screens exactly).
    const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
    const [isAppleLoading, setIsAppleLoading] = React.useState(false);
    const [isEmailLoading, setIsEmailLoading] = React.useState(false);
    const [isRegisterLoading, setIsRegisterLoading] = React.useState(false);

    const anyLoading =
        isGoogleLoading || isAppleLoading || isEmailLoading || isRegisterLoading;

    const clearMessages = React.useCallback(() => {
        setError(null);
        setInfo(null);
    }, []);

    // ── Error copy mappers (verbatim from the old screens) ──────────────────
    const getErrorMessage = (errorCode: string): string => {
        const messages: Record<string, string> = {
            auth_failed: 'Falha na autenticação. Tente novamente.',
            sign_in_cancelled: 'Login cancelado.',
            in_progress: 'Login já em andamento.',
            play_services: 'Google Play Services indisponível.',
        };
        return messages[errorCode] || 'Erro desconhecido. Tente novamente.';
    };

    // Maps Supabase Auth (GoTrue) messages to friendly Portuguese copy (sign-in).
    const mapSignInError = (message: string): string => {
        const m = message.toLowerCase();
        if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
        if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
        if (m.includes('user not found')) return 'Conta não encontrada. Verifique o e-mail ou crie uma conta.';
        if (m.includes('network') || m.includes('unreachable') || m.includes('failed to fetch')) {
            return 'Sem conexão com o servidor. Tente novamente.';
        }
        return message || getErrorMessage('auth_failed');
    };

    // Maps Supabase Auth (GoTrue) messages to friendly Portuguese copy (sign-up).
    const mapSignUpError = (message: string): string => {
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

    // ── Email / password SIGN IN (verbatim from LoginScreen.handleEmailLogin) ─
    const handleEmailLogin = async (email: string, password: string) => {
        setError(null);

        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
            setError('Preencha e-mail e senha.');
            return;
        }

        setIsEmailLoading(true);
        try {
            console.log('[LOGIN] Starting email/password sign-in...');
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: trimmedEmail,
                password,
            });

            if (signInError) {
                console.warn('[LOGIN] Email sign-in failed:', signInError.message);
                setError(mapSignInError(signInError.message));
                return;
            }

            if (!data.session || !data.user) {
                setError('Não foi possível iniciar a sessão. Tente novamente.');
                return;
            }

            console.log('[LOGIN] Email auth successful, userId:', data.user.id);
            await login(data.user.id);
            console.log('[LOGIN] Backend login complete — AppNavigator will auto-navigate');
        } catch (err: unknown) {
            console.error('[LOGIN] Email error:', err);
            setError(err instanceof Error ? mapSignInError(err.message) : getErrorMessage('auth_failed'));
        } finally {
            setIsEmailLoading(false);
        }
    };

    // ── Google OAuth (verbatim from LoginScreen.handleGoogleLogin) ──────────
    const handleGoogleLogin = async () => {
        setError(null);
        setIsGoogleLoading(true);

        try {
            console.log('[LOGIN] Starting Google Sign-In...');

            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

            const signInResult = await GoogleSignin.signIn();
            console.log('[LOGIN] Google Sign-In successful');

            const idToken = signInResult.data?.idToken;
            if (!idToken) {
                throw new Error('No idToken returned from Google Sign-In');
            }

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

            // Persist the session locally — BEST-EFFORT and NON-BLOCKING (direct
            // Supabase call; awaiting it can hang login on some networks — the
            // backend already validated the token and cold-start falls back to
            // the stored userId).
            void supabase.auth
                .setSession({
                    access_token: authData.session.access_token,
                    refresh_token: authData.session.refresh_token,
                })
                .catch(() => {
                    console.warn('[LOGIN] Local session persist skipped (Supabase unreachable)');
                });

            console.log('[LOGIN] Auth successful, userId:', authData.user.id);
            const data = { user: authData.user, session: authData.session };

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
            setIsGoogleLoading(false);
        }
    };

    // ── Sign in with Apple (verbatim from LoginScreen.handleAppleLogin) ─────
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
                body: JSON.stringify({ idToken: identityToken, nonce: rawNonce, fullName: displayName }),
            });

            if (!authResponse.ok) {
                const errorBody = await authResponse.text();
                console.error('[LOGIN] Backend auth error:', errorBody);
                throw new Error('Falha na autenticação. Tente novamente.');
            }

            const authData = await authResponse.json();

            // Persist the session locally — BEST-EFFORT and NON-BLOCKING.
            void supabase.auth
                .setSession({
                    access_token: authData.session.access_token,
                    refresh_token: authData.session.refresh_token,
                })
                .then(() => {
                    // 5. Update user metadata with fullName if available (first login
                    // only). Also best-effort; the backend is the source of truth.
                    if (displayName) {
                        return supabase.auth.updateUser({ data: { full_name: displayName } });
                    }
                })
                .catch(() => {
                    console.warn('[LOGIN] Local session persist skipped (Supabase unreachable)');
                });

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

    // ── Email / password SIGN UP (verbatim from RegisterScreen.handleRegister) ─
    const validateRegister = (fields: RegisterFields): string | null => {
        if (!fields.name.trim()) return 'Informe seu nome.';
        if (!EMAIL_REGEX.test(fields.email.trim())) return 'Informe um e-mail válido.';
        if (fields.password.length < 6) return 'A senha deve ter no mínimo 6 caracteres.';
        if (fields.password !== fields.confirmPassword) return 'As senhas não coincidem.';
        return null;
    };

    const handleRegister = async (fields: RegisterFields) => {
        setError(null);
        setInfo(null);

        const validationError = validateRegister(fields);
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsRegisterLoading(true);
        try {
            console.log('[REGISTER] Creating account via Supabase...');
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: fields.email.trim(),
                password: fields.password,
                options: { data: { full_name: fields.name.trim() } },
            });

            if (signUpError) {
                console.warn('[REGISTER] Sign-up failed:', signUpError.message);
                setError(mapSignUpError(signUpError.message));
                return;
            }

            // "Confirm email" OFF → live session → reuse the same backend login flow.
            if (data.session && data.user) {
                console.log('[REGISTER] Account created with session, userId:', data.user.id);
                await login(data.user.id);
                console.log('[REGISTER] Backend login complete — AppNavigator will auto-navigate');
                return;
            }

            // "Confirm email" ON → no session yet. Surface the confirm-email message.
            console.log('[REGISTER] Account created — email confirmation required');
            setInfo('Conta criada! Confirme seu e-mail e depois faça login.');
        } catch (err: unknown) {
            console.error('[REGISTER] Error:', err);
            setError(err instanceof Error ? mapSignUpError(err.message) : 'Não foi possível criar a conta.');
        } finally {
            setIsRegisterLoading(false);
        }
    };

    return {
        // messages
        error,
        info,
        setError,
        setInfo,
        clearMessages,
        // loading flags
        isGoogleLoading,
        isAppleLoading,
        isEmailLoading,
        isRegisterLoading,
        anyLoading,
        // Apple button is iOS-only, per Apple guidelines / current behaviour.
        appleAvailable: Platform.OS === 'ios',
        // handlers
        handleEmailLogin,
        handleGoogleLogin,
        handleAppleLogin,
        handleRegister,
    };
}
