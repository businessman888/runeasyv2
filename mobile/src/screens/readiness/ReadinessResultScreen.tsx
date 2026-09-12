import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StatusBar,
    TouchableOpacity,
    ScrollView,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useReadinessStore } from '../../stores/readinessStore';
import { colors, spacing, typography, fonts, createThemeStyles, useThemeSubscription, getThemeStatusBarStyle } from '../../theme';
import { semanticColors } from '../../theme/semanticColors';
import { AppIcon } from '../../components/ui/AppIcon';
import { ReadinessSignal, readinessSignalColors } from '../../components/readiness/ReadinessSignal';
import { ReadinessStateView } from '../../components/readiness/ReadinessStateView';
import {
    describeFloorProgress,
    FLOOR_EXPLANATION,
    generatedTimeLabel,
    metricTiles,
    signalLabel,
    type MetricTile,
} from '../../utils/readinessPresentation';
import type { RootStackParamList } from '../../navigation/navigationRef';
import type { ReadinessVerdict } from '../../types/readiness.types';
import type { ReadinessStatusColor } from '../../types/wellness.types';

/**
 * O VEREDITO DE PRONTIDÃO — dois modos, um só desenho.
 *
 *   submit  (padrão) — acabou de responder o quiz: envia e mostra o DESFECHO.
 *   review           — reabre a análise de hoje (card Done, push de +10 min,
 *                      quiz de quem já respondeu). Nunca envia nada.
 *
 * ── POR QUE O MODO REVISÃO NÃO ESCREVE NO STORE ──────────────────────────────
 *
 * Ele lê `readinessStatus.todayVerdict` direto. Copiá-lo para o store (como a
 * cópia órfã fazia) deixaria um desfecho vivo que o próximo `submit` confundiria
 * com o dele — e é exatamente assim que o resultado de amanhã já exibia o de
 * ontem. Derivar não deixa rastro.
 */

type Props = NativeStackScreenProps<RootStackParamList, 'ReadinessResult'>;
type Nav = Props['navigation'];

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Sai do fluxo do readiness de volta às abas — a Wellness, de onde se entra. */
function exitFlow(navigation: Nav) {
    if (navigation.canGoBack()) navigation.popToTop();
    else navigation.navigate('Main', { initialTab: 'Wellness' });
}

