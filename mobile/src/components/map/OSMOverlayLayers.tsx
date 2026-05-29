import React from 'react';
import Mapbox from '@rnmapbox/maps';
import { mapViz } from '../../theme';

/**
 * Realce de trilhas/paths e parques para corredores.
 *
 * IMPORTANTE: o estilo custom do RunEasy é baseado no Mapbox **Standard**
 * (via `imports`), que NÃO expõe a fonte clássica `composite` para estilização.
 * Por isso trazemos nossa própria fonte vetorial `mapbox-streets-v8` e
 * estilizamos a partir dela — funciona independentemente do basemap.
 *
 * Drop-in: renderizar como filho do <Mapbox.MapView>, ANTES da rota e do puck,
 * para que o traçado da corrida fique por cima.
 */
export function OSMOverlayLayers() {
  return (
    <Mapbox.VectorSource id="osm-streets" url="mapbox://mapbox.mapbox-streets-v8">
      {/* Parques e áreas verdes — preenchimento sutil */}
      <Mapbox.FillLayer
        id="osm-parks-fill"
        sourceID="osm-streets"
        sourceLayerID="landuse"
        minZoomLevel={12}
        filter={['match', ['get', 'class'], ['park', 'grass', 'pitch'], true, false]}
        style={{
          fillColor: mapViz.osm.parkFill,
          fillOutlineColor: mapViz.osm.parkOutline,
        }}
      />

      {/* Trilhas e caminhos (path/track) — linha tracejada cyan */}
      <Mapbox.LineLayer
        id="osm-trails"
        sourceID="osm-streets"
        sourceLayerID="road"
        minZoomLevel={13}
        filter={['match', ['get', 'class'], ['path', 'track'], true, false]}
        style={{
          lineColor: mapViz.osm.trail,
          lineWidth: 2,
          lineOpacity: 0.5,
          lineDasharray: [2, 2],
          lineCap: 'round',
        }}
      />
    </Mapbox.VectorSource>
  );
}
