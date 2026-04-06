import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { trackingStorage, LOCATION_TRACKING_TASK } from '../tasks/locationTask';

export type SessionState = 'calculating' | 'training' | 'paused' | 'finished';

export function useTracking() {
  const [sessionState, setSessionState] = useState<SessionState>('calculating');
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]); // Array [lng, lat] para o Mapbox
  const [distance, setDistance] = useState(0);
  const [timeMs, setTimeMs] = useState(0); // Tempo em milissegundos
  const [currentPace, setCurrentPace] = useState(0); // minutos por km
  const [isReady, setIsReady] = useState(false);

  // Usa refs para manter valores mutáveis dentro do intervalo de tempo sem causar re-renders exaustivos
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);

  // Carrega estado anterior se houver (recuperação de crash)
  useEffect(() => {
    const initializeTracker = async () => {
      try {
        let { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
          console.warn('Permissão foreground negada');
          // setIsReady(true) ainda é chamado — a tela não pode ficar bloqueada
          setIsReady(true);
          return;
        }

        // No Android 14+, requestBackgroundPermissionsAsync abre as Configurações do sistema
        // e pode retornar 'denied' sem nenhum diálogo. Não bloquear o isReady por isso.
        let { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          console.warn('Permissão background negada — tracking só funcionará em foreground');
        }

        // Tenta recuperar estado local se o app foi fechado no meio de uma corrida
        const savedRouteStr = trackingStorage.getString('route_points');
        if (savedRouteStr) {
          try {
            const parsedPoints = JSON.parse(savedRouteStr);
            if (parsedPoints.length > 0) {
              setRouteCoordinates(parsedPoints.map((p: any) => [p.longitude, p.latitude]));
              setDistance(trackingStorage.getNumber('current_distance') || 0);
              accumulatedTimeRef.current = trackingStorage.getNumber('accumulated_time_ms') || 0;
              setTimeMs(accumulatedTimeRef.current);
              setSessionState('paused'); // Sugere "Retomar" no invés de iniciar do zero
            }
          } catch (e) {
            console.error('Erro ao fazer parse da rota recuperada');
          }
        }
      } catch (e) {
        console.error('[useTracking] Erro na inicialização:', e);
      } finally {
        // Garante que isReady seja true em qualquer cenário (permissão negada, erro, sucesso)
        setIsReady(true);
      }
    };

    initializeTracker();
  }, []);

  // Sync reativo de foreground lendo o state do MMKV periodicamente:
  // (A Background task popula o MMKV por baixo dos panos e aqui nós lemos pra View na UI thread)
  useEffect(() => {
    let syncTimer: NodeJS.Timeout;

    if (sessionState === 'training') {
      syncTimer = setInterval(() => {
        // Sync Distance & Route
        const currentDist = trackingStorage.getNumber('current_distance') || 0;
        setDistance(currentDist);

        const savedRouteStr = trackingStorage.getString('route_points');
        if (savedRouteStr) {
          try {
            const parsed = JSON.parse(savedRouteStr);
            setRouteCoordinates(parsed.map((p: any) => [p.longitude, p.latitude]));
          } catch(e) {}
        }
        
      }, 1000);
    }

    return () => {
      if (syncTimer) clearInterval(syncTimer);
    };
  }, [sessionState]);

  // Cronômetro do frontend
  useEffect(() => {
    if (sessionState === 'training') {
      startTimeRef.current = Date.now();
      
      // Update the timer every second
      timerRef.current = setInterval(() => {
         const now = Date.now();
         const elapsedSinceStart = now - (startTimeRef.current || now);
         const totalMs = accumulatedTimeRef.current + elapsedSinceStart;
         setTimeMs(totalMs);
         trackingStorage.set('accumulated_time_ms', totalMs); // Persiste o tempo também!
      }, 1000);

    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      // Se não está treinando (paused ou calculating), acumula o tempo que passou no ref
      if (startTimeRef.current) {
         const elapsedSinceStart = Date.now() - startTimeRef.current;
         accumulatedTimeRef.current += elapsedSinceStart;
         startTimeRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionState]);

  // Sync Pace médio a cada 3 segundos pra não ficar pulando muito
  useEffect(() => {
     const paceTimer = setInterval(() => {
        if (distance > 50 && timeMs > 0) { // Só calcula pace depois de 50 metros no mínimo
            // Distância em km
            const distanceKm = distance / 1000;
            // Tempo total em minutos
            const timeMinutes = timeMs / 60000;
            
            // Minutos por km
            const pace = timeMinutes / distanceKm;
            setCurrentPace(pace);
        }
     }, 3000);

     return () => clearInterval(paceTimer);
  }, [distance, timeMs]);


  const startResumeTracking = useCallback(async () => {
    setSessionState('training');

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (!hasStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,
            distanceInterval: 5,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
                notificationTitle: 'RunEasy Tracking',
                notificationBody: 'Gravando o seu treino...',
                notificationColor: '#00D1FF'
            },
        });
    }
  }, []);

  const pauseTracking = useCallback(async () => {
    setSessionState('paused');
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      }
    } catch (e) {
      console.warn('[useTracking] Erro ao pausar location updates:', e);
    }
  }, []);

  const finishTracking = useCallback(async () => {
    // Acumula o tempo que passou antes de mudar o estado
    if (startTimeRef.current) {
      const elapsedSinceStart = Date.now() - startTimeRef.current;
      accumulatedTimeRef.current += elapsedSinceStart;
      startTimeRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);

    // Para o GPS
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
      }
    } catch (e) {
      console.warn('[useTracking] Erro ao parar location updates:', e);
    }

    // Lê dados finais do MMKV (fonte de verdade — background task escreve aqui)
    const finalDistance = trackingStorage.getNumber('current_distance') || distance;
    const finalRouteStr = trackingStorage.getString('route_points') || '[]';
    const finalTime = accumulatedTimeRef.current || timeMs;

    let routeData: Array<{
      latitude: number;
      longitude: number;
      altitude: number | null;
      timestamp: number;
      speed: number | null;
      accuracy: number | null;
    }> = [];
    try {
      routeData = JSON.parse(finalRouteStr);
    } catch (e) {
      console.error('[useTracking] Erro ao parsear rota final:', e);
    }

    // NÃO limpa storage aqui — quem chamou deve chamar clearTracking() após confirmar salvamento
    setSessionState('finished');

    return {
      distance: finalDistance,
      timeMs: finalTime,
      routeData,
    };
  }, [distance, timeMs]);

  /** Limpa todo o estado de tracking — chamar SOMENTE após confirmar que os dados foram salvos */
  const clearTracking = useCallback(() => {
    trackingStorage.delete('route_points');
    trackingStorage.delete('current_distance');
    trackingStorage.delete('accumulated_time_ms');
    trackingStorage.delete('last_update_ts');

    setRouteCoordinates([]);
    setDistance(0);
    setTimeMs(0);
    setCurrentPace(0);
    accumulatedTimeRef.current = 0;
    startTimeRef.current = null;
    setSessionState('calculating');
  }, []);


  // O Pace normal da corrida é 'MM:SS'. Formater:
  const getFormattedPace = () => {
      if (currentPace === 0 || !isFinite(currentPace)) return '--:--';
      
      const minutes = Math.floor(currentPace);
      const seconds = Math.floor((currentPace - minutes) * 60);
      
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getFormattedTime = () => {
      const totalSeconds = Math.floor(timeMs / 1000);
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return {
    isReady,
    sessionState,
    routeCoordinates,
    distance,
    timeMs,
    currentPace: getFormattedPace(),
    formattedTime: getFormattedTime(),
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
  };
}