// Adjustment Icon SVG (sliders)
const AdjustmentIcon = () => (
    <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
        <Path d="M25 20.1638C25 20.4125 24.9012 20.6509 24.7254 20.8267C24.5496 21.0025 24.3111 21.1013 24.0625 21.1013H17.6875C17.4787 21.8799 17.0189 22.5679 16.3793 23.0585C15.7397 23.5492 14.9561 23.8151 14.15 23.8151C13.3439 23.8151 12.5603 23.5492 11.9207 23.0585C11.2811 22.5679 10.8213 21.8799 10.6125 21.1013H0.9375C0.68886 21.1013 0.450403 21.0025 0.274587 20.8267C0.0987719 20.6509 0 20.4125 0 20.1638C0 19.9152 0.0987719 19.6767 0.274587 19.5009C0.450403 19.3251 0.68886 19.2263 0.9375 19.2263H10.6125C10.8213 18.4477 11.2811 17.7598 11.9207 17.2691C12.5603 16.7784 13.3439 16.5125 14.15 16.5125C14.9561 16.5125 15.7397 16.7784 16.3793 17.2691C17.0189 17.7598 17.4787 18.4477 17.6875 19.2263H24.0625C24.3111 19.2263 24.5496 19.3251 24.7254 19.5009C24.9012 19.6767 25 19.9152 25 20.1638ZM25 3.65132C25 3.89996 24.9012 4.13841 24.7254 4.31423C24.5496 4.49004 24.3111 4.58882 24.0625 4.58882H21C20.7912 5.36741 20.3314 6.05537 19.6918 6.54603C19.0522 7.03669 18.2686 7.30263 17.4625 7.30263C16.6564 7.30263 15.8728 7.03669 15.2332 6.54603C14.5936 6.05537 14.1338 5.36741 13.925 4.58882H0.9375C0.814386 4.58882 0.692477 4.56457 0.578734 4.51745C0.464992 4.47034 0.361642 4.40128 0.274587 4.31423C0.187532 4.22717 0.118477 4.12383 0.0713629 4.01008C0.0242491 3.89634 0 3.77443 0 3.65132C0 3.5282 0.0242491 3.40629 0.0713629 3.29255C0.118477 3.17881 0.187532 3.07546 0.274587 2.9884C0.361642 2.90135 0.464992 2.83229 0.578734 2.78518C0.692477 2.73807 0.814386 2.71382 0.9375 2.71382H13.925C14.1338 1.93522 14.5936 1.24726 15.2332 0.756604C15.8728 0.265946 16.6564 0 17.4625 0C18.2686 0 19.0522 0.265946 19.6918 0.756604C20.3314 1.24726 20.7912 1.93522 21 2.71382H24.0625C24.1861 2.71214 24.3087 2.73524 24.4232 2.78175C24.5377 2.82827 24.6418 2.89727 24.7292 2.98466C24.8166 3.07205 24.8855 3.17607 24.9321 3.29057C24.9786 3.40507 25.0017 3.52774 25 3.65132ZM25 11.9013C25.0017 12.0249 24.9786 12.1476 24.9321 12.2621C24.8855 12.3766 24.8166 12.4806 24.7292 12.568C24.6418 12.6554 24.5377 12.7244 24.4232 12.7709C24.3087 12.8174 24.1861 12.8405 24.0625 12.8388H9.4375C9.2287 13.6174 8.76886 14.3054 8.12928 14.796C7.4897 15.2867 6.70611 15.5526 5.9 15.5526C5.09389 15.5526 4.3103 15.2867 3.67072 14.796C3.03114 14.3054 2.5713 13.6174 2.3625 12.8388H0.9375C0.68886 12.8388 0.450403 12.74 0.274587 12.5642C0.0987719 12.3884 0 12.15 0 11.9013C0 11.6527 0.0987719 11.4142 0.274587 11.2384C0.450403 11.0626 0.68886 10.9638 0.9375 10.9638H2.3625C2.5713 10.1852 3.03114 9.49726 3.67072 9.0066C4.3103 8.51595 5.09389 8.25 5.9 8.25C6.70611 8.25 7.4897 8.51595 8.12928 9.0066C8.76886 9.49726 9.2287 10.1852 9.4375 10.9638H24.0625C24.3111 10.9638 24.5496 11.0626 24.7254 11.2384C24.9012 11.4142 25 11.6527 25 11.9013Z" fill={semanticColors.accent} />
    </Svg>
);

