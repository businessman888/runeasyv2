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

/**
 * Structured content for the "Ler mais" detail screen (`DeviceReadMoreBody`).
 * Modeled as typed blocks so the long-form copy renders with proper hierarchy
 * (headings, numbered steps, highlighted notes) using the design-system
 * typography — instead of one flat wall of text.
 */
export type ReadMoreBlock =
    | { type: 'title'; text: string }
    | { type: 'heading'; text: string }
    | { type: 'subheading'; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'steps'; items: string[] }
    | { type: 'note'; label?: string; text: string };

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
    /**
     * Long-form explanation shown on the "Ler mais" detail screen. Optional so
     * a provider without deep docs simply hides the "Ler mais" button.
     */
    readMore?: ReadMoreBlock[];
}

// ---------------------------------------------------------------------------
// "Ler mais" content — defined once and shared where providers describe the
// same hardware (apple + appleWatch → Apple Watch; polar + fitbit → cloud
// integrators). Copy is the verbatim explanation provided by the product.
// ---------------------------------------------------------------------------

const GARMIN_READMORE: ReadMoreBlock[] = [
    { type: 'title', text: 'Garmin' },
    {
        type: 'paragraph',
        text: 'Para utilizar um relógio Garmin com a RunEasy, você possui duas rotas distintas de integração. A Opção 1 é o método nativo recomendado para ter a experiência completa de assessoria, enquanto a Opção 2 é uma alternativa básica de leitura secundária.',
    },
    { type: 'heading', text: 'Opção 1: Conexão Nativa via Aplicativo RunEasy (Recomendado)' },
    {
        type: 'paragraph',
        text: 'Esta forma estabelece um canal direto bidirecional entre o seu celular e o relógio utilizando o nosso aplicativo exclusivo para a Garmin.',
    },
    { type: 'subheading', text: 'Como configurar:' },
    {
        type: 'steps',
        items: [
            'Abra o aplicativo Garmin Connect IQ Store no seu celular.',
            'Busque por RunEasy e realize o download do aplicativo para o seu modelo de relógio.',
            'Abra o aplicativo RunEasy no celular para gerar o seu token de pareamento.',
            'Abra o app RunEasy no relógio. Ele detectará o celular via Bluetooth e receberá o seu token de acesso automaticamente, sincronizando o seu calendário e exibindo o Treino do Dia.',
        ],
    },
    { type: 'subheading', text: 'Como funciona o envio pós-treino (Bluetooth):' },
    {
        type: 'steps',
        items: [
            'Ao finalizar a sua corrida, pressione o botão Parar no relógio.',
            'Selecione a opção Salvar Treino.',
            'O relógio tentará abrir imediatamente um canal de comunicação Bluetooth com o aplicativo RunEasy que está no seu celular para sincronizar a atividade.',
        ],
    },
    {
        type: 'note',
        label: 'Atenção:',
        text: 'O aplicativo RunEasy deve estar aberto ou em segundo plano no celular no momento do salvamento. Caso o celular esteja longe ou desconectado, o relógio exibirá o status "Envio Pendente" e guardará o treino na memória interna. Assim que o relógio reconectar ao Bluetooth do celular, abra o app RunEasy no smartphone para que os dados sejam descarregados automaticamente.',
    },
    { type: 'heading', text: 'Opção 2: Conexão Indireta via Integradores de Saúde (Apenas Leitura)' },
    {
        type: 'paragraph',
        text: 'Se você optar por não instalar o aplicativo da RunEasy no relógio, poderá coletar os dados de forma passiva através dos hubs de saúde do smartphone (Apple HealthKit no iOS ou Google Health Connect no Android).',
    },
    { type: 'subheading', text: 'Como configurar:' },
    {
        type: 'steps',
        items: [
            'Certifique-se de que o aplicativo oficial Garmin Connect está instalado e configurado para exportar seus treinos para o Apple Saúde (iOS) ou Health Connect (Android).',
            'No aplicativo RunEasy do celular, vá em Configurações > Conexões e ative a permissão de leitura para o hub de saúde correspondente ao seu sistema operacional.',
        ],
    },
    {
        type: 'note',
        label: 'Limitações deste método:',
        text: 'O fluxo é de via única: a RunEasy consegue apenas ler o treino que você terminou. Não é possível enviar o treino planejado da IA para o visor do relógio. Métricas avançadas de dinâmica de corrida (comprimento de passada, oscilação vertical) são descartadas pelos integradores padrão da Apple e Google.',
    },
];

