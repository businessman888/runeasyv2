import { spacing as baseSpacing, typography } from './index';
import { useBreakpoint } from '../hooks/useBreakpoint';

/**
 * Helpers de responsividade para tablet/iPad. São funções PURAS sobre os
 * tokens-base de `theme/index.ts` — não mutam nada. Em phone, todos retornam
 * o valor original (scale = 1, isTablet = false), garantindo layout idêntico.
 */

/** Multiplicador de espaçamento em tablet (mais "respiro"). */
const SPACING_TABLET_MULTIPLIER = 1.4;
const SPACING_LARGE_TABLET_MULTIPLIER = 1.6;

/** Largura máxima de coluna de leitura (formulários/quiz/listas centralizadas). */
const READING_MAX_WIDTH = 720;
const READING_MAX_WIDTH_LARGE = 840;

/** Escala uma fonte pelo multiplicador do device. Phone (scale=1) não muda. */
export function responsiveFont(size: number, scale: number): number {
  return Math.round(size * scale);
}

/** Aumenta um espaçamento em tablet. Phone não muda. */
export function responsiveSpacing(
  value: number,
  isTablet: boolean,
  isLargeTablet = false,
): number {
  if (!isTablet) return value;
  const m = isLargeTablet ? SPACING_LARGE_TABLET_MULTIPLIER : SPACING_TABLET_MULTIPLIER;
  return Math.round(value * m);
}

/**
 * Largura máxima de conteúdo para telas de leitura/formulário em tablet,
 * impedindo que a linha estique a tela inteira. Em phone retorna `undefined`
 * (sem limite → comportamento atual).
 */
export function contentMaxWidth(
  width: number,
  isTablet: boolean,
  isLargeTablet = false,
): number | undefined {
  if (!isTablet) return undefined;
  const cap = isLargeTablet ? READING_MAX_WIDTH_LARGE : READING_MAX_WIDTH;
  return Math.min(width, cap);
}

/** Nº de colunas para grids/listas. 1 phone, 2 tablet, 3 largeTablet landscape. */
export function gridColumns(
  width: number,
  opts?: { isLandscape?: boolean },
): number {
  if (width >= 840) return opts?.isLandscape ? 3 : 2;
  if (width >= 600) return 2;
  return 1;
}

export interface ResponsiveTheme {
  // flags do breakpoint
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  scale: number;
  /** Escala uma fonte-base pelo device atual. */
  font: (size: number) => number;
  /** Escala um espaçamento-base pelo device atual. */
  space: (value: number) => number;
  /** Nº de colunas sugerido para grids/listas no device atual. */
  columns: number;
  /** Largura máx. de coluna de leitura (undefined em phone). */
  maxWidth: number | undefined;
  /** Tokens prontos: tipografia já escalada por chave semântica. */
  fontSizes: typeof typography.fontSizes;
  /** Tokens prontos: spacing já escalado por chave semântica. */
  spacing: typeof baseSpacing;
}

/**
 * Combina `useBreakpoint` + helpers num único objeto consumível com 1 linha
 * por tela: `const r = useResponsiveTheme();` → `r.font(16)`, `r.columns`, etc.
 */
export function useResponsiveTheme(): ResponsiveTheme {
  const bp = useBreakpoint();
  const { width, isTablet, isLargeTablet, isLandscape, scale } = bp;

  const font = (size: number) => responsiveFont(size, scale);
  const space = (value: number) => responsiveSpacing(value, isTablet, isLargeTablet);

  // Tipografia escalada por chave semântica (xs..4xl).
  const fontSizes = Object.fromEntries(
    Object.entries(typography.fontSizes).map(([k, v]) => [k, font(v)]),
  ) as typeof typography.fontSizes;

  // Spacing escalado por chave semântica (xs..3xl).
  const spacing = Object.fromEntries(
    Object.entries(baseSpacing).map(([k, v]) => [k, space(v)]),
  ) as typeof baseSpacing;

  return {
    ...bp,
    font,
    space,
    columns: gridColumns(width, { isLandscape }),
    maxWidth: contentMaxWidth(width, isTablet, isLargeTablet),
    fontSizes,
    spacing,
  };
}

export default useResponsiveTheme;
