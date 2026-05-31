import React from 'react';
import Mapbox from '@rnmapbox/maps';
import type { StatMapFeatureCollection } from '../../utils/runMetrics';

interface StatMapRouteProps {
  /** FeatureCollection de segmentos coloridos (de buildStatMapRoute). */
  shape: StatMapFeatureCollection;
}

/**
 * Renderiza a rota colorida segmento-a-segmento por métrica (pace/elevação),
 * estilo "Stat Maps" do Strava. Cada feature carrega `properties.color`, lido
 * via expressão `['get', 'color']`. Mantém o halo cyan por baixo para coesão
 * visual com o resto do app.
 */
export function StatMapRoute({ shape }: StatMapRouteProps) {
  if (shape.features.length === 0) return null;

  return (
    <Mapbox.ShapeSource id="statMapRoute" shape={shape as any}>
      <Mapbox.LineLayer
        id="statMapRouteColored"
        style={{
          lineColor: ['get', 'color'],
          lineWidth: 6,
          lineOpacity: 1,
          lineJoin: 'round',
          lineCap: 'round',
          // Emite a cor real ignorando a luz do basemap Standard (sem isso a
          // cena "ilumina" a linha e ela fica escura/apagada). Sem lineBlur.
          lineEmissiveStrength: 1,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
