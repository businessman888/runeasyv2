import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, typography } from '../../theme';
import { useTracking } from '../../hooks/useTracking';

// Em devices que precisam de inicialização prévia
// Mapbox.setTelemetryEnabled(false);

const COLORS = {
  background: colors.background, // Usa do design system base
  surface: colors.card,
  text: colors.text,
  textMuted: colors.textSecondary,
  routeOrange: colors.primary, // Laranja
  btnTraining: '#00D1FF',      // Cyan do figma
  btnPaused: '#FFC107',        // Amarelo
};

export function RunningScreen() {
  const navigation = useNavigation();
  const {
      isReady,
      sessionState,
      routeCoordinates,
      distance,
      currentPace,
      formattedTime,
      startResumeTracking,
      pauseTracking,
      finishTracking
  } = useTracking();

  if (!isReady) {
      return (
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center'}]}>
              <Text style={{color: 'white'}}>Carregando módulo GPS...</Text>
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
          coordinates: routeCoordinates.length > 0 ? routeCoordinates : [[0,0]], // Fallback pro mapbox não quebrar
        },
      },
    ],
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      
      <View style={styles.mapContainer}>
        {/* Back button */}
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </Pressable>

        <Mapbox.MapView 
            style={styles.map} 
            styleURL={process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL}
            logoEnabled={false}
            compassEnabled={false}
            attributionEnabled={false}
        >
          <Mapbox.Camera
            pitch={75}
            zoomLevel={16}
            followUserLocation={sessionState !== 'calculating'}
            followUserMode={Mapbox.UserTrackingMode.FollowWithHeading}
          />
          <Mapbox.UserLocation visible={true} showsUserHeadingIndicator />
          
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
      </View>

      <View style={styles.metricsPanel}>
        {/* Banner Status */}
        <View style={[
          styles.statusBanner, 
          { backgroundColor: sessionState === 'calculating' ? COLORS.surface : sessionState === 'training' ? COLORS.btnTraining : COLORS.btnPaused }
        ]}>
          <Text style={[styles.statusText, {color: sessionState === 'calculating' ? COLORS.btnTraining : '#0B0D17'}]}>
             {sessionState === 'calculating' ? 'Calculando GPS' : sessionState === 'training' ? 'Treinando' : 'Parado'}
          </Text>
        </View>

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

        <View style={styles.btnRow}>
           {sessionState === 'calculating' && (
             <Pressable style={[styles.controlBtn, {borderColor: COLORS.text, borderWidth: 1}]} onPress={startResumeTracking}>
               <Ionicons name="play" color="white" size={20} />
               <Text style={styles.controlBtnText}>Iniciar</Text>
             </Pressable>
           )}
           {sessionState === 'training' && (
             <Pressable style={[styles.controlBtn, {borderColor: COLORS.btnTraining, borderWidth: 1}]} onPress={pauseTracking}>
               <Ionicons name="pause" color={COLORS.btnTraining} size={20} />
               <Text style={[styles.controlBtnText, {color: COLORS.btnTraining}]}>Parar</Text>
             </Pressable>
           )}
           {sessionState === 'paused' && (
             <>
               <Pressable style={[styles.controlBtn, styles.resumeBtn]} onPress={startResumeTracking}>
                 <Ionicons name="play" color={COLORS.btnTraining} size={20} />
                 <Text style={[styles.controlBtnText, {color: COLORS.btnTraining}]}>Continuar</Text>
               </Pressable>
               <Pressable style={[styles.controlBtn, styles.finishBtn]} onPress={finishTracking}>
                 <Ionicons name="flag" color="#0B0D17" size={20} />
                 <Text style={[styles.controlBtnText, {color: '#0B0D17'}]}>Finalizar</Text>
               </Pressable>
             </>
           )}
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  backBtn: { position: 'absolute', top: 20, left: 20, zIndex: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, overflow: 'hidden'},
  metricsPanel: { backgroundColor: COLORS.background, paddingBottom: 20 },
  statusBanner: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center'},
  statusText: { fontWeight: '700', fontSize: 14 },
  rowSpecs: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 24, backgroundColor: COLORS.surface },
  specBox: { alignItems: 'center' },
  specVal: { color: COLORS.text, fontSize: 24, fontWeight: typography.fontWeights.bold as any },
  specLabel: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, fontWeight: typography.fontWeights.normal as any },
  btnRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 20, paddingBottom: 10, gap: 15, paddingHorizontal: 20 },
  controlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 24, paddingVertical: 16, paddingHorizontal: 32, minWidth: 140 },
  controlBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  resumeBtn: { borderColor: COLORS.btnTraining, borderWidth: 1, flex: 1 },
  finishBtn: { backgroundColor: COLORS.btnTraining, flex: 1 }
});
