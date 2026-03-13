import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import haversine from 'haversine';
import type { MMKV as MMKVType } from 'react-native-mmkv';

const { MMKV } = require('react-native-mmkv');

export const LOCATION_TRACKING_TASK = 'BACKGROUND_LOCATION_TASK';

// Instância MMKV unificada para persistência do Tracking rápida (síncrona)
export const trackingStorage: MMKVType = new MMKV({ id: 'running-tracking-storage' });

TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[Tracking Task] Erro na task de localização:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const loc = locations[0]; // Captura a posição mais recente reportada

    // Filtro de precisão (ignora pulos de GPS imprecisos, > 20 metros)
    if (loc.coords.accuracy && loc.coords.accuracy > 20) {
      console.log(`[Tracking Task] Ponto ignorado. Precisão ruim: ${loc.coords.accuracy}m`);
      return; 
    }

    try {
      const storedPoints = trackingStorage.getString('route_points');
      const routePointsList = storedPoints ? JSON.parse(storedPoints) : [];
      
      const newPoint = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        timestamp: loc.timestamp,
        speed: loc.coords.speed,
        accuracy: loc.coords.accuracy
      };

      // Se houver um ponto anterior, calcula distância acumulada usando haversine
      let currentDistance = trackingStorage.getNumber('current_distance') || 0;
      
      if (routePointsList.length > 0) {
        const lastPoint = routePointsList[routePointsList.length - 1];
        
        // Evita somar distâncias minúsculas (falsos positivos do GPS parado)
        // ou se o tempo for o mesmo
        if (lastPoint.timestamp !== newPoint.timestamp) {
            const addedDistance = haversine(
                { latitude: lastPoint.latitude, longitude: lastPoint.longitude },
                { latitude: newPoint.latitude, longitude: newPoint.longitude },
                { unit: 'meter' }
            );
            
            currentDistance += addedDistance;
        }
      }

      routePointsList.push(newPoint);
      
      // Persiste síncronamente via MMKV
      trackingStorage.set('current_distance', currentDistance);
      trackingStorage.set('route_points', JSON.stringify(routePointsList));
      trackingStorage.set('last_update_ts', Date.now());
      
    } catch (e) {
      console.error('[Tracking Task] Erro processando coordenadas em background', e);
    }
  }
});
