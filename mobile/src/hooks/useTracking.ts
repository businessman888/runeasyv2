import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { trackingStorage, LOCATION_TRACKING_TASK } from '../tasks/locationTask';

export type SessionState = 'calculating' | 'training' | 'paused' | 'finished';

// Chave sentinela para corridas livres (sem workoutId associado)
const FREE_RUN_SESSION_KEY = '__free_run__';

export function useTracking(workoutId?: string) {
  const [sessionState, setSessionState] = useState<SessionState>('calculating');
  const [routeCoordinates, setRouteCoordinates] = useState<number[][]>([]); // Array [lng, lat] para o Mapbox
  const [distance, setDistance] = useState(0);
  const [timeMs, setTimeMs] = useState(0); // Tempo em milissegundos
  const [currentPace, setCurrentPace] = useState(0); // minutos por km
  const [isReady, setIsReady] = useState(false);
  const [initialPosition, setInitialPosition] = useState<[number, number] | null>(null);

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

        // Obtém posição inicial rápida para o mapa abrir em nível de rua (UX Uber-like)
        // Usa cache do sistema (instantâneo) com fallback para posição atual (low accuracy = rápido)
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) {
            setInitialPosition([lastKnown.coords.longitude, lastKnown.coords.latitude]);
          } else {
            const current = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
            });
            setInitialPosition([current.coords.longitude, current.coords.latitude]);
          }
        } catch (e) {
          console.warn('[useTracking] Não foi possível obter posição inicial');
        }

        // ── Crash-recovery com identificação de sessão ───────────────────────
        // Identifica a sessão atual: workoutId real ou chave sentinela para corridas livres
        const currentSessionKey = workoutId || FREE_RUN_SESSION_KEY;
        const storedSessionKey = trackingStorage.getString('tracking_workout_id') || '';
        const wasFinished = trackingStorage.getBoolean('tracking_finished') ?? false;

        const hasStaleData = wasFinished || (
          storedSessionKey !== '' && storedSessionKey !== currentSessionKey
        );

        if (hasStaleData) {
          // Dados de outra sessão (ou sessão já finalizada mas GPS escreveu após clearTracking)
          // → limpa silenciosamente para garantir tela em branco
          console.log(`[useTracking] Dados obsoletos detectados. stored="${storedSessionKey}", current="${currentSessionKey}", finished=${wasFinished} → limpando`);
          trackingStorage.delete('route_points');
          trackingStorage.delete('current_distance');
          trackingStorage.delete('accumulated_time_ms');
          trackingStorage.delete('last_update_ts');
          trackingStorage.delete('tracking_paused');
          trackingStorage.delete('resume_grace_count');
          trackingStorage.delete('tracking_workout_id');
          trackingStorage.delete('tracking_finished');
        } else {
          // Mesma sessão (ou ambos indefinidos = corrida livre) → crash-recovery legítimo
          const savedRouteStr = trackingStorage.getString('route_points');
          if (savedRouteStr) {
            try {
              const parsedPoints = JSON.parse(savedRouteStr);
              if (parsedPoints.length > 0) {
                setRouteCoordinates(parsedPoints.map((p: any) => [p.longitude, p.latitude]));
                setDistance(trackingStorage.getNumber('current_distance') || 0);
                accumulatedTimeRef.current = trackingStorage.getNumber('accumulated_time_ms') || 0;
                setTimeMs(accumulatedTimeRef.current);
                setSessionState('paused'); // Sugere "Retomar" para o mesmo treino
                console.log(`[useTracking] Crash-recovery: sessão "${currentSessionKey}" restaurada`);
              }
            } catch (e) {
              console.error('[useTracking] Erro ao fazer parse da rota recuperada');
            }
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

  // Sync reativo de foreground lendo o state do MMKV periodicamente.
  // Pace também é calculado aqui para evitar o bug de re-criação de interval
  // causado por dependências [distance, timeMs] no useEffect separado.
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

        // Calcula pace usando refs (evita closure stale sobre timeMs/distance)
        // startTimeRef.current é não-nulo enquanto treinando
        const currentTimeMs = accumulatedTimeRef.current +
          (startTimeRef.current ? Date.now() - startTimeRef.current : 0);

        if (currentDist > 50 && currentTimeMs > 0) {
          const pace = (currentTimeMs / 60000) / (currentDist / 1000);
          if (isFinite(pace) && pace > 0) {
            setCurrentPace(pace);
          }
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

  const startResumeTracking = useCallback(async () => {
    setSessionState('training');

    // Persiste o identificador da sessão para o crash-recovery distinguir sessões
    const sessionKey = workoutId || FREE_RUN_SESSION_KEY;
    trackingStorage.set('tracking_workout_id', sessionKey);
    // Garante que o flag de finalização está limpo (cobre caso de re-start após erro)
    trackingStorage.delete('tracking_finished');

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
    // Sinaliza no MMKV que o tracking foi pausado pelo usuário.
    // A locationTask usa essa flag para tratar o primeiro ponto pós-resume
    // como "novo segmento" (sem somar distância do deslocamento durante pausa).
    trackingStorage.set('tracking_paused', true);
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

    // Sinaliza ANTES de parar o GPS: a locationTask verifica esta flag e descarta
    // qualquer update residual que chegue após stopLocationUpdatesAsync (race condition Android).
    trackingStorage.set('tracking_finished', true);

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
    trackingStorage.delete('tracking_paused');
    trackingStorage.delete('resume_grace_count');
    trackingStorage.delete('tracking_workout_id');
    trackingStorage.delete('tracking_finished');

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
    initialPosition,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
  };
}
