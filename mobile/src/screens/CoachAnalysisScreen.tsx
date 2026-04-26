import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Platform,
    Pressable,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LineChart } from 'react-native-gifted-charts';
import * as Location from 'expo-location';

import { useFeedbackStore } from '../stores/feedbackStore';
import { useTrainingStore } from '../stores';
import { useAuthStore, getDisplayName, getAvatarUrl } from '../stores/authStore';
import {
    calculatePaceChart,
    calculatePaceSummary,
    calculateSplits,
    formatDurationMs,
    formatPaceSeconds,
    type RoutePoint,
    type SplitData,
} from '../utils/runMetrics';
import { SharingModal } from './sharing/SharingModal';

// ─── Design Tokens (alinhados ao RunSummary/Figma) ────────────────────────────
const T = {
    bgPrimary: '#0E0E1F',
    cardSurface: '#1C1C2E',
    cardDarker: '#15152A',
    cyan: '#00D4FF',
    cyanSoft: 'rgba(0, 212, 255, 0.15)',
    textPrimary: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.60)',
    textMuted: 'rgba(235, 235, 245, 0.35)',
    divider: 'rgba(235, 235, 245, 0.10)',
    success: '#32CD32',
    warning: '#FFC400',
    danger: '#FF453A',
    purple: '#9747FF',
    gold: '#FFD700',
    routeColor: '#00D4FF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDistanceKm(meters: number) {
    return (meters / 1000).toFixed(2);
}
function formatHeaderDate(d: Date) {
    const day = d.getDate().toString().padStart(2, '0');
    const monthsShort = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const month = monthsShort[d.getMonth()];
    return `${day} ${month}, ${d.getFullYear()}`;
}
function getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/** decimal min/km → segundos por km */
function paceMinPerKmToSeconds(p: number | null | undefined): number {
    if (!p || !isFinite(p) || p <= 0) return 0;
    return p * 60;
}
/** Aceita "5:00", "5'00\"", "5’00”", "5.00 min/km" → segundos por km */
function parsePaceString(p: string | null | undefined): number {
    if (!p) return 0;
    const match = p.match(/(\d+)\s*[:'’.](\d{1,2})/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

type Status = 'good' | 'ok' | 'bad';
function getDeltaStatus(actual: number, target: number, tolerance = 0.05): Status {
    if (!target) return 'ok';
    const ratio = (actual - target) / target;
    if (Math.abs(ratio) <= tolerance) return 'good';
    if (Math.abs(ratio) <= tolerance * 2) return 'ok';
    return 'bad';
}
function statusColor(s: Status) {
    return s === 'good' ? T.success : s === 'ok' ? T.warning : T.danger;
}
function statusLabel(actual: number, target: number, fmt: (n: number) => string) {
    const delta = actual - target;
    if (delta === 0) return 'No alvo';
    const sign = delta > 0 ? '+' : '−';
    return `${sign}${fmt(Math.abs(delta))}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CoachAnalysisScreen({ navigation, route }: any) {
    const { feedbackId } = route?.params || {};
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);

    const {
        currentFeedback,
        fetchFeedback,
        latestActivity,
        latestActivityLoading,
        fetchLatestActivity,
        isLoading,
    } = useFeedbackStore();
    const fetchWorkoutDetails = useTrainingStore((s) => s.fetchWorkoutDetails);

    const [sharingVisible, setSharingVisible] = useState(false);

    useEffect(() => {
        if (feedbackId) fetchFeedback(feedbackId);
        // Sempre garantimos latestActivity carregado: ela traz conquest/VO² que,
        // quando o workout_id bater com o do feedback aberto, exibimos abaixo.
        if (!latestActivity) fetchLatestActivity();
    }, [feedbackId]);

    // ── Workout id (chave para hidratar GPS + planejado) ──────────────────
    const workoutId: string | null =
        currentFeedback?.workout_id || latestActivity?.workout_id || null;

    // ── Hidrata gps_route + dados planejados (mesmo padrão do RunSummary) ─
    type Enriched = {
        routePoints: RoutePoint[];
        routeCoordinates: number[][];
        distance: number;            // metros
        timeMs: number;
        elevationGainM: number;
        targetPaceSeconds?: number;
        targetDistanceKm?: number;
        workoutTitle?: string;
        startDate?: string;
    };
    const [enriched, setEnriched] = useState<Enriched | null>(null);
    const [enriching, setEnriching] = useState(false);

    useEffect(() => {
        if (!workoutId) return;
        let cancelled = false;
        setEnriching(true);
        (async () => {
            const details = await fetchWorkoutDetails(workoutId);
            if (cancelled) return;
            if (!details) {
                setEnriching(false);
                return;
            }
            const activity = details.activity;
            const gps = (activity?.gps_route ?? []) as RoutePoint[];
            const coords = gps
                .filter((p) => p && typeof p.longitude === 'number' && typeof p.latitude === 'number')
                .map((p) => [p.longitude, p.latitude]);

            setEnriched({
                routePoints: gps,
                routeCoordinates: coords,
                distance: activity?.distance ?? 0,
                timeMs: (activity?.moving_time ?? 0) * 1000,
                elevationGainM:
                    activity?.total_elevation_gain ??
                    activity?.elevation_gain ??
                    0,
                targetPaceSeconds: details.target_pace_seconds ?? undefined,
                targetDistanceKm: details.distance_km ?? undefined,
                workoutTitle: details.title ?? undefined,
                startDate: activity?.start_date,
            });
            setEnriching(false);
        })();
        return () => { cancelled = true; };
    }, [workoutId, fetchWorkoutDetails]);

    // ── Fonte de dados consolidada (enriched > currentFeedback > latestActivity) ──
    const activityFromFeedback = currentFeedback?.activities;
    const activityFromLatest = latestActivity?.activity;

    const distance =
        enriched?.distance ??
        activityFromFeedback?.distance ??
        activityFromLatest?.distance ??
        0;
    const timeMs =
        enriched?.timeMs ??
        ((activityFromFeedback?.moving_time ?? activityFromLatest?.moving_time ?? 0) * 1000);
    const elevationGain =
        enriched?.elevationGainM ??
        activityFromFeedback?.elevation_gain ??
        activityFromLatest?.elevation_gain ??
        0;
    const startDateIso =
        enriched?.startDate ??
        activityFromFeedback?.start_date ??
        activityFromLatest?.start_date;

    const routePoints = enriched?.routePoints ?? [];
    const routeCoordinates = enriched?.routeCoordinates ?? [];

    const targetPaceSeconds: number | undefined =
        enriched?.targetPaceSeconds ??
        latestActivity?.target_pace_seconds ??
        parsePaceString(currentFeedback?.metrics_comparison?.pace?.planned) ??
        undefined;
    const targetDistanceKm: number | undefined =
        enriched?.targetDistanceKm ??
        latestActivity?.conquest?.planned_distance_km ??
        currentFeedback?.metrics_comparison?.distance?.planned ??
        undefined;

    const workoutTitle =
        enriched?.workoutTitle ??
        latestActivity?.workout_title ??
        currentFeedback?.workouts?.type ??
        activityFromLatest?.name ??
        'Treino do plano';

    // ── Usuário ────────────────────────────────────────────────────────────
    const user = useAuthStore((s) => s.user);
    const displayName = useMemo(() => getDisplayName(user) || 'Corredor', [user]);
    const avatarUrl = useMemo(() => getAvatarUrl(user), [user]);
    const initials = useMemo(() => getInitials(displayName), [displayName]);

    // ── Reverse geocode → cidade ───────────────────────────────────────────
    const [city, setCity] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (routeCoordinates.length === 0) return;
            try {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status !== 'granted') return;
                const mid = routeCoordinates[Math.floor(routeCoordinates.length / 2)];
                const [lng, lat] = mid;
                const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
                if (cancelled) return;
                const first = results?.[0];
                const cityName = first?.city || first?.subregion || first?.region;
                if (cityName) setCity(cityName);
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [routeCoordinates]);

    // ── Métricas (splits / pace chart) ─────────────────────────────────────
    const splits: SplitData[] = useMemo(
        () => (routePoints.length > 1 ? calculateSplits(routePoints) : []),
        [routePoints],
    );
    const paceChart = useMemo(
        () => (routePoints.length > 1 ? calculatePaceChart(routePoints) : []),
        [routePoints],
    );
    const summary = useMemo(
        () => calculatePaceSummary(routePoints, distance, timeMs),
        [routePoints, distance, timeMs],
    );

    // Avg pace robusto: usa o GPS se houver, senão cai para average_pace decimal vindo do backend
    const avgPaceSeconds =
        summary.avgPaceSecondsPerKm > 0
            ? summary.avgPaceSecondsPerKm
            : paceMinPerKmToSeconds(
                activityFromFeedback?.average_pace ?? activityFromLatest?.average_pace ?? 0,
            );

    const distanceKmStr = formatDistanceKm(distance);
    const timeStr = formatDurationMs(timeMs);
    const avgPaceStr = formatPaceSeconds(avgPaceSeconds);

    // ── Header date ────────────────────────────────────────────────────────
    const headerDate = useMemo(
        () => formatHeaderDate(startDateIso ? new Date(startDateIso) : new Date()),
        [startDateIso],
    );
    const dateLine = city ? `${headerDate} — ${city}` : headerDate;

    // ── Mapa: bounds da rota ───────────────────────────────────────────────
    const hasRoute = routeCoordinates.length > 1;
    let centerCoord = routeCoordinates[0] || [-46.6333, -23.5505];
    let bounds: { ne: number[]; sw: number[] } | undefined;
    if (hasRoute) {
        const lngs = routeCoordinates.map((c) => c[0]);
        const lats = routeCoordinates.map((c) => c[1]);
        const padding = 0.002;
        bounds = {
            ne: [Math.max(...lngs) + padding, Math.max(...lats) + padding],
            sw: [Math.min(...lngs) - padding, Math.min(...lats) - padding],
        };
        centerCoord = [
            (bounds.ne[0] + bounds.sw[0]) / 2,
            (bounds.ne[1] + bounds.sw[1]) / 2,
        ];
    }
    const geoJsonSource = {
        type: 'FeatureCollection' as const,
        features: [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'LineString' as const,
                coordinates: hasRoute ? routeCoordinates : [[0, 0]],
            },
        }],
    };

    // ── Hero / score ───────────────────────────────────────────────────────
    const feedback = currentFeedback || (latestActivity?.feedback ? {
        hero_message: latestActivity.feedback.hero_message,
        hero_tone: latestActivity.feedback.hero_tone,
        strengths: latestActivity.feedback.strengths,
        improvements: latestActivity.feedback.improvements,
    } : null) as any;

    const heroToneColor = useMemo(() => {
        switch (feedback?.hero_tone) {
            case 'celebration': return T.success;
            case 'encouragement': return T.cyan;
            case 'improvement': return T.warning;
            case 'caution': return T.danger;
            default: return T.cyan;
        }
    }, [feedback?.hero_tone]);

    const heroScore = useMemo(() => {
        // Score visual baseado no tom (sem inventar número exato).
        switch (feedback?.hero_tone) {
            case 'celebration': return 100;
            case 'encouragement': return 85;
            case 'improvement': return 65;
            case 'caution': return 40;
            default: return 90;
        }
    }, [feedback?.hero_tone]);

    const showLoading = isLoading || latestActivityLoading;

    // Conquest e VO² vêm de /feedback/latest/activity. Se o usuário abriu a
    // tela a partir do histórico (feedbackId presente), só mostramos quando o
    // workout_id bater — caso contrário seriam dados de outra corrida.
    const latestExtrasMatch =
        !feedbackId || (!!latestActivity?.workout_id && latestActivity.workout_id === workoutId);
    const conquest = latestExtrasMatch ? latestActivity?.conquest ?? null : null;
    const vo2 = latestExtrasMatch ? latestActivity?.vo2_max ?? null : null;

    // ── Compare planejado vs executado ─────────────────────────────────────
    const distanceKm = distance / 1000;
    const distanceStatus: Status | null = targetDistanceKm
        ? getDeltaStatus(distanceKm, targetDistanceKm)
        : null;
    const paceStatus: Status | null = targetPaceSeconds && avgPaceSeconds > 0
        ? getDeltaStatus(targetPaceSeconds, avgPaceSeconds)
        : null;

    // ── Chart layout ───────────────────────────────────────────────────────
    const { width: screenWidth } = useWindowDimensions();
    const chartAvailableWidth = Math.max(220, screenWidth - 16 * 2 - 16 * 2);
    const chartCfg = useMemo(
        () => buildChartConfig(paceChart, avgPaceSeconds, chartAvailableWidth),
        [paceChart, avgPaceSeconds, chartAvailableWidth],
    );

    // ── Bottom sheet snap ──────────────────────────────────────────────────
    const snapPoints = useMemo(() => ['35%', '92%'], []);

    // ── Actions ────────────────────────────────────────────────────────────
    const handleClose = () => navigation.goBack();
    const handleShare = useCallback(async () => {
        const message = `${workoutTitle} 🏃\n\nDistância: ${distanceKmStr} km\nTempo: ${timeStr}\nPace médio: ${avgPaceStr} /km`;
        try { await Share.share({ message }); } catch { /* canceled */ }
    }, [workoutTitle, distanceKmStr, timeStr, avgPaceStr]);

    // ── Strength / improvement (Análise inteligente) ───────────────────────
    const strength = feedback?.strengths?.[0];
    const improvement = feedback?.improvements?.[0];

    return (
        <View style={styles.container}>
            {/* ── Mapa fullscreen ────────────────────────────────────────── */}
            <View style={StyleSheet.absoluteFillObject}>
                <Mapbox.MapView
                    style={StyleSheet.absoluteFillObject}
                    styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/dark-v11'}
                    logoEnabled={false}
                    compassEnabled={false}
                    attributionEnabled={false}
                    scaleBarEnabled={false}
                    scrollEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    zoomEnabled={false}
                >
                    <Mapbox.Camera
                        centerCoordinate={centerCoord}
                        zoomLevel={hasRoute ? undefined : 15}
                        bounds={bounds ? {
                            ne: bounds.ne,
                            sw: bounds.sw,
                            paddingTop: 80,
                            paddingBottom: 320,
                            paddingLeft: 40,
                            paddingRight: 40,
                        } : undefined}
                        animationDuration={0}
                    />
                    {hasRoute && (
                        <Mapbox.ShapeSource id="coachRoute" shape={geoJsonSource as any}>
                            <Mapbox.LineLayer
                                id="coachRouteGlow"
                                style={{
                                    lineColor: T.routeColor,
                                    lineWidth: 12,
                                    lineOpacity: 0.25,
                                    lineJoin: 'round',
                                    lineCap: 'round',
                                }}
                            />
                            <Mapbox.LineLayer
                                id="coachRouteFill"
                                style={{
                                    lineColor: T.routeColor,
                                    lineWidth: 5,
                                    lineJoin: 'round',
                                    lineCap: 'round',
                                }}
                            />
                        </Mapbox.ShapeSource>
                    )}
                </Mapbox.MapView>

                {/* Overlay: rota indisponível ou hidratando */}
                {!hasRoute && (
                    <View style={styles.mapOverlay} pointerEvents="none">
                        <View style={styles.mapOverlayPill}>
                            {enriching ? (
                                <>
                                    <ActivityIndicator size="small" color={T.cyan} />
                                    <Text style={styles.mapOverlayText}>Carregando rota...</Text>
                                </>
                            ) : (
                                <>
                                    <Ionicons name="map-outline" size={16} color={T.textSecondary} />
                                    <Text style={styles.mapOverlayText}>Rota não disponível</Text>
                                </>
                            )}
                        </View>
                    </View>
                )}
            </View>

            {/* ── Header overlay ────────────────────────────────────────── */}
            <SafeAreaView edges={['top']} style={styles.topOverlay}>
                <Pressable
                    style={styles.iconBtn}
                    onPress={handleClose}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                >
                    <Ionicons name="chevron-back" size={22} color={T.textPrimary} />
                </Pressable>
                <View style={styles.titlePill}>
                    <Text style={styles.titlePillSub}>Relatório</Text>
                    <Text style={styles.titlePillMain}>Treinador</Text>
                </View>
                <Pressable
                    style={styles.iconBtn}
                    onPress={handleShare}
                    hitSlop={10}
                    disabled={!workoutId}
                    accessibilityRole="button"
                    accessibilityLabel="Compartilhar"
                >
                    <Ionicons name="share-outline" size={20} color={workoutId ? T.cyan : T.textMuted} />
                </Pressable>
            </SafeAreaView>

            {/* ── Bottom Sheet ─────────────────────────────────────────── */}
            <BottomSheet
                ref={sheetRef}
                index={0}
                snapPoints={snapPoints}
                backgroundStyle={styles.sheetBackground}
                handleIndicatorStyle={styles.sheetHandle}
                enablePanDownToClose={false}
            >
                <BottomSheetScrollView
                    contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* User row */}
                    <View style={styles.userRow}>
                        <Avatar uri={avatarUrl} initials={initials} />
                        <View style={styles.userTextWrap}>
                            <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
                            <Text style={styles.userDate} numberOfLines={1}>{dateLine}</Text>
                        </View>
                    </View>

                    {/* Hero (score + mensagem + título) */}
                    <View style={styles.heroBlock}>
                        <CircularScore percentage={heroScore} color={heroToneColor} loading={showLoading} />
                        <Text style={styles.heroMessage} numberOfLines={2}>
                            {showLoading ? 'Analisando seu treino...' : (feedback?.hero_message || 'Análise do Treinador')}
                        </Text>
                        <Text style={styles.heroSubtitle} numberOfLines={1}>
                            {workoutTitle}{startDateIso ? ` — ${formatTimeShort(startDateIso)}` : ''}
                        </Text>
                    </View>

                    {/* 5 métricas (Distância, Tempo, Pace, Elev Gan, Elev Max) */}
                    <View style={styles.metricsRow}>
                        <MetricCell label="Distância" value={`${distanceKmStr} Km`} />
                        <MetricCell label="Tempo" value={timeStr} />
                        <MetricCell label="Pace" value={`${avgPaceStr} /Km`} />
                        <MetricCell label="Elev. Gan" value={`${Math.round(elevationGain)} m`} />
                        <MetricCell label="Elev Max" value={`${summary.maxAltitudeM} m`} />
                    </View>

                    {/* Métricas Detalhadas (Planejado vs Real) */}
                    <View style={styles.cardDark}>
                        <View style={styles.detailedHeader}>
                            <Text style={styles.cardTitleLeft}>Métricas Detalhadas</Text>
                            <View style={styles.detailedBadge}>
                                <Text style={styles.detailedBadgeText}>Planejado vs Real</Text>
                            </View>
                        </View>

                        <View style={styles.detailedTableHeader}>
                            <Text style={[styles.detailedTableHeaderText, { flex: 1.4 }]}>Métrica</Text>
                            <Text style={[styles.detailedTableHeaderText, { flex: 1, textAlign: 'center' }]}>Meta</Text>
                            <Text style={[styles.detailedTableHeaderText, { flex: 1, textAlign: 'right' }]}>Executado</Text>
                        </View>

                        <DetailedRow
                            iconName="speedometer"
                            iconColor={T.cyan}
                            iconBg="rgba(0,212,255,0.15)"
                            label="Pace"
                            target={targetPaceSeconds ? `${formatPaceSeconds(targetPaceSeconds)} /km` : '--'}
                            executed={`${avgPaceStr} /km`}
                            status={paceStatus}
                            delta={paceStatus
                                ? statusLabel(avgPaceSeconds, targetPaceSeconds!, (n) => `${Math.round(n)}s`)
                                : null}
                        />
                        <DetailedRow
                            iconName="navigate"
                            iconColor={T.purple}
                            iconBg="rgba(151,71,255,0.18)"
                            label="Distância"
                            target={targetDistanceKm ? `${targetDistanceKm.toFixed(1)} km` : '--'}
                            executed={`${distanceKmStr} km`}
                            status={distanceStatus}
                            delta={distanceStatus
                                ? statusLabel(distanceKm, targetDistanceKm!, (n) => `${n.toFixed(2)} km`)
                                : null}
                        />
                        <DetailedRow
                            iconName="trending-up"
                            iconColor={T.warning}
                            iconBg="rgba(255,196,0,0.18)"
                            label="Elevação"
                            target="--"
                            executed={`${Math.round(elevationGain)} m`}
                            status={null}
                            delta={null}
                            isLast
                        />
                    </View>

                    {/* Splits */}
                    <View style={styles.cardDark}>
                        <Text style={styles.cardTitle}>Splits</Text>
                        {splits.length > 0 ? (
                            <>
                                <View style={styles.splitsHeader}>
                                    <Text style={[styles.splitsHeaderText, styles.colKm]}>Km</Text>
                                    <Text style={[styles.splitsHeaderText, styles.colPace]}>Pace</Text>
                                    <View style={styles.colBar} />
                                    <Text style={[styles.splitsHeaderText, styles.colElev]}>Elev</Text>
                                </View>
                                <View style={styles.splitsBody}>
                                    {splits.map((s) => (
                                        <SplitRow key={s.kmNumber} split={s} />
                                    ))}
                                </View>
                            </>
                        ) : (
                            <CardEmptyState
                                icon="speedometer-outline"
                                title={enriching ? 'Carregando splits...' : 'Sem splits para esse treino'}
                                subtitle={enriching ? undefined : 'Treinos curtos ou sem GPS contínuo não geram splits.'}
                                loading={enriching}
                            />
                        )}
                    </View>

                    {/* Pace */}
                    <View style={styles.cardDark}>
                        <View style={styles.paceCardHeader}>
                            <Text style={styles.cardTitle}>Pace</Text>
                            <Text style={styles.chartUnitInline}>min/km</Text>
                        </View>
                        {paceChart.length > 1 ? (
                            <>
                                <View style={styles.chartWrap}>
                                    <LineChart
                                        data={chartCfg.data}
                                        height={170}
                                        width={chartCfg.width}
                                        thickness={2}
                                        color={T.cyan}
                                        areaChart
                                        curved
                                        startFillColor={T.cyan}
                                        endFillColor={T.cyan}
                                        startOpacity={0.45}
                                        endOpacity={0.05}
                                        initialSpacing={CHART_INITIAL_SPACING}
                                        endSpacing={CHART_END_SPACING}
                                        spacing={chartCfg.spacing}
                                        yAxisColor="transparent"
                                        xAxisColor={T.divider}
                                        rulesType="solid"
                                        rulesColor="rgba(235,235,245,0.06)"
                                        yAxisTextStyle={styles.chartAxisText}
                                        xAxisLabelTextStyle={styles.chartAxisLabelText}
                                        yAxisLabelTexts={chartCfg.yAxisLabelTexts}
                                        noOfSections={chartCfg.yAxisLabelTexts.length - 1}
                                        maxValue={chartCfg.maxValue}
                                        yAxisLabelWidth={CHART_Y_AXIS_LABEL_WIDTH}
                                        yAxisLabelSuffix=""
                                        xAxisLabelTexts={chartCfg.xLabels}
                                        showVerticalLines={false}
                                        hideDataPoints={false}
                                        dataPointsRadius={3.5}
                                        dataPointsColor={'#FFFFFF'}
                                        dataPointsShape={'circular'}
                                        showReferenceLine1={chartCfg.refValue > 0}
                                        referenceLine1Position={chartCfg.refValue}
                                        referenceLine1Config={{
                                            color: 'rgba(255,255,255,0.35)',
                                            dashWidth: 4,
                                            dashGap: 3,
                                            thickness: 1,
                                        }}
                                    />
                                </View>
                                <View style={styles.paceList}>
                                    <PaceStatRow label="Pace" value={`${avgPaceStr} /Km`} />
                                    <PaceStatRow label="Tempo" value={timeStr} />
                                    <PaceStatRow
                                        label="Pace mais lento"
                                        value={`${formatPaceSeconds(summary.worstPaceSecondsPerKm)} /Km`}
                                    />
                                    <PaceStatRow
                                        label="Melhor pace"
                                        value={`${formatPaceSeconds(summary.bestPaceSecondsPerKm)} /Km`}
                                        isLast
                                    />
                                </View>
                            </>
                        ) : (
                            <>
                                <CardEmptyState
                                    icon="trending-up-outline"
                                    title={enriching ? 'Carregando gráfico...' : 'Sem variação de pace registrada'}
                                    subtitle={enriching ? undefined : 'Sem GPS suficiente para gerar a curva.'}
                                    loading={enriching}
                                />
                                <View style={styles.paceList}>
                                    <PaceStatRow label="Pace" value={`${avgPaceStr} /Km`} />
                                    <PaceStatRow label="Tempo" value={timeStr} isLast />
                                </View>
                            </>
                        )}
                    </View>

                    {/* Análise Inteligente */}
                    <View style={styles.analysisHeader}>
                        <Text style={styles.sectionTitle}>Análise Inteligente</Text>
                        <Ionicons name="bulb" size={20} color={T.cyan} />
                    </View>

                    {strength ? (
                        <AnalysisCard
                            tone="success"
                            icon="thumbs-up"
                            title={strength.title}
                            description={strength.description}
                        />
                    ) : (
                        <AnalysisCard
                            tone="success"
                            icon="thumbs-up"
                            title="Ponto Forte"
                            description={showLoading
                                ? 'Carregando análise...'
                                : 'Complete um treino para receber análise personalizada.'}
                        />
                    )}

                    {improvement ? (
                        <AnalysisCard
                            tone="warning"
                            icon="warning"
                            title={improvement.title}
                            description={improvement.description}
                            tip={improvement.tip}
                        />
                    ) : (
                        <AnalysisCard
                            tone="warning"
                            icon="warning"
                            title="Área de Melhoria"
                            description={showLoading
                                ? 'Carregando análise...'
                                : 'Aguardando dados do treino para análise.'}
                        />
                    )}

                    {/* VO² Máximo Estimado */}
                    <View style={[styles.cardDark, styles.vo2Card]}>
                        <View style={styles.vo2Header}>
                            <Ionicons name="pulse" size={20} color={T.cyan} />
                            <Text style={styles.vo2Title}>VO² Máximo Estimado</Text>
                        </View>
                        <View style={styles.vo2Body}>
                            <View style={styles.vo2ValueWrap}>
                                <Text style={styles.vo2Value}>
                                    {vo2?.is_valid ? vo2.current_value.toFixed(1) : '--'}
                                </Text>
                                <Text style={styles.vo2Unit}>ml/kg/min</Text>
                            </View>
                            {vo2?.is_valid && (
                                <Vo2Trend
                                    isInterrupted={vo2.is_interrupted}
                                    trendPercent={vo2.trend_percent}
                                />
                            )}
                        </View>
                        {(vo2?.message || !vo2?.is_valid) && (
                            <Text style={styles.vo2Message}>
                                {vo2?.message || 'Dados insuficientes para cálculo'}
                            </Text>
                        )}
                    </View>

                    {/* Conquista (XP / Badge) */}
                    <ConquestCard conquest={conquest} />

                    {/* Tip — monitor cardíaco */}
                    <View style={styles.tipCard}>
                        <Ionicons name="notifications" size={22} color={T.textSecondary} />
                        <Text style={styles.tipText}>
                            Para maior precisão nas zonas de esforço, considere parear um{' '}
                            <Text style={styles.tipBold}>monitor cardíaco</Text> externo.
                        </Text>
                    </View>

                    {/* Concluir */}
                    <TouchableOpacity
                        style={styles.concludeButton}
                        onPress={() => navigation.goBack()}
                        accessibilityRole="button"
                        accessibilityLabel="Concluir"
                    >
                        <Text style={styles.concludeButtonText}>Concluir</Text>
                    </TouchableOpacity>
                </BottomSheetScrollView>
            </BottomSheet>

            {workoutId && (
                <SharingModal
                    visible={sharingVisible}
                    onClose={() => setSharingVisible(false)}
                    workoutId={workoutId}
                />
            )}
        </View>
    );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Avatar({ uri, initials }: { uri: string | null; initials: string }) {
    if (uri) return <Image source={{ uri }} style={styles.avatar} />;
    return (
        <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
    );
}

function MetricCell({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.metricCell}>
            <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {value}
            </Text>
        </View>
    );
}

function CircularScore({
    percentage,
    color = T.cyan,
    loading,
}: { percentage: number; color?: string; loading?: boolean }) {
    const SIZE = 116;
    const STROKE = 3;
    const radius = (SIZE - STROKE * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - percentage / 100);

    if (Platform.OS === 'web') {
        return (
            <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
                <svg width={SIZE} height={SIZE}>
                    <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} stroke={T.divider} strokeWidth={STROKE} fill={T.cardDarker} />
                    <circle
                        cx={SIZE / 2} cy={SIZE / 2} r={radius}
                        stroke={color} strokeWidth={STROKE} fill="none"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                    />
                </svg>
                <View style={styles.scoreInner}>
                    {loading ? (
                        <ActivityIndicator color={color} />
                    ) : (
                        <Ionicons name="checkmark" size={36} color={color} />
                    )}
                </View>
                <Text style={[styles.scorePercent, { color }]}>{percentage}%</Text>
            </View>
        );
    }
    return (
        <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <View style={[styles.scoreRing, { borderColor: color }]}>
                {loading ? (
                    <ActivityIndicator color={color} />
                ) : (
                    <View style={[styles.scoreInnerCircle, { backgroundColor: color }]}>
                        <Ionicons name="checkmark" size={28} color={T.cardDarker} />
                    </View>
                )}
            </View>
            <Text style={[styles.scorePercent, { color }]}>{percentage}%</Text>
        </View>
    );
}

function DetailedRow({
    iconName, iconColor, iconBg, label, target, executed, status, delta, isLast,
}: {
    iconName: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBg: string;
    label: string;
    target: string;
    executed: string;
    status: Status | null;
    delta: string | null;
    isLast?: boolean;
}) {
    const color = status ? statusColor(status) : T.cyan;
    return (
        <View style={[styles.detailedRow, !isLast && styles.detailedRowBorder]}>
            <View style={styles.detailedCellMetric}>
                <View style={[styles.detailedIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={iconName} size={16} color={iconColor} />
                </View>
                <Text style={styles.detailedLabel}>{label}</Text>
            </View>
            <Text style={styles.detailedTarget}>{target}</Text>
            <View style={styles.detailedExecuted}>
                <Text style={[styles.detailedExecutedValue, { color }]}>{executed}</Text>
                {delta && (
                    <View style={[styles.detailedDeltaBadge, { backgroundColor: color + '22', borderColor: color }]}>
                        <View style={[styles.detailedDeltaDot, { backgroundColor: color }]} />
                        <Text style={[styles.detailedDeltaText, { color }]}>{delta}</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

function SplitRow({ split }: { split: SplitData }) {
    const isFractional = split.distanceMeters < 1000;
    return (
        <View style={styles.splitRow}>
            <View style={styles.colKm}>
                <Text style={styles.splitKmText}>
                    {split.kmNumber}
                    {isFractional && (
                        <Text style={styles.splitFraction}>
                            {` (${(split.distanceMeters / 1000).toFixed(2)})`}
                        </Text>
                    )}
                </Text>
            </View>
            <View style={styles.colPace}>
                <Text style={styles.splitText}>{formatPaceSeconds(split.paceSecondsPerKm)}</Text>
            </View>
            <View style={styles.colBar}>
                <View style={[styles.splitBar, { width: `${Math.max(8, split.barWidthRatio * 100)}%` }]} />
            </View>
            <View style={styles.colElev}>
                <Text style={styles.splitText}>
                    {split.elevationGainM > 0 ? `+${split.elevationGainM}` : split.elevationGainM === 0 ? '0' : split.elevationGainM}
                </Text>
            </View>
        </View>
    );
}

function CardEmptyState({
    icon, title, subtitle, loading,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    loading?: boolean;
}) {
    return (
        <View style={styles.emptyState}>
            {loading ? (
                <ActivityIndicator size="small" color={T.cyan} />
            ) : (
                <View style={styles.emptyStateIconWrap}>
                    <Ionicons name={icon} size={22} color={T.textSecondary} />
                </View>
            )}
            <Text style={styles.emptyStateTitle}>{title}</Text>
            {subtitle && <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>}
        </View>
    );
}

function PaceStatRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
    return (
        <View style={[styles.paceStatRow, !isLast && styles.paceStatRowBorder]}>
            <Text style={styles.paceStatLabel}>{label}</Text>
            <Text style={styles.paceStatValue}>{value}</Text>
        </View>
    );
}

function AnalysisCard({
    tone, icon, title, description, tip,
}: {
    tone: 'success' | 'warning';
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
    tip?: string;
}) {
    const color = tone === 'success' ? T.success : T.warning;
    return (
        <View style={[styles.analysisCard, { borderColor: color, backgroundColor: color + '1F' }]}>
            <View style={styles.analysisCardIcon}>
                <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={styles.analysisCardContent}>
                <Text style={styles.analysisCardTitle}>{title}</Text>
                <Text style={styles.analysisCardText}>{description}</Text>
                {tip && (
                    <Text style={[styles.analysisCardText, { marginTop: 6 }]}>
                        <Text style={styles.analysisTipLabel}>Dica: </Text>
                        {tip}
                    </Text>
                )}
            </View>
        </View>
    );
}

function Vo2Trend({
    isInterrupted, trendPercent,
}: { isInterrupted: boolean; trendPercent: number }) {
    const positive = !isInterrupted && trendPercent >= 0;
    const color = isInterrupted ? T.textMuted : positive ? T.success : T.danger;
    const bg = isInterrupted ? 'rgba(156,163,175,0.15)'
        : positive ? 'rgba(50,205,50,0.15)' : 'rgba(255,107,107,0.15)';
    const txt = isInterrupted
        ? '0.0%'
        : `${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%`;
    return (
        <View style={[styles.vo2TrendBadge, { backgroundColor: bg }]}>
            <Ionicons name="trending-up" size={14} color={color} />
            <Text style={[styles.vo2TrendText, { color }]}>{txt}</Text>
        </View>
    );
}

function ConquestCard({ conquest }: { conquest: any }) {
    if (!conquest) {
        return (
            <View style={[styles.cardDark, styles.conquestCard]}>
                <View style={styles.conquestHeader}>
                    <Ionicons name="trophy" size={26} color={T.warning} />
                    <Text style={styles.conquestLabel}>CONQUISTA</Text>
                </View>
                <Text style={styles.conquestTitle}>Carregando...</Text>
            </View>
        );
    }

    if (conquest.goal_met) {
        return (
            <View style={[styles.cardDark, styles.conquestCard, styles.conquestCardSuccess]}>
                <View style={styles.conquestHeader}>
                    <Ionicons name="trophy" size={26} color={T.warning} />
                    <Text style={styles.conquestLabel}>CONQUISTA</Text>
                </View>
                <View style={styles.conquestBody}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.conquestTitle}>Meta Alcançada!</Text>
                        <Text style={styles.conquestSub}>
                            {conquest.executed_distance_km.toFixed(1)} km de {conquest.planned_distance_km} km
                        </Text>
                        <Text style={styles.conquestXp}>+{conquest.xp_earned} XP</Text>
                    </View>
                    <View style={styles.medalCircle}>
                        <Ionicons name="medal" size={32} color={T.warning} />
                    </View>
                </View>
            </View>
        );
    }

    if (conquest.has_linked_workout) {
        return (
            <View style={[styles.cardDark, styles.conquestCard, styles.conquestCardFailed]}>
                <View style={styles.conquestHeader}>
                    <Ionicons name="warning" size={22} color={T.danger} />
                    <Text style={[styles.conquestLabel, { color: T.danger }]}>META NÃO BATIDA</Text>
                </View>
                <View style={styles.conquestBody}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.conquestTitle}>Objetivo Não Atingido</Text>
                        <Text style={styles.conquestSub}>
                            {conquest.executed_distance_km.toFixed(1)} km de {conquest.planned_distance_km} km planejados
                        </Text>
                        <Text style={[styles.conquestXp, { color: T.danger }]}>Nenhum XP contabilizado</Text>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.cardDark, styles.conquestCard]}>
            <View style={styles.conquestHeader}>
                <Ionicons name="trophy" size={26} color={T.warning} />
                <Text style={styles.conquestLabel}>ATIVIDADE LIVRE</Text>
            </View>
            <View style={styles.conquestBody}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.conquestTitle}>Corrida Avulsa</Text>
                    <Text style={styles.conquestSub}>
                        {conquest.executed_distance_km.toFixed(1)} km percorridos
                    </Text>
                    <Text style={styles.conquestXp}>+{conquest.xp_earned} XP</Text>
                </View>
            </View>
        </View>
    );
}

// ─── Chart helpers ────────────────────────────────────────────────────────────
interface ChartConfig {
    data: { value: number }[];
    yAxisLabelTexts: string[];
    maxValue: number;
    refValue: number;
    xLabels: string[];
    width: number;
    spacing: number;
}
const CHART_Y_AXIS_LABEL_WIDTH = 40;
const CHART_INITIAL_SPACING = 8;
const CHART_END_SPACING = 12;

function buildChartConfig(
    paceChart: { distanceKm: number; paceSecondsPerKm: number }[],
    avgPace: number,
    availableWidth: number,
): ChartConfig {
    if (paceChart.length === 0) {
        return { data: [], yAxisLabelTexts: [], maxValue: 0, refValue: 0, xLabels: [], width: availableWidth, spacing: 0 };
    }
    const allPaces = paceChart.map((p) => p.paceSecondsPerKm);
    const rawMin = Math.min(...allPaces);
    const rawMax = Math.max(...allPaces);
    const paceMinFloor = Math.max(60, Math.floor(rawMin / 60) * 60);
    const paceMaxCeil = Math.max(paceMinFloor + 60, Math.ceil(rawMax / 60) * 60);
    const range = paceMaxCeil - paceMinFloor;

    const data = paceChart.map((p) => ({ value: paceMaxCeil - p.paceSecondsPerKm }));

    const ySteps = Math.min(5, Math.max(3, Math.round(range / 60)));
    const yAxisLabelTexts: string[] = [];
    for (let i = 0; i <= ySteps; i++) {
        const pace = paceMaxCeil - (range / ySteps) * i;
        yAxisLabelTexts.push(formatPaceSeconds(pace));
    }
    const refValue = avgPace > 0 ? Math.max(0, paceMaxCeil - avgPace) : 0;

    const targetLabels = 4;
    const stride = Math.max(1, Math.round((paceChart.length - 1) / (targetLabels - 1)));
    const xLabels: string[] = paceChart.map((p, i) => {
        const isLast = i === paceChart.length - 1;
        if (i === 0 || isLast || i % stride === 0) return `${p.distanceKm.toFixed(1)} km`;
        return '';
    });

    const drawableWidth = Math.max(
        1,
        availableWidth - CHART_Y_AXIS_LABEL_WIDTH - CHART_INITIAL_SPACING - CHART_END_SPACING,
    );
    const spacing = drawableWidth / Math.max(paceChart.length - 1, 1);

    return { data, yAxisLabelTexts, maxValue: range, refValue, xLabels, width: availableWidth, spacing };
}

function formatTimeShort(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: T.bgPrimary },

    // Header overlay
    topOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        zIndex: 10,
    },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(14, 14, 31, 0.85)',
        alignItems: 'center', justifyContent: 'center',
    },
    titlePill: {
        backgroundColor: 'rgba(14, 14, 31, 0.85)',
        paddingHorizontal: 18, paddingVertical: 6,
        borderRadius: 18, alignItems: 'center',
    },
    titlePillSub: { color: T.cyan, fontSize: 11, fontWeight: '500' },
    titlePillMain: { color: T.textPrimary, fontSize: 14, fontWeight: '700' },

    // Bottom sheet
    sheetBackground: {
        backgroundColor: T.cardSurface,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
    },
    sheetHandle: { backgroundColor: 'rgba(235,235,245,0.10)', width: 60, height: 6 },
    sheetContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

    // User row
    userRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingTop: 4, paddingBottom: 14,
    },
    avatar: { width: 47, height: 47, borderRadius: 24, backgroundColor: T.cardDarker },
    avatarFallback: {
        backgroundColor: 'rgba(0, 212, 255, 0.18)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: T.cyan,
    },
    avatarInitials: { color: T.cyan, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
    userTextWrap: { flex: 1, minWidth: 0 },
    userName: { color: T.textPrimary, fontSize: 14, fontWeight: '700', lineHeight: 20 },
    userDate: { color: T.textSecondary, fontSize: 10, fontWeight: '500', lineHeight: 15, marginTop: 2 },

    // Hero block
    heroBlock: { alignItems: 'center', paddingVertical: 12, marginBottom: 18 },
    heroMessage: {
        color: T.textPrimary, fontSize: 18, fontWeight: '700',
        textAlign: 'center', marginTop: 28, paddingHorizontal: 20,
    },
    heroSubtitle: {
        color: T.textSecondary, fontSize: 13, fontWeight: '500',
        textAlign: 'center', marginTop: 6,
    },
    scoreRing: {
        width: 96, height: 96, borderRadius: 48,
        borderWidth: 3, backgroundColor: T.cardDarker,
        alignItems: 'center', justifyContent: 'center',
    },
    scoreInnerCircle: {
        width: 39, height: 39, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    scoreInner: {
        position: 'absolute', alignItems: 'center', justifyContent: 'center',
    },
    scorePercent: {
        position: 'absolute', bottom: -22,
        fontSize: 14, fontWeight: '700',
    },

    // 5 metrics
    metricsRow: { flexDirection: 'row', paddingVertical: 8, marginBottom: 18 },
    metricCell: { flex: 1, alignItems: 'center', paddingHorizontal: 2, gap: 6 },
    metricLabel: { color: T.textSecondary, fontSize: 11, fontWeight: '500' },
    metricValue: { color: T.textPrimary, fontSize: 14, fontWeight: '600' },

    // Cards (genérico)
    cardDark: {
        backgroundColor: T.cardDarker,
        borderRadius: 20,
        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16,
        marginBottom: 14,
    },
    cardTitle: {
        color: T.textPrimary, fontSize: 20, fontWeight: '700',
        textAlign: 'center', paddingBottom: 16,
    },
    cardTitleLeft: {
        color: T.textPrimary, fontSize: 16, fontWeight: '700',
    },

    // Métricas detalhadas
    detailedHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14,
    },
    detailedBadge: {
        backgroundColor: T.cyanSoft,
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    },
    detailedBadgeText: { fontSize: 11, color: T.cyan, fontWeight: '600' },
    detailedTableHeader: {
        flexDirection: 'row',
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.divider,
    },
    detailedTableHeaderText: { fontSize: 11, color: T.textSecondary, fontWeight: '500' },
    detailedRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    },
    detailedRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(235,235,245,0.06)',
    },
    detailedCellMetric: { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailedIcon: {
        width: 28, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    detailedLabel: { color: T.textPrimary, fontSize: 13, fontWeight: '600' },
    detailedTarget: {
        flex: 1, color: T.textSecondary, fontSize: 13, textAlign: 'center',
    },
    detailedExecuted: { flex: 1, alignItems: 'flex-end', gap: 4 },
    detailedExecutedValue: { fontSize: 14, fontWeight: '700' },
    detailedDeltaBadge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 8, borderWidth: 1, gap: 4,
    },
    detailedDeltaDot: { width: 5, height: 5, borderRadius: 3 },
    detailedDeltaText: { fontSize: 10, fontWeight: '700' },

    // Splits
    colKm: { width: 48, paddingLeft: 4, justifyContent: 'center' },
    colPace: { width: 56, justifyContent: 'center' },
    colBar: { flex: 1, height: 16, justifyContent: 'center', paddingHorizontal: 6 },
    colElev: { width: 44, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 4 },
    splitsHeader: {
        flexDirection: 'row', alignItems: 'center', paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(235,235,245,0.10)',
    },
    splitsHeaderText: { color: T.textSecondary, fontSize: 13, fontWeight: '500' },
    splitsBody: { paddingTop: 4 },
    splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    splitKmText: { color: T.textSecondary, fontSize: 13, fontWeight: '500' },
    splitFraction: { color: T.textMuted, fontSize: 11, fontWeight: '400' },
    splitText: { color: T.textSecondary, fontSize: 13, fontWeight: '500' },
    splitBar: { height: 8, backgroundColor: T.cyan, borderRadius: 4 },

    // Pace card
    paceCardHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', position: 'relative',
    },
    chartUnitInline: {
        position: 'absolute', right: 0, top: 4,
        color: T.textSecondary, fontSize: 11, fontWeight: '500',
    },
    chartWrap: { paddingTop: 4, paddingBottom: 8, minHeight: 200, overflow: 'hidden' },
    chartAxisText: { color: T.textSecondary, fontSize: 10 },
    chartAxisLabelText: {
        color: T.textSecondary, fontSize: 10, width: 48,
        textAlign: 'center', marginLeft: -24,
    },
    paceList: { marginTop: 12, paddingTop: 4 },
    paceStatRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, paddingHorizontal: 8,
    },
    paceStatRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(235,235,245,0.08)',
    },
    paceStatLabel: { color: T.textSecondary, fontSize: 15, fontWeight: '500' },
    paceStatValue: { color: T.textPrimary, fontSize: 16, fontWeight: '600' },

    // Map overlay
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center', justifyContent: 'flex-start', paddingTop: 110,
    },
    mapOverlayPill: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
        backgroundColor: 'rgba(14, 14, 31, 0.85)',
        borderWidth: 1, borderColor: 'rgba(235, 235, 245, 0.10)',
    },
    mapOverlayText: { color: T.textSecondary, fontSize: 12, fontWeight: '500' },

    // Empty states
    emptyState: { paddingVertical: 18, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
    emptyStateIconWrap: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(235, 235, 245, 0.06)',
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    emptyStateTitle: { color: T.textPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center' },
    emptyStateSubtitle: {
        color: T.textSecondary, fontSize: 11,
        textAlign: 'center', paddingHorizontal: 12, lineHeight: 16,
    },

    // Análise inteligente
    analysisHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 4, marginBottom: 12, paddingHorizontal: 4,
    },
    sectionTitle: { color: T.textPrimary, fontSize: 16, fontWeight: '700' },
    analysisCard: {
        flexDirection: 'row', borderRadius: 20, padding: 16,
        marginBottom: 12, borderWidth: 2,
    },
    analysisCardIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 12,
    },
    analysisCardContent: { flex: 1 },
    analysisCardTitle: { color: T.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    analysisCardText: { color: T.textSecondary, fontSize: 13, lineHeight: 18 },
    analysisTipLabel: { color: '#FFA500', fontWeight: '700' },

    // VO2
    vo2Card: { borderWidth: 1, borderColor: 'rgba(0,212,255,0.30)' },
    vo2Header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    vo2Title: { color: T.cyan, fontSize: 14, fontWeight: '700' },
    vo2Body: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    vo2ValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    vo2Value: { color: T.textPrimary, fontSize: 38, fontWeight: '700' },
    vo2Unit: { color: T.textSecondary, fontSize: 13 },
    vo2TrendBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    },
    vo2TrendText: { fontSize: 13, fontWeight: '700' },
    vo2Message: {
        color: T.textMuted, fontSize: 12, fontStyle: 'italic',
        marginTop: 8,
    },

    // Conquista
    conquestCard: { paddingVertical: 18 },
    conquestCardSuccess: {
        borderWidth: 1, borderColor: 'rgba(255,196,0,0.30)',
    },
    conquestCardFailed: {
        borderWidth: 1, borderColor: 'rgba(255,69,58,0.30)',
    },
    conquestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    conquestLabel: {
        color: T.warning, fontSize: 13, fontWeight: '700', letterSpacing: 1,
    },
    conquestBody: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    conquestTitle: { color: T.textPrimary, fontSize: 18, fontWeight: '700' },
    conquestSub: { color: T.textSecondary, fontSize: 13, marginTop: 2 },
    conquestXp: { color: T.gold, fontSize: 14, fontWeight: '700', marginTop: 8 },
    medalCircle: {
        width: 56, height: 56, borderRadius: 28,
        borderWidth: 2, borderColor: T.warning,
        backgroundColor: 'rgba(255,196,0,0.10)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Tip
    tipCard: {
        flexDirection: 'row', backgroundColor: T.cardDarker,
        borderRadius: 20, padding: 16, gap: 12,
        marginBottom: 18, alignItems: 'flex-start',
    },
    tipText: { flex: 1, color: 'rgba(235,235,245,0.80)', fontSize: 13, lineHeight: 18 },
    tipBold: { color: T.textPrimary, fontWeight: '700' },

    // Botão Concluir
    concludeButton: {
        backgroundColor: T.cyan, paddingVertical: 16,
        borderRadius: 15, alignItems: 'center',
        marginTop: 4, marginBottom: 4,
    },
    concludeButtonText: { color: T.textPrimary, fontSize: 18, fontWeight: '700' },
});
