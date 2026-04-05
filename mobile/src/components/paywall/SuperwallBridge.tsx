/**
 * SuperwallBridge — Componente "invisível" que conecta
 * os hooks do Superwall (useUser) ao authStore.
 *
 * Deve ser renderizado DENTRO do SuperwallProvider.
 * Não renderiza nada na UI.
 */

import { useEffect } from 'react';
import { useUser } from 'expo-superwall';
import { registerSuperwallHooks } from '../../stores/authStore';

export function SuperwallBridge() {
    const { identify, signOut } = useUser();

    useEffect(() => {
        // Registra as funções do Superwall no authStore
        // para que o login/logout possam chamar identify/signOut
        registerSuperwallHooks(
            async (userId: string) => {
                await identify(userId);
                console.log('[SuperwallBridge] identify chamado para:', userId);
            },
            async () => {
                await signOut();
                console.log('[SuperwallBridge] signOut chamado');
            },
        );
    }, [identify, signOut]);

    return null;
}
