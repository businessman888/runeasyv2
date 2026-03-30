import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

export type IndicatorState = 'disabled' | 'enabled' | 'moving';

interface Props {
  state: IndicatorState;
}

const OUTER_SIZE = 34;
const INNER_SIZE = 26;
const DOT_SIZE = 6;
const DOT_GAP = 2;
const TOTAL_HEIGHT = OUTER_SIZE + DOT_GAP + DOT_SIZE;

/**
 * Indicador de localização customizado.
 *
 * Estados visuais (Figma — indicatorUser):
 *  • disabled  — GPS instável, anel apagado rgba(0,127,153,0.3)
 *  • enabled   — GPS conectado, anel cyan #00D4FF
 *  • moving    — Em movimento, anel cyan + ponto direcional abaixo
 */
export const UserLocationIndicator = memo(({ state }: Props) => {
  const isDisabled = state === 'disabled';
  const isMoving = state === 'moving';

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.outerRing,
          {
            backgroundColor: isDisabled
              ? 'rgba(0, 127, 153, 0.3)'
              : '#00D4FF',
          },
        ]}
      >
        <View
          style={[
            styles.innerCircle,
            { backgroundColor: isDisabled ? '#0E0E1F' : '#1C1C2E' },
          ]}
        />
      </View>

      {isMoving && <View style={styles.directionDot} />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: OUTER_SIZE,
    height: TOTAL_HEIGHT,
  },
  outerRing: {
    width: OUTER_SIZE,
    height: OUTER_SIZE,
    borderRadius: OUTER_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  innerCircle: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
  },
  directionDot: {
    marginTop: DOT_GAP,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#00D4FF',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
