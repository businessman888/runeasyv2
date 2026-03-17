import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../theme';
import { useTracking } from '../../hooks/useTracking';

const COLORS = {
  background: colors.background,
  surface: colors.card,
  text: colors.text,
  textMuted: colors.textSecondary,
  routeOrange: colors.primary,
  btnTraining: '#00D1FF',
  btnPaused: '#FFC107',
};

export function RunningScreen() {
  const navigation = useNavigation();
  const [hasGPSFix, setHasGPSFix] = useState(false);
  const {
    isReady,
    sessionState,
    routeCoordinates,
    distance,
    currentPace,
    formattedTime,
    startResumeTracking,
    pauseTracking,
    finishTracking,
  } = useTracking();

  if (!isReady) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Carregando módulo GPS...</Text>
      </View>
    );
  }

  const geoJsonSource = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates.length > 0 ? routeCoordinates : [[0, 0]],
        },
      },
    ],
  };

  const statusBannerColor =
    sessionState === 'training'
      ? COLORS.btnTraining
      : sessionState === 'paused'
      ? COLORS.btnPaused
      : COLORS.surface;

  const statusText =
    sessionState === 'calculating'
      ? hasGPSFix ? 'GPS Pronto' : 'Calculando GPS'
      : sessionState === 'training'
      ? 'Treinando'
      : 'Parado';

  const statusTextColor = sessionState === 'calculating' ? COLORS.btnTraining : '#0B0D17';

  return (
    <View style={styles.container}>

      {/* Mapa full-screen em background */}
      <Mapbox.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/dark-v11'}
        logoEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          pitch={0}
          zoomLevel={16}
          followUserLocation={true}
          followUserMode={Mapbox.UserTrackingMode.FollowWithHeading}
        />
        <Mapbox.UserLocation
          visible={true}
          showsUserHeadingIndicator
          onUpdate={() => { if (!hasGPSFix) setHasGPSFix(true); }}
        />
        {routeCoordinates.length > 0 && (
          <Mapbox.ShapeSource id="routeSource" shape={geoJsonSource as any}>
            <Mapbox.LineLayer
              id="routeFill"
              style={{
                lineColor: COLORS.routeOrange,
                lineWidth: 5,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>

      {/* Botão voltar — overlay no topo */}
      <SafeAreaView style={styles.topOverlay} edges={['top']}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </Pressable>
      </SafeAreaView>

      {/* Painel flutuante inferior */}
      <SafeAreaView style={styles.bottomPanel} edges={['bottom']}>

        {/* Banner de status */}
        <View style={[styles.statusBanner, { backgroundColor: statusBannerColor }]}>
          <Text style={[styles.statusText, { color: statusTextColor }]}>{statusText}</Text>
        </View>

        {/* Métricas */}
        <View style={styles.rowSpecs}>
          <View style={styles.specBox}>
            <Text style={styles.specVal}>{formattedTime}</Text>
            <Text style={styles.specLabel}>Tempo</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specVal}>{currentPace}</Text>
            <Text style={styles.specLabel}>Pace</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specVal}>{(distance / 1000).toFixed(2)}</Text>
            <Text style={styles.specLabel}>Distância</Text>
          </View>
        </View>

        {/* Botões de controle */}
        <View style={styles.btnRow}>
          {sessionState === 'calculating' && (
            <Pressable
              style={[styles.controlBtn, { borderColor: COLORS.text, borderWidth: 1 }]}
              onPress={startResumeTracking}
            >
              <Ionicons name="play" color="white" size={20} />
              <Text style={styles.controlBtnText}>Iniciar</Text>
            </Pressable>
          )}
          {sessionState === 'training' && (
            <Pressable
              style={[styles.controlBtn, { borderColor: COLORS.btnTraining, borderWidth: 1 }]}
              onPress={pauseTracking}
            >
              <Ionicons name="pause" color={COLORS.btnTraining} size={20} />
              <Text style={[styles.controlBtnText, { color: COLORS.btnTraining }]}>Parar</Text>
            </Pressable>
          )}
          {sessionState === 'paused' && (
            <>
              <Pressable style={[styles.controlBtn, styles.resumeBtn]} onPress={startResumeTracking}>
                <Ionicons name="play" color={COLORS.btnTraining} size={20} />
                <Text style={[styles.controlBtnText, { color: COLORS.btnTraining }]}>Continuar</Text>
              </Pressable>
              <Pressable style={[styles.controlBtn, styles.finishBtn]} onPress={finishTracking}>
                <Ionicons name="flag" color="#0B0D17" size={20} />
                <Text style={[styles.controlBtnText, { color: '#0B0D17' }]}>Finalizar</Text>
              </Pressable>
            </>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backBtn: {
    margin: 16,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 22,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
  },
  statusBanner: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontWeight: '700',
    fontSize: 14,
  },
  rowSpecs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    backgroundColor: COLORS.surface,
  },
  specBox: {
    alignItems: 'center',
  },
  specVal: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: typography.fontWeights.bold as any,
  },
  specLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: typography.fontWeights.normal as any,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
    gap: 15,
    paddingHorizontal: 20,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 140,
  },
  controlBtnText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
  resumeBtn: {
    borderColor: COLORS.btnTraining,
    borderWidth: 1,
    flex: 1,
  },
  finishBtn: {
    backgroundColor: COLORS.btnTraining,
    flex: 1,
  },
});
