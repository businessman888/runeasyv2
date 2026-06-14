import { useWindowDimensions } from 'react-native';

/**
 * Breakpoints baseados em dp curto (Material Design):
 * - phone   : largura < 600
 * - tablet  : 600–839 (tablets 7", iPad mini/portrait)
 * - largeTablet : >= 840 (tablets 10"+, iPad 11"+/landscape)
 */
export const BREAKPOINTS = {
  tablet: 600,
  largeTablet: 840,
} as const;

/** Multiplicador de tipografia por classe de device. */
export const TYPE_SCALE = {
  phone: 1,
  tablet: 1.15,
  largeTablet: 1.22,
} as const;

export interface Breakpoint {
  /** Largura atual da janela (dp). Reativa a rotação/split-view. */
  width: number;
  /** Altura atual da janela (dp). */
  height: number;
  /** largura < 600 */
  isPhone: boolean;
  /** largura >= 600 */
  isTablet: boolean;
  /** largura >= 840 */
  isLargeTablet: boolean;
  /** orientação deitada (width > height) */
  isLandscape: boolean;
  /** Multiplicador de tipografia: 1 (phone) | 1.15 (tablet) | 1.22 (largeTablet). */
  scale: number;
}

/**
 * Hook central de responsividade. Usa `useWindowDimensions()` (e NÃO
 * `Dimensions.get`) para reagir a rotação, split-view do Android e
 * Stage Manager do iPad.
 *
 * IMPORTANTE: em phone, `isPhone` é sempre `true` e `scale` é `1` — todo
 * branch tablet deve ser aditivo para o layout de phone permanecer idêntico.
 */
export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();

  const isLargeTablet = width >= BREAKPOINTS.largeTablet;
  const isTablet = width >= BREAKPOINTS.tablet;
  const isPhone = !isTablet;

  const scale = isLargeTablet
    ? TYPE_SCALE.largeTablet
    : isTablet
      ? TYPE_SCALE.tablet
      : TYPE_SCALE.phone;

  return {
    width,
    height,
    isPhone,
    isTablet,
    isLargeTablet,
    isLandscape: width > height,
    scale,
  };
}

export default useBreakpoint;