// Heart Rate Icon (for first card)
const HeartRateIcon = () => (
    <Svg width="50" height="50" viewBox="0 0 50 50" fill="none">
        <Defs>
            <LinearGradient id="paint0_linear" x1="25" y1="0" x2="25" y2="50" gradientUnits="userSpaceOnUse">
                <Stop stopColor={semanticColors.accent} />
                <Stop offset="1" stopColor={semanticColors.accent} stopOpacity={0.7} />
            </LinearGradient>
        </Defs>
        <Rect width="50" height="50" rx="10" fill="url(#paint0_linear)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M24.9981 11.875C25.2963 11.8747 25.5868 11.9691 25.8278 12.1447C26.0688 12.3203 26.2477 12.568 26.3387 12.8519L32.5 32.1063L34.9113 24.5725C35.0019 24.2885 35.1804 24.0407 35.421 23.8648C35.6616 23.6889 35.9519 23.594 36.25 23.5938H38.5938C38.9667 23.5938 39.3244 23.7419 39.5881 24.0056C39.8518 24.2694 40 24.627 40 25C40 25.373 39.8518 25.7306 39.5881 25.9944C39.3244 26.2581 38.9667 26.4063 38.5938 26.4063H37.2756L33.8387 37.1481C33.7476 37.4315 33.5689 37.6787 33.3283 37.8541C33.0877 38.0294 32.7977 38.1239 32.5 38.1239C32.2023 38.1239 31.9123 38.0294 31.6717 37.8541C31.4311 37.6787 31.2524 37.4315 31.1613 37.1481L25.0094 17.9238L20.7156 31.5175C20.627 31.7976 20.453 32.043 20.2178 32.2191C19.9827 32.3952 19.6982 32.4932 19.4045 32.4994C19.1108 32.5056 18.8225 32.4197 18.5801 32.2537C18.3378 32.0876 18.1535 31.8499 18.0531 31.5738L15.6831 25.0563L15.5519 25.4463C15.4586 25.7262 15.2797 25.9697 15.0405 26.1423C14.8013 26.3149 14.5138 26.4079 14.2188 26.4081H11.4062C11.0333 26.4081 10.6756 26.26 10.4119 25.9962C10.1482 25.7325 10 25.3748 10 25.0019C10 24.6289 10.1482 24.2712 10.4119 24.0075C10.6756 23.7438 11.0333 23.5956 11.4062 23.5956H13.2063L14.29 20.3388C14.3819 20.0613 14.5579 19.8195 14.7936 19.6467C15.0293 19.4739 15.3129 19.3789 15.6051 19.3748C15.8973 19.3706 16.1835 19.4576 16.424 19.6237C16.6644 19.7897 16.8472 20.0266 16.9469 20.3013L19.2812 26.7231L23.6594 12.8594C23.749 12.5744 23.9271 12.3253 24.1678 12.1483C24.4085 11.9713 24.6993 11.8756 24.9981 11.875Z" fill={semanticColors.textOnAccent} />
    </Svg>
);

