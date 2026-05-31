import React, { memo } from 'react';
import { Image } from 'react-native';
import Mapbox from '@rnmapbox/maps';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FLAG = require('../../assets/images/flagChegada.png');

interface FinishFlagMarkerProps {
  /** [lng, lat] do ponto onde a corrida terminou. */
  coordinate: number[];
  /** Tamanho do marcador em px (constante na tela, não escala com o zoom). */
  size?: number;
}

/**
 * Marca a linha de chegada (último ponto GPS) com a bandeira quadriculada.
 *
 * Usa MarkerView (tamanho constante de tela). Ancorado na base do mastro
 * (canto inferior-esquerdo da imagem) para a bandeira "ficar de pé" exatamente
 * sobre o ponto final — a bandeira sobe para cima/direita, sem cobrir o traçado
 * que chega até ele. `allowOverlap` garante que apareça mesmo sobre a linha.
 */
export const FinishFlagMarker = memo(
  ({ coordinate, size = 38 }: FinishFlagMarkerProps) => (
    <Mapbox.MarkerView
      coordinate={coordinate}
      anchor={{ x: 0.1, y: 0.92 }}
      allowOverlap
      allowOverlapWithPuck
    >
      <Image
        source={FLAG}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible
        accessibilityLabel="Linha de chegada"
      />
    </Mapbox.MarkerView>
  ),
);

FinishFlagMarker.displayName = 'FinishFlagMarker';
