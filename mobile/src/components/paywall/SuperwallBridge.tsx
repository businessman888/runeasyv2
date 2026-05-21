/**
 * SuperwallBridge — Componente "invisível" que conecta os hooks do Superwall
 * (useUser) ao authStore e ao subscriptionStore.
 *
 * Deve ser renderizado DENTRO do SuperwallProvider. Não renderiza nada na UI.
 *
 * Responsabilidades:
 *  1. Expor identify/signOut do Superwall ao authStore (login/logout).
 *  2. Espelhar o status de assinatura do app (`subscriptionStore.isProUser`) no
 *     Superwall via `setSubscriptionStatus`, assim que o SDK estiver configurado.
 *     O app roda em modo MANUAL de compras (CustomPurchaseControllerProvider em
 *     App.tsx); sem definir o status, o Superwall fica "UNKNOWN" e SEGURA todo
 *     paywall. Free → INACTIVE (apresenta), Pro → ACTIVE (pula). Setar aqui (no
 *     boot, quando configura) reduz a corrida no primeiro toque.
 */

import { useEffect } from 'react';
import { useUser, useSuperwall } from 'expo-superwall';
import { registerSuperwallHooks } from '../../stores/authStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';

const PRO_ENTITLEMENT_ID = 'pro';

export function SuperwallBridge() {
    const { identify, signOut, setSubscriptionStatus } = useUser();
    const isConfigured = useSuperwall((s) => s.isConfigured);
    const isProUser = useSubscriptionStore((s) => s.isProUser);

    useEffect(() => {
        registerSuperwallHooks(
            async (userId: string) => {
                await identify(userId);
            },
            async () => {
                await signOut();
            },
        );
    }, [identify, signOut]);

    // Só seta depois de configurado (antes disso o SDK lança "not configured").
    // Reage também a DevMenu (Forçar Free/Pro), fetchSubscription e RevenueCat.
    useEffect(() => {
        if (!isConfigured) return;
        const status = isProUser
            ? { status: 'ACTIVE' as const, entitlements: [{ id: PRO_ENTITLEMENT_ID, type: 'SERVICE_LEVEL' as const }] }
            : { status: 'INACTIVE' as const };
        void setSubscriptionStatus(status);
    }, [isConfigured, isProUser, setSubscriptionStatus]);

    return null;
}
