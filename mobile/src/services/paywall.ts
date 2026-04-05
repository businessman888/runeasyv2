/**
 * Paywall Service — Superwall + RevenueCat
 *
 * Centraliza toda a lógica de inicialização, identificação de usuário,
 * registro de placements e sincronização de assinatura.
 *
 * Dependências:
 *   - expo-superwall (SuperwallProvider, useUser, useSuperwall)
 *   - react-native-purchases (RevenueCat)
 */

import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesEntitlementInfo,
} from 'react-native-purchases';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SUPERWALL_API_KEY = process.env.EXPO_PUBLIC_SUPERWALL_API_KEY ?? '';

/**
 * Chaves públicas do RevenueCat.
 * Substitua pelos valores reais quando configurar no dashboard.
 */
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';

/** Nome do entitlement configurado no RevenueCat Dashboard */
const PRO_ENTITLEMENT_ID = 'pro';

const IS_DEV = __DEV__;

// ─────────────────────────────────────────────
// RevenueCat — Initialization
// ─────────────────────────────────────────────

let revenueCatInitialized = false;

/**
 * Inicializa o SDK do RevenueCat com a chave da plataforma.
 * Deve ser chamado uma única vez no startup do app (ex: _layout.tsx).
 */
export async function initializeRevenueCat(): Promise<void> {
  if (revenueCatInitialized) {
    console.log('[Paywall] RevenueCat já inicializado');
    return;
  }

  const apiKey = Platform.OS === 'ios'
    ? REVENUECAT_API_KEY_IOS
    : REVENUECAT_API_KEY_ANDROID;

  if (!apiKey) {
    console.warn('[Paywall] Chave do RevenueCat não configurada para', Platform.OS);
    return;
  }

  try {
    Purchases.configure({ apiKey });

    if (IS_DEV) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
      console.log('[Paywall] RevenueCat configurado em modo DEBUG');
    }

    revenueCatInitialized = true;
    console.log('[Paywall] RevenueCat inicializado com sucesso');
  } catch (error) {
    console.error('[Paywall] Erro ao inicializar RevenueCat:', error);
  }
}

// ─────────────────────────────────────────────
// RevenueCat — User Identification
// ─────────────────────────────────────────────

/**
 * Vincula o userId interno ao RevenueCat para sincronizar
 * assinaturas entre dispositivos.
 */
export async function identifyRevenueCatUser(userId: string): Promise<void> {
  if (!revenueCatInitialized) {
    console.warn('[Paywall] RevenueCat não inicializado — identify ignorado');
    return;
  }

  try {
    const { customerInfo } = await Purchases.logIn(userId);
    console.log('[Paywall] RevenueCat identify OK — userId:', userId);
    console.log('[Paywall] Entitlements ativos:', Object.keys(customerInfo.entitlements.active));
  } catch (error) {
    console.error('[Paywall] Erro ao identificar no RevenueCat:', error);
  }
}

/**
 * Remove a identidade do usuário no RevenueCat (logout).
 */
export async function logoutRevenueCat(): Promise<void> {
  if (!revenueCatInitialized) return;

  try {
    await Purchases.logOut();
    console.log('[Paywall] RevenueCat logout OK');
  } catch (error) {
    console.error('[Paywall] Erro ao logout do RevenueCat:', error);
  }
}

// ─────────────────────────────────────────────
// RevenueCat — Subscription Status
// ─────────────────────────────────────────────

/**
 * Verifica se o usuário possui o entitlement "pro" ativo.
 * Retorna { isPro, customerInfo } para uso no authStore.
 */
export async function checkProStatus(): Promise<{
  isPro: boolean;
  customerInfo: CustomerInfo | null;
}> {
  if (!revenueCatInitialized) {
    return { isPro: false, customerInfo: null };
  }

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const proEntitlement: PurchasesEntitlementInfo | undefined =
      customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];

    const isPro = proEntitlement !== undefined;

    if (IS_DEV) {
      console.log('[Paywall] Status Pro:', isPro);
      console.log('[Paywall] Entitlements ativos:', Object.keys(customerInfo.entitlements.active));
    }

    return { isPro, customerInfo };
  } catch (error) {
    console.error('[Paywall] Erro ao verificar status Pro:', error);
    return { isPro: false, customerInfo: null };
  }
}

/**
 * Registra um listener para mudanças de assinatura em tempo real.
 * Retorna uma função para remover o listener.
 */
export function addSubscriptionListener(
  onUpdate: (isPro: boolean, customerInfo: CustomerInfo) => void,
): () => void {
  if (!revenueCatInitialized) {
    console.warn('[Paywall] RevenueCat não inicializado — listener ignorado');
    return () => {};
  }

  const listener = (customerInfo: CustomerInfo) => {
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    console.log('[Paywall] Subscription update — isPro:', isPro);
    onUpdate(isPro, customerInfo);
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

// ─────────────────────────────────────────────
// Superwall — Config & Placements
// ─────────────────────────────────────────────

/**
 * Retorna a chave de API do Superwall.
 * Usada no SuperwallProvider no _layout.tsx.
 */
export function getSuperwallApiKey(): string {
  if (!SUPERWALL_API_KEY) {
    console.warn('[Paywall] EXPO_PUBLIC_SUPERWALL_API_KEY não definida');
  }
  return SUPERWALL_API_KEY;
}

/**
 * Nomes dos placements registrados no Superwall Dashboard.
 * Centralizados aqui para evitar strings mágicas.
 */
export const PAYWALL_PLACEMENTS = {
  /** Exibido ao final do quiz de onboarding (18 etapas) */
  ONBOARDING_COMPLETE: 'onboarding_complete',

  /** Exibido ao tentar visualizar um plano de treino detalhado */
  VIEW_TRAINING_PLAN: 'view_training_plan',
} as const;

export type PaywallPlacement = (typeof PAYWALL_PLACEMENTS)[keyof typeof PAYWALL_PLACEMENTS];
