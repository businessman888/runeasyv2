/**
 * Single source of truth for the wearable-connection UX.
 *
 * Each provider maps to: the brand logo (Profile device row), the hero
 * illustration + step-by-step instructions (DeviceConnect pre-connection
 * screen) and the CTA label. Used by `DeviceRow`, `DeviceConnectScreen` and
 * `useWearableConnection` so copy/assets never get hardcoded per-screen.
 */

import type { ImageSourcePropType } from 'react-native';

export type WearableProvider =
    | 'apple'
    | 'appleWatch'
    | 'healthConnect'
    | 'garmin'
    | 'polar'
    | 'fitbit';

export type DevicePlatform = 'ios' | 'android';

export interface WearableConfig {
    provider: WearableProvider;
    /** Short brand name shown in the Profile device row. */
    rowLabel: string;
    /** Brand logo (square) — shown at the left of the device row. */
    logo: ImageSourcePropType;
    /** Device illustration — shown at the top of the pre-connection screen. */
    hero: ImageSourcePropType;
    /** Pre-connection screen title. */
    title: string;
    /** Step-by-step instructions (bullets). */
    bullets: string[];
    /** Primary CTA label while disconnected. */
    connectLabel: string;
    /** Platforms where the integration is offered. */
    platforms: DevicePlatform[];
}

export const WEARABLES: Record<WearableProvider, WearableConfig> = {
    apple: {
        provider: 'apple',
        rowLabel: 'Apple Watch',
        logo: require('../assets/images/wearablesLogo/logoApple.png'),
        hero: require('../assets/images/wearables/appleWatch.png'),
        title: 'Vincule seu Apple Watch via Apple Saúde',
        bullets: [
            'Conceda acesso de leitura para o RunEasy dentro do aplicativo Saúde (HealthKit) do seu iPhone.',
            'Monitore suas corridas utilizando o aplicativo nativo de Exercícios do Apple Watch.',
            'Seus dados de GPS, zonas de frequência cardíaca e ritmo serão importados localmente e de forma totalmente segura.',
            'A sincronização ocorre de forma passiva assim que o aplicativo RunEasy é aberto em primeiro plano.',
        ],
        connectLabel: 'Conectar Apple Saúde',
        platforms: ['ios'],
    },

    // Onboarding-only Apple variant: the WatchConnectivity companion app
    // (distinct from `apple`/HealthKit used in the Profile).
    appleWatch: {
        provider: 'appleWatch',
        rowLabel: 'Apple Watch',
        logo: require('../assets/images/wearablesLogo/logoApple.png'),
        hero: require('../assets/images/wearables/appleWatch.png'),
        title: 'Conecte seu Apple Watch',
        bullets: [
            'Pareie seu Apple Watch ao iPhone pelo aplicativo Watch da Apple.',
            'Instale o app complementar RunEasy no seu Apple Watch pela App Store do relógio.',
            'Inicie suas corridas pelo app RunEasy no relógio para capturar GPS, ritmo e frequência cardíaca.',
            'Ao terminar, o treino é enviado automaticamente para o celular, calculando seu XP e gerando a análise da IA.',
        ],
        connectLabel: 'Conectar Apple Watch',
        platforms: ['ios'],
    },

    healthConnect: {
        provider: 'healthConnect',
        rowLabel: 'Galaxy Watch',
        logo: require('../assets/images/wearablesLogo/logoSamsungHealth.png'),
        hero: require('../assets/images/wearables/galaxyWatch.png'),
        title: 'Conecte seu Galaxy Watch via Health Connect',
        bullets: [
            'Certifique-se de que o seu aplicativo Samsung Health está configurado para exportar dados para o Health Connect.',
            'Conceda as permissões de leitura de exercícios, distância e frequência cardíaca solicitadas pelo RunEasy.',
            'Corra livremente utilizando o aplicativo nativo de treinos do seu Galaxy Watch (Wear OS).',
            'Sempre que você abrir o RunEasy no celular, os treinos recentes serão capturados em segundo plano e reconciliados com a sua planilha.',
        ],
        connectLabel: 'Ativar Health Connect',
        platforms: ['android'],
    },

    garmin: {
        provider: 'garmin',
        rowLabel: 'Garmin',
        logo: require('../assets/images/wearablesLogo/logoGarminn.png'),
        hero: require('../assets/images/wearables/garmin.png'),
        title: 'Sincronize seu plano com o seu Garmin',
        bullets: [
            'Instale o aplicativo complementar RunEasy no seu relógio através da loja Garmin Connect IQ.',
            'Seus treinos planejados serão enviados diretamente para o visor do relógio via Bluetooth, sem depender de cabos.',
            'Corra utilizando o app RunEasy no relógio para receber orientações visuais e alertas de ritmo (pace) em tempo real.',
            'Ao terminar a corrida, o treino é transmitido de volta para o celular automaticamente, calculando seus pontos de XP e gerando a análise da IA.',
        ],
        connectLabel: 'Conectar ao Garmin',
        platforms: ['ios', 'android'],
    },

    polar: {
        provider: 'polar',
        rowLabel: 'Polar',
        logo: require('../assets/images/wearablesLogo/logoPolar.png'),
        hero: require('../assets/images/wearables/polar.png'),
        title: 'Conecte sua conta Polar Flow',
        bullets: [
            'Forneça uma autorização segura via navegador web para conectar o RunEasy aos servidores da Polar.',
            'Qualquer corrida gravada com os seus dispositivos Polar será transmitida via nuvem automaticamente assim que o relógio sincronizar.',
            'O backend processará o arquivo completo de métricas físicas para atualizar o seu histórico de desempenho.',
            'Treinos executados em conformidade com a planilha fecharão as metas agendadas no seu calendário RunEasy.',
        ],
        connectLabel: 'Autorizar Polar Flow',
        platforms: ['ios', 'android'],
    },

    fitbit: {
        provider: 'fitbit',
        rowLabel: 'Fitbit',
        logo: require('../assets/images/wearablesLogo/logoFitBit.png'),
        hero: require('../assets/images/wearables/fitbit.png'),
        title: 'Vincule seus dispositivos Fitbit',
        bullets: [
            'Faça o login seguro com suas credenciais na página oficial de parceiros da Fitbit.',
            'Autorize o compartilhamento do histórico de atividades de corrida e métricas de geolocalização.',
            'Corra utilizando qualquer relógio ou pulseira inteligente do ecossistema Fitbit.',
            'Nossos servidores processam as informações recebidas de forma passiva, atualizando seu progresso e metas de evolução.',
        ],
        connectLabel: 'Conectar Conta Fitbit',
        platforms: ['ios', 'android'],
    },
};

/** Ordered list for rendering the Profile "Dispositivos" section. */
export const WEARABLE_ORDER: WearableProvider[] = [
    'apple',
    'healthConnect',
    'garmin',
    'polar',
    'fitbit',
];

/**
 * Ordered list for the onboarding device picker. Uses `appleWatch`
 * (WatchConnectivity companion) instead of `apple` (HealthKit).
 */
export const ONBOARDING_WEARABLE_ORDER: WearableProvider[] = [
    'appleWatch',
    'healthConnect',
    'garmin',
    'polar',
    'fitbit',
];

/**
 * Maps a config provider to the legacy `preferredWearable` string persisted in
 * the onboarding store / sent to the backend.
 */
export function toPreferredWearable(provider: WearableProvider): string {
    switch (provider) {
        case 'apple':
        case 'appleWatch':
            return 'apple_watch';
        case 'healthConnect':
            return 'health_connect';
        default:
            return provider; // garmin | polar | fitbit
    }
}