const APPLE_WATCH_READMORE: ReadMoreBlock[] = [
    { type: 'title', text: 'Apple Watch' },
    {
        type: 'paragraph',
        text: 'A integração com o Apple Watch utiliza um aplicativo nativo desenvolvido para o sistema watchOS integrado ao banco de dados local do iOS.',
    },
    { type: 'subheading', text: 'Como configurar:' },
    {
        type: 'steps',
        items: [
            "Ao instalar o RunEasy no seu iPhone, a versão para o Apple Watch será instalada automaticamente no relógio (caso não instale, verifique o app 'Watch' no iPhone e ative a instalação manual).",
            'Na primeira inicialização no iPhone, o aplicativo solicitará permissão de acesso ao Apple HealthKit (Saúde). Você deve conceder todas as permissões de Leitura e Escrita de atividades físicas.',
        ],
    },
    { type: 'subheading', text: 'Como funciona o fluxo de treino:' },
    {
        type: 'steps',
        items: [
            'Abra o app RunEasy diretamente no Apple Watch para visualizar os detalhes do treino planejado pela inteligência artificial.',
            'Inicie e execute a corrida utilizando o aplicativo do relógio.',
            'Ao finalizar e salvar a atividade no pulso, o watchOS grava os dados diretamente no banco de dados do HealthKit do iPhone de forma nativa e assíncrona via sistema operacional.',
            'Para receber a análise e o feedback da IA, basta abrir o aplicativo RunEasy no seu iPhone. O app detectará a atualização do banco de dados local através do monitoramento de estado do sistema, capturará os dados da corrida e os enviará ao servidor para gerar o seu relatório.',
        ],
    },
];

const GALAXY_READMORE: ReadMoreBlock[] = [
    { type: 'title', text: 'Galaxy Watch' },
    {
        type: 'paragraph',
        text: 'O ecossistema da Samsung não utiliza um aplicativo instalado no relógio. O funcionamento baseia-se na sincronização retroativa entre o aplicativo nativo de treinos da Samsung e o hub unificado do Android.',
    },
    { type: 'subheading', text: 'Como configurar (Ação Obrigatória do Usuário):' },
    {
        type: 'steps',
        items: [
            'No seu celular Android, certifique-se de ter o aplicativo Health Connect (Conexão de Saúde) da Google instalado.',
            'Abra o aplicativo Samsung Health, vá em Configurações e ative a chave de sincronização para exportar os dados para o Health Connect.',
            'No aplicativo RunEasy do celular, vá em Configurações > Dispositivos e ative a permissão de Leitura para o Health Connect.',
        ],
    },
    { type: 'subheading', text: 'Como funciona o fluxo de treino:' },
    {
        type: 'steps',
        items: [
            'Você deve iniciar, executar e salvar a sua corrida utilizando o aplicativo de treino padrão (nativo) do seu Galaxy Watch.',
            'Ao finalizar, o relógio descarrega os dados no aplicativo Samsung Health do celular.',
            'O Samsung Health repassa automaticamente os dados físicos para o Health Connect do Android.',
        ],
    },
    {
        type: 'note',
        label: 'Como receber o feedback:',
        text: 'Como o processo ocorre localmente no celular, toda vez que você abrir o aplicativo RunEasy no smartphone (ou alternar para ele a partir da lista de apps minimizados), o sistema varrerá o Health Connect. Caso encontre um novo treino correspondente à data atual, o app exibirá uma tela de carregamento, fará o cruzamento dos dados com o cronograma e gerará o feedback da IA em poucos segundos.',
    },
];

const POLAR_FITBIT_READMORE: ReadMoreBlock[] = [
    { type: 'title', text: 'Polar e Fitbit' },
    {
        type: 'paragraph',
        text: 'Para os usuários de dispositivos Polar e Fitbit, o fluxo de dados ignora completamente as conexões locais do celular e opera diretamente em nível de servidor (Nuvem para Nuvem).',
    },
    { type: 'subheading', text: 'Como configurar:' },
    {
        type: 'steps',
        items: [
            'No aplicativo RunEasy do celular, acesse Configurações > Conexões de Terceiros.',
            'Selecione a marca do seu relógio (Polar ou Fitbit).',
            'Você será redirecionado para o portal oficial do fabricante em uma janela de navegador segura.',
            'Faça login com a sua conta da Polar ou Fitbit e autorize o RunEasy a acessar o seu histórico de atividades.',
        ],
    },
    { type: 'subheading', text: 'Como funciona o fluxo de treino:' },
    {
        type: 'steps',
        items: [
            'Realize a sua corrida normalmente utilizando as telas e sistemas nativos do seu relógio Polar ou Fitbit.',
            'Ao terminar o treino, sincronize o relógio com o aplicativo oficial da marca no seu celular (Polar Flow ou Fitbit App) via Bluetooth.',
            'Assim que o aplicativo da marca enviar a sua corrida para a nuvem deles, o servidor da Polar/Fitbit disparará um sinal automático (Webhook) diretamente para o servidor da RunEasy.',
            'O processamento da IA e a atualização do seu calendário de treinos ocorrem em segundo plano de forma totalmente assíncrona. Você receberá uma notificação no celular assim que o seu feedback estiver pronto, sem a necessidade de manter o aplicativo RunEasy aberto durante a transferência.',
        ],
    },
];

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
        readMore: APPLE_WATCH_READMORE,
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
        readMore: APPLE_WATCH_READMORE,
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
        readMore: GALAXY_READMORE,
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
        readMore: GARMIN_READMORE,
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
        readMore: POLAR_FITBIT_READMORE,
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
        readMore: POLAR_FITBIT_READMORE,
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
