import React from 'react';
import Mapbox from '@rnmapbox/maps';

/**
 * Camadas de terreno 3D do Mapbox — fonte DEM global + relevo exagerado + céu
 * atmosférico para realismo no horizonte. Drop-in: renderizar como filho direto
 * do <Mapbox.MapView>. Só faz efeito quando a câmera tem pitch > 0.
 *
 * O <Terrain> herda o sourceID via cloneReactChildren do RasterDemSource.
 */
export function Terrain3DLayers() {
  return (
    <>
      <Mapbox.RasterDemSource
        id="mapbox-dem"
        url="mapbox://mapbox.mapbox-terrain-dem-v1"
        tileSize={514}
        maxZoomLevel={14}
      >
        <Mapbox.Terrain style={{ exaggeration: 1.4 }} />
      </Mapbox.RasterDemSource>

      <Mapbox.SkyLayer
        id="sky-layer"
        style={{
          skyType: 'atmosphere',
          skyAtmosphereSun: [0.0, 0.0],
          skyAtmosphereSunIntensity: 15,
        }}
      />
    </>
  );
}