// Gauge Component with proper SVG arc
const ReadinessGauge: React.FC<{ score: number; color: ReadinessStatusColor; label: string }> = ({
    score,
    color,
    label,
}) => {
    useThemeSubscription();
    const animatedValue = useRef(new Animated.Value(0)).current;
    // A cor vem do semáforo único — era `accent` (ciano) aqui e `success` no card.
    const { accent } = readinessSignalColors(color);

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: score,
            duration: 1500,
            useNativeDriver: false,
        }).start();
    }, [score, animatedValue]);

    const size = 200;
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Calculate stroke dash offset based on score
    const strokeDashoffset = animatedValue.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, circumference * 0.15], // Leave small gap at top
    });

    return (
        <View
            style={styles.gaugeContainer}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Prontidão ${score} de 100, ${signalLabel(color, label)}`}
        >
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={semanticColors.borderStrong}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Progress circle */}
                <AnimatedCircle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={accent}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
            <View style={styles.gaugeCenter}>
                {/* Sem "%": o score é uma nota de 0 a 100, não um percentual —
                    e o card da Wellness sempre o mostrou assim. */}
                <Text style={styles.gaugeScore}>{score}</Text>
                <View style={styles.gaugeSignal}>
                    <ReadinessSignal color={color} label={label} size="sm" />
                </View>
            </View>
        </View>
    );
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Um tile da grade. Rótulo, valor e ícone vêm do MESMO item do payload. */
const MetricCard = memo(function MetricCard({ tile }: { tile: MetricTile }) {
    useThemeSubscription();
    return (
        <View
            style={styles.metricCard}
            accessible
            accessibilityLabel={`${tile.label}: ${tile.value}${tile.sublabel ? `, ${tile.sublabel}` : ''}`}
        >
            <View style={styles.metricIconContainer}>
                <AppIcon name={tile.icon} size={20} tone="accent" />
            </View>
            <Text style={styles.metricLabel}>{tile.label}</Text>
            <Text style={styles.metricValue}>{tile.value}</Text>
            {tile.sublabel ? <Text style={styles.metricSublabel}>{tile.sublabel}</Text> : null}
        </View>
    );
});

interface VerdictAction {
    label: string;
    onPress: () => void;
    icon?: IoniconName;
}

interface VerdictViewProps {
    verdict: ReadinessVerdict;
    onBack: () => void;
    primaryAction: VerdictAction;
    /** Faixa acima do veredito — hoje só no desfecho "já respondeu hoje". */
    notice?: { title: string; detail: string | null } | null;
}

function VerdictView({ verdict, onBack, primaryAction, notice }: VerdictViewProps) {
    useThemeSubscription();
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, [fadeAnim, slideAnim]);

    // Por RÓTULO, não por posição — ver `metricTiles`. Lista vazia = sem grade.
    const tiles = useMemo(() => metricTiles(verdict.metrics_summary), [verdict.metrics_summary]);
    const generatedTime = generatedTimeLabel(verdict.generated_at);
    const adjustment = verdict.ai_analysis.plan_adjustment.trim();

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={onBack}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Ionicons name="chevron-back" size={24} color={semanticColors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Veredito de Prontidão</Text>
                {/* A tendência é a R.2c: o botão fica no lugar, ainda sem ação. */}
                <TouchableOpacity style={styles.calendarButton}>
                    <Ionicons name="calendar-outline" size={24} color={semanticColors.textPrimary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    {notice ? (
                        <View style={styles.notice}>
                            <AppIcon name="info" size={20} tone="secondary" />
                            <View style={styles.noticeTextWrap}>
                                <Text style={styles.noticeTitle}>{notice.title}</Text>
                                {notice.detail ? (
                                    <Text style={styles.noticeDetail}>{notice.detail}</Text>
                                ) : null}
                            </View>
                        </View>
                    ) : null}

                    {/* Time Badge */}
                    {generatedTime ? (
                        <View style={styles.timeBadge}>
                            <Text style={styles.timeText}>Análise gerada às {generatedTime}</Text>
                            <Text style={styles.timeSubtext}>Baseada em Check-in + Atividades</Text>
                        </View>
                    ) : null}

                    {/* Gauge */}
                    <ReadinessGauge
                        score={verdict.readiness_score}
                        color={verdict.status_color}
                        label={verdict.status_label}
                    />

                    {/* AI Analysis Card with Adjustment Subcard */}
                    <View style={styles.analysisCard}>
                        <View style={styles.analysisHeader}>
                            <HeartRateIcon />
                            <View style={styles.analysisHeaderText}>
                                <Text style={styles.analysisHeadline}>{verdict.ai_analysis.headline}</Text>
                            </View>
                        </View>
                        <Text style={styles.analysisReasoning}>{verdict.ai_analysis.reasoning}</Text>

                        {adjustment ? (
                            <View style={styles.adjustmentSubcard}>
                                <View style={styles.adjustmentIconContainer}>
                                    <AdjustmentIcon />
                                </View>
                                <View style={styles.adjustmentTextContainer}>
                                    <Text style={styles.adjustmentTitle}>AJUSTE PRÁTICO</Text>
                                    <Text style={styles.adjustmentText}>{adjustment}</Text>
                                </View>
                            </View>
                        ) : null}
                    </View>

                    {tiles.length > 0 ? (
                        <View style={styles.metricsGrid}>
                            {tiles.map((tile) => (
                                <MetricCard key={tile.key} tile={tile} />
                            ))}
                        </View>
                    ) : null}

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={primaryAction.onPress}
                        accessibilityRole="button"
                        accessibilityLabel={primaryAction.label}
                    >
                        <Text style={styles.primaryButtonText}>{primaryAction.label}</Text>
                        {primaryAction.icon ? (
                            <Ionicons name={primaryAction.icon} size={22} color={semanticColors.textOnAccent} />
                        ) : null}
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

function LoadingView({ title, subtitle }: { title: string; subtitle?: string }) {
    useThemeSubscription();
    return (
        <View style={styles.centered}>
            <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{title}</Text>
            {subtitle ? <Text style={styles.loadingSubtext}>{subtitle}</Text> : null}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// submit — o desfecho do check-in que acabou de ser respondido
// ─────────────────────────────────────────────────────────────────────────────

function SubmitResult({ navigation }: { navigation: Nav }) {
    useThemeSubscription();
    const outcome = useReadinessStore((s) => s.outcome);
    const isLoading = useReadinessStore((s) => s.isLoading);
    const error = useReadinessStore((s) => s.error);
    const fetchVerdict = useReadinessStore((s) => s.fetchVerdict);
    const learningFromStatus = useReadinessStore((s) => s.readinessStatus?.learning ?? null);

    // `resetQuiz` no início de cada quiz garante que desfecho e erro aqui são
    // desta sessão — sem isso, esta guarda pulava o envio de amanhã.
    useEffect(() => {
        if (!outcome && !isLoading && !error) {
            void fetchVerdict();
        }
    }, []);

    const leave = () => exitFlow(navigation);

    if (error) {
        return (
            <View style={styles.centered}>
                <StatusBar barStyle={getThemeStatusBarStyle()} backgroundColor={semanticColors.canvas} />
                <Ionicons name="warning-outline" size={64} color={semanticColors.warning} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => void fetchVerdict()}
                    accessibilityRole="button"
                    accessibilityLabel="Tentar de novo"
                >
                    <Text style={styles.retryButtonText}>Tentar de novo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={leave}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Text style={styles.secondaryButtonText}>Voltar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (isLoading || !outcome) {
        return (
            <LoadingView
                title="Analisando sua prontidão..."
                subtitle="Cruzando dados do check-in com seus treinos"
            />
        );
    }

    switch (outcome.kind) {
        case 'ok':
            return (
                <VerdictView
                    verdict={outcome.verdict}
                    onBack={leave}
                    primaryAction={{
                        label: 'Confirmar',
                        icon: 'arrow-forward-circle',
                        onPress: () => navigation.navigate('ReadinessSuccess'),
                    }}
                />
            );

        case 'ja_respondeu':
            // O backend recusou as respostas novas e devolveu o veredito de mais
            // cedo. A tela exibia esse veredito como se fosse novo.
            return (
                <VerdictView
                    verdict={outcome.verdict}
                    onBack={leave}
                    notice={{
                        title: 'Você já tinha feito o check-in hoje — as respostas de agora não foram registradas.',
                        detail: outcome.message,
                    }}
                    primaryAction={{ label: 'Voltar', onPress: leave }}
                />
            );

        case 'aprendendo':
            // O `learning` do 422 é descartado pelo filtro global do backend; o
            // do `/status` (buscado ao abrir o quiz) completa o progresso.
            return (
                <ReadinessStateView
                    visual="padlock"
                    title="Calibrando sua prontidão"
                    body={describeFloorProgress(outcome.learning ?? learningFromStatus)}
                    note={FLOOR_EXPLANATION}
                    primaryAction={{ label: 'Voltar', onPress: leave }}
                />
            );

        case 'pro_gate':
            return (
                <ReadinessStateView
                    visual="lock"
                    tone="secondary"
                    title="Recurso do RunEasy Pro"
                    body={outcome.message}
                    primaryAction={{ label: 'Voltar', onPress: leave }}
                />
            );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// review — reabrir a análise de hoje
// ─────────────────────────────────────────────────────────────────────────────

function ReviewResult({ navigation }: { navigation: Nav }) {
    useThemeSubscription();
    const todayVerdict = useReadinessStore((s) => s.readinessStatus?.todayVerdict ?? null);
    const statusUnavailable = useReadinessStore(
        (s) => s.readinessStatus?.eligibilityReason === 'indisponivel',
    );
    const fetchReadinessStatus = useReadinessStore((s) => s.fetchReadinessStatus);
    const [checked, setChecked] = useState(false);

    // Sempre rebusca: quem chega pelo push pode trazer um status de ontem na
    // memória. Enquanto isso, o veredito que já está aqui aparece — é a mesma
    // linha em quase todos os casos.
    useEffect(() => {
        let alive = true;
        void fetchReadinessStatus().finally(() => {
            if (alive) setChecked(true);
        });
        return () => {
            alive = false;
        };
    }, [fetchReadinessStatus]);

    const leave = () => exitFlow(navigation);

    if (todayVerdict) {
        return (
            <VerdictView
                verdict={todayVerdict}
                onBack={leave}
                primaryAction={{ label: 'Voltar', onPress: leave }}
            />
        );
    }

    if (!checked) {
        return <LoadingView title="Carregando a análise de hoje..." />;
    }

    if (statusUnavailable) {
        return (
            <ReadinessStateView
                visual="warning"
                tone="warning"
                title="Não consegui carregar a análise"
                body="Pode ser a conexão. Tente de novo em instantes."
                primaryAction={{ label: 'Tentar de novo', onPress: () => navigation.replace('ReadinessResult', { mode: 'review' }) }}
                secondaryAction={{ label: 'Voltar', onPress: leave }}
            />
        );
    }

    return (
        <ReadinessStateView
            visual="readiness"
            tone="secondary"
            title="Não encontrei a análise de hoje"
            body="O check-in de hoje ainda não foi feito — ou o dia de prontidão já virou (ele recomeça às 03:00)."
            primaryAction={{ label: 'Voltar', onPress: leave }}
        />
    );
}

export function ReadinessResultScreen({ navigation, route }: Props) {
    useThemeSubscription();
    return route.params?.mode === 'review' ? (
        <ReviewResult navigation={navigation} />
    ) : (
        <SubmitResult navigation={navigation} />
    );
}

const styles = createThemeStyles(() => ({
    container: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    backButton: {
        padding: spacing.xs,
    },
    headerTitle: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textPrimary,
    },
    calendarButton: {
        padding: spacing.xs,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    notice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        marginTop: spacing.lg,
        padding: spacing.md,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        backgroundColor: semanticColors.surface2,
    },
    noticeTextWrap: {
        flex: 1,
        gap: spacing.xs,
    },
    noticeTitle: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textPrimary,
        lineHeight: 20,
    },
    noticeDetail: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
        lineHeight: 18,
    },
    timeBadge: {
        alignItems: 'center',
        marginTop: 32,
        marginBottom: 28,
    },
    timeText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.lg,
        color: colors.primary,
    },
    timeSubtext: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        marginTop: spacing.xs,
    },
    gaugeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing['2xl'],
        position: 'relative',
    },
    gaugeCenter: {
        position: 'absolute',
        alignItems: 'center',
    },
    gaugeScore: {
        fontFamily: fonts.bold,
        fontSize: 48,
        color: semanticColors.textPrimary,
    },
    gaugeSignal: {
        marginTop: spacing.xs,
        maxWidth: 150,
    },
    analysisCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 20,
        padding: spacing.lg,
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    analysisHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        gap: spacing.md,
    },
    analysisHeaderText: {
        flex: 1,
    },
    analysisHeadline: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textPrimary,
        lineHeight: 24,
    },
    analysisReasoning: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        lineHeight: 20,
        marginBottom: spacing.lg,
    },
    adjustmentSubcard: {
        backgroundColor: semanticColors.accentSubtle,
        borderRadius: 16,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    adjustmentIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: semanticColors.accentSubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    adjustmentTextContainer: {
        flex: 1,
    },
    adjustmentTitle: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        letterSpacing: 1,
        marginBottom: spacing.xs,
    },
    adjustmentText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textSecondary,
        lineHeight: 18,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 32,
        marginTop: 8,
    },
    metricCard: {
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 120,
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricIconContainer: {
        marginBottom: spacing.sm,
    },
    metricLabel: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.xs,
        color: semanticColors.textTertiary,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    metricValue: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textPrimary,
        textAlign: 'center',
    },
    metricSublabel: {
        fontFamily: fonts.medium,
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        marginTop: spacing.xs,
        textAlign: 'center',
    },
    primaryButton: {
        flexDirection: 'row',
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    primaryButtonText: {
        fontFamily: fonts.bold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textOnAccent,
    },
    centered: {
        flex: 1,
        backgroundColor: semanticColors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    loadingText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.lg,
        color: semanticColors.textPrimary,
        marginTop: spacing.lg,
    },
    loadingSubtext: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.sm,
        color: semanticColors.textTertiary,
        marginTop: spacing.xs,
    },
    errorText: {
        fontFamily: fonts.regular,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.xl,
    },
    retryButton: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 24,
    },
    retryButtonText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: semanticColors.textOnAccent,
    },
    secondaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        marginTop: spacing.sm,
    },
    secondaryButtonText: {
        fontFamily: fonts.semibold,
        fontSize: typography.fontSizes.md,
        color: colors.primary,
    },
}));
