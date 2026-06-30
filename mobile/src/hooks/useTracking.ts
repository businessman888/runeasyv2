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
  // Controla a tela de Prominent Disclosure de localização (Google Play). True
  // quando há permissão a pedir e ainda não exibimos/resolvemos a divulgação.
  const [locationDisclosureVisible, setLocationDisclosureVisible] = useState(false);
  // Precisão crua do último update de GPS, em metros (-1 = desconhecida).
  // Alimenta o indicador de qualidade de sinal. Escrita pela locationTask antes
  // dos filtros, lida aqui no sync de 500ms enquanto está treinando.
  const [gpsAccuracy, setGpsAccuracy] = useState(-1);

  // Usa refs para manter valores mutáveis dentro do intervalo de tempo sem causar re-renders exaustivos
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);
  // Última versão do MMKV já refletida no estado React. Permite "dirty-check":
  // só re-parseamos route_points quando a locationTask escreveu um ponto novo.
  const lastRouteVersionRef = useRef<number>(0);

  // Helper: posição inicial rápida para o mapa abrir em nível de rua (UX Uber-like).
  // Usa cache do sistema (instantâneo) com fallback para posição atual (low accuracy
  // = rápido). Requer FG concedida; chamado após as permissões serem resolvidas.
  const fetchInitialPosition = useCallback(async () => {
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
  }, []);

  // Carrega estado anterior se houver (recuperação de crash) e resolve permissões.
  // IMPORTANTE: o pedido nativo de permissão de localização NÃO é mais disparado
  // aqui. No mount apenas LEMOS o status; se houver permissão a pedir, exibimos a
  // tela de Prominent Disclosure (LocationDisclosureModal) e só o toque do usuário
  // em "Permitir localização" dispara o pedido real (requestLocationPermission).
  // Exigência da política "Prominent Disclosure & Consent" do Google Play.
  useEffect(() => {
    const initializeTracker = async () => {
      try {
        // ── Crash-recovery com identificação de sessão (independe de permissão) ──
        // Identifica a sessão atual: workoutId real ou chave sentinela para corridas livres
        const currentSessionKey = workoutId || FREE_RUN_SESSION_KEY;
        const storedSessionKey = trackingStorage.getString('tracking_workout_id') || '';
        const wasFinished = trackingStorage.getBoolean('tracking_finished') ?? false;

        // Expira dados se a data do treino já passou (ex: pausou ontem e não concluiu)
        const storedDate = trackingStorage.getString('tracking_date') || '';
        const today = new Date().toISOString().split('T')[0];
        const isExpired = storedDate !== '' && storedDate < today;

        // Restaura SOMENTE se for a mesma sessão, não finalizada e não expirada.
        // Nota: NÃO limpamos MMKV aqui — isso é feito em startResumeTracking quando
        // o usuário inicia uma nova sessão. Limpar no init causava o bug de zeragem.
        const isSameSession = !wasFinished && !isExpired &&
          storedSessionKey === currentSessionKey;

        if (isSameSession) {
          // Mesma sessão → crash-recovery legítimo (pausa → saiu → voltou mesmo dia)
          // Sempre restaura para 'paused', mesmo sem pontos de rota (GPS pode não ter aceito
          // nenhum ponto ainda se o usuário pausou muito cedo ou estava parado).
          const savedRouteStr = trackingStorage.getString('route_points');
          if (savedRouteStr) {
            try {
              const parsedPoints = JSON.parse(savedRouteStr);
              if (parsedPoints.length > 0) {
                setRouteCoordinates(parsedPoints.map((p: any) => [p.longitude, p.latitude]));
              }
            } catch (e) {
              console.error('[useTracking] Erro ao fazer parse da rota recuperada');
            }
          }
          setDistance(trackingStorage.getNumber('current_distance') || 0);
          accumulatedTimeRef.current = trackingStorage.getNumber('accumulated_time_ms') || 0;
          setTimeMs(accumulatedTimeRef.current);
          setSessionState('paused');
          console.log(`[useTracking] Crash-recovery: sessão "${currentSessionKey}" restaurada`);
        } else if (storedSessionKey !== '' || wasFinished || isExpired) {
          // Dados de outra sessão / expirados / finalizados → apenas loga.
          // A limpeza acontece em startResumeTracking quando o usuário iniciar.
          console.log(`[useTracking] Dados de sessão diferente ou expirada ignorados. stored="${storedSessionKey}", current="${currentSessionKey}", finished=${wasFinished}, expired=${isExpired}`);
        }

        // ── Permissões: apenas LÊ o status (não dispara popup nativo aqui) ──────
        const fg = await Location.getForegroundPermissionsAsync();
        const bg = await Location.getBackgroundPermissionsAsync();

        if (fg.status === 'granted' && bg.status === 'granted') {
          // Tudo já concedido → segue direto, sem incomodar o usuário.
          await fetchInitialPosition();
        } else if (fg.status !== 'granted' || (bg.status !== 'granted' && bg.canAskAgain)) {
          // Há permissão a pedir → exibe a Prominent Disclosure ANTES de qualquer
          // popup nativo. O pedido real só ocorre em requestLocationPermission.
          setLocationDisclosureVisible(true);
        } else {
          // FG concedida, BG negada permanentemente (canAskAgain=false) → não insiste
          // (o SO não vai mais perguntar); segue em modo foreground-only.
          await fetchInitialPosition();
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
  // Intervalo curto (500ms) para que o traçado acompanhe o corredor com o mínimo
  // de lag perceptível, e dirty-check via last_update_ts para evitar JSON.parse
  // + setState repetidos quando nada mudou (a locationTask filtra agressivamente
  // pontos por precisão/distância, então a maioria dos ticks não tem novidade).
  useEffect(() => {
    let syncTimer: NodeJS.Timeout;

    if (sessionState === 'training') {
      syncTimer = setInterval(() => {
        // Sync Distance (barato: leitura numérica direta do MMKV)
        const currentDist = trackingStorage.getNumber('current_distance') || 0;
        setDistance(currentDist);

        // Sync precisão do GPS (leitura numérica barata) para o indicador de sinal
        setGpsAccuracy(trackingStorage.getNumber('last_accuracy') ?? -1);

        // Só re-parseia a rota se houve novo ponto desde o último tick.
        const updateTs = trackingStorage.getNumber('last_update_ts') || 0;
        if (updateTs !== lastRouteVersionRef.current) {
          lastRouteVersionRef.current = updateTs;
          const savedRouteStr = trackingStorage.getString('route_points');
          if (savedRouteStr) {
            try {
              const parsed = JSON.parse(savedRouteStr);
              setRouteCoordinates(parsed.map((p: any) => [p.longitude, p.latitude]));
            } catch(e) {}
          }
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
      }, 500);
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

    const sessionKey = workoutId || FREE_RUN_SESSION_KEY;
    const storedKey = trackingStorage.getString('tracking_workout_id') || '';
    const wasFinished = trackingStorage.getBoolean('tracking_finished') ?? false;
    const storedDate = trackingStorage.getString('tracking_date') || '';
    const today = new Date().toISOString().split('T')[0];
    const isExpired = storedDate !== '' && storedDate < today;

    // Limpa dados obsoletos AQUI (não no init), para garantir que ao iniciar um
    // treino diferente (ou no dia seguinte) o MMKV começa limpo.
    const isNewSession = wasFinished || isExpired ||
      (storedKey !== '' && storedKey !== sessionKey);

    if (isNewSession) {
      console.log(`[useTracking] Nova sessão detectada em startResume → limpando MMKV. stored="${storedKey}", current="${sessionKey}", finished=${wasFinished}, expired=${isExpired}`);
      trackingStorage.remove('route_points');
      trackingStorage.remove('current_distance');
      trackingStorage.remove('accumulated_time_ms');
      trackingStorage.remove('last_update_ts');
      trackingStorage.remove('tracking_paused');
      trackingStorage.remove('resume_grace_count');
      setRouteCoordinates([]);
      setDistance(0);
      setTimeMs(0);
      setCurrentPace(0);
      accumulatedTimeRef.current = 0;
      startTimeRef.current = null;
    }

    // Persiste identificador e data da sessão para crash-recovery e expiry
    trackingStorage.set('tracking_workout_id', sessionKey);
    trackingStorage.set('tracking_date', today);
    trackingStorage.remove('tracking_finished');

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
  }, [workoutId]);

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
    trackingStorage.remove('route_points');
    trackingStorage.remove('current_distance');
    trackingStorage.remove('accumulated_time_ms');
    trackingStorage.remove('last_update_ts');
    trackingStorage.remove('tracking_paused');
    trackingStorage.remove('resume_grace_count');
    trackingStorage.remove('tracking_workout_id');
    trackingStorage.remove('tracking_finished');
    trackingStorage.remove('tracking_date');
    trackingStorage.remove('last_accuracy');
    trackingStorage.remove('last_accuracy_ts');

    setRouteCoordinates([]);
    setDistance(0);
    setTimeMs(0);
    setCurrentPace(0);
    setGpsAccuracy(-1);
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

  // Handler do botão "Permitir localização" da Prominent Disclosure. ESTE é o
  // ÚNICO ponto que dispara os popups nativos de permissão de localização —
  // sempre precedido pela tela de divulgação do RunEasy (exigência do Google Play).
  // Retorna `true` se a corrida pode prosseguir (foreground concedido), `false`
  // caso o usuário negue o foreground no popup nativo — aí a screen sai da tela.
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    setLocationDisclosureVisible(false);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        console.warn('[useTracking] Permissão foreground negada');
        return false;
      }
      // Android 14+: requestBackgroundPermissionsAsync pode abrir as Configurações
      // do sistema e retornar 'denied' sem diálogo. Não bloqueia o fluxo.
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        console.warn('[useTracking] Permissão background negada — tracking só funcionará em foreground');
      }
      await fetchInitialPosition();
      return true;
    } catch (e) {
      console.error('[useTracking] Erro ao solicitar permissão de localização:', e);
      return false;
    }
  }, [fetchInitialPosition]);

  // Handler do botão "Agora não": fecha a divulgação SEM consentir e SEM disparar
  // qualquer popup nativo. Se o foreground JÁ estiver concedido, a corrida segue
  // em modo foreground-only (carrega o mapa) → retorna `true`. Sem nenhuma
  // permissão de localização não há o que rastrear → retorna `false` e a screen
  // sai da tela (evita ficar preso em "Localizando você...").
  const dismissLocationDisclosure = useCallback(async (): Promise<boolean> => {
    setLocationDisclosureVisible(false);
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status === 'granted') {
        await fetchInitialPosition();
        return true;
      }
    } catch (e) {
      console.warn('[useTracking] Erro ao verificar permissão de foreground:', e);
    }
    return false;
  }, [fetchInitialPosition]);

  return {
    isReady,
    sessionState,
    routeCoordinates,
    distance,
    timeMs,
    currentPace: getFormattedPace(),
    formattedTime: getFormattedTime(),
    gpsAccuracy,
    initialPosition,
    startResumeTracking,
    pauseTracking,
    finishTracking,
    clearTracking,
    locationDisclosureVisible,
    requestLocationPermission,
    dismissLocationDisclosure,
  };
}
