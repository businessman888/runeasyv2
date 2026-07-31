import { colors, fonts } from '../../theme';

/**
 * Identidade visual dos stories da retrospectiva.
 *
 * ── POR QUE ESTES TONS, E NÃO OUTROS ─────────────────────────────────────────
 *
 * A paleta do app tem UMA cor de marca (ciano `colors.primary`) e várias cores
 * SEMÂNTICAS: verde = concluído, amarelo = alerta, vermelho = perdido/erro.
 * Usá-las como fundo de card quebraria o significado que elas carregam no resto
 * do app — um card de celebração em vermelho lê como falha.
 *
 * Por isso os 7 tons saem só dos hues NÃO-semânticos da paleta: ciano, azul,
 * roxo e âmbar, mais interpolações entre eles. Nenhuma cor nova foi inventada.
 *
 * ── INTENSIDADE ───────────────────────────────────────────────────────────────
 *
 * O idioma do dia a dia do app é base escura + cor sangrando a 10-18%
 * (LevelCard, OverviewSection). A retrospectiva é superfície de CELEBRAÇÃO, e
 * por decisão de produto usa gradientes mais presentes — mas mantendo a base
 * escura. O app é dark-only (sem `useColorScheme`), então nada de pastel claro.
 *
 * ── O CLÍMAX ──────────────────────────────────────────────────────────────────
 *
 * O card 6 (recorde) é âmbar — o único tom QUENTE numa sequência fria. A
 * hierarquia de herói vem do contraste de temperatura, não só de tamanho de
 * fonte, e âmbar carrega a leitura de ouro/medalha que combina com "recorde".
 */

/** Um gradiente de card: 3 paradas, do escuro para a cor e de volta. */
export interface StoryGradient {
  /** Passado direto para `LinearGradient.colors`. */
  colors: readonly [string, string, string];
  /** Cor de destaque do card (números grandes, ícones). */
  accent: string;
  /** Rótulo de depuração — aparece só em comentário/teste. */
  name: string;
}

/**
 * Monta um gradiente diagonal: quase-preto no topo → cor viva no meio →
 * escuro de novo embaixo. A cor "sangra" do centro, o que mantém o texto
 * legível nas duas pontas sem precisar de scrim.
 */
function gradient(
  name: string,
  accent: string,
  mid: string,
  deep: string,
): StoryGradient {
  return { name, accent, colors: [colors.background, mid, deep] as const };
}

/**
 * Os 7 tons do arco, na ordem dos cards.
 *
 * Frios (ciano → azul → roxo) do 1 ao 5, âmbar no clímax (6), e volta ao ciano
 * da marca no CTA (7) — o arco fecha onde começou.
 */
export const STORY_GRADIENTS: readonly StoryGradient[] = [
  // 1. Abertura — ciano da marca
  gradient('ciano', colors.primary, '#0B3A4A', '#071E28'),
  // 2. Volume — ciano profundo
  gradient('ciano-profundo', colors.primaryDark, '#0A3446', '#06202E'),
  // 3. Treinos + consistência — azul
  gradient('azul', colors.primaryLight, '#132A55', '#0B1836'),
  // 4. Pace — índigo (entre azul e roxo)
  gradient('indigo', '#6366F1', '#221F5C', '#12103A'),
  // 5. Comparação lúdica — roxo
  gradient('roxo', colors.recovery, '#2E1A55', '#1A0E36'),
  // 6. CLÍMAX — âmbar. Único tom quente; mais luminoso de propósito.
  gradient('ambar', colors.accent, '#5C3A05', '#2E1D02'),
  // 7. CTA — volta ao ciano da marca
  gradient('ciano', colors.primary, '#0B3A4A', '#071E28'),
] as const;

/** Gradiente do card `index` (0-based), com wrap defensivo. */
export function gradientForCard(index: number): StoryGradient {
  return STORY_GRADIENTS[index % STORY_GRADIENTS.length];
}

/** Índice do card de clímax — o único com tratamento de herói. */
export const CLIMAX_CARD_INDEX = 5; // card 6, 0-based

/**
 * Escala tipográfica dos stories. Fonte é Plus Jakarta Sans
 * (`@expo-google-fonts/plus-jakarta-sans`, carregada em App.tsx) — a mesma do
 * resto do app, tratada com a disciplina de estilos reutilizáveis que a HIG
 * pede: um punhado de papéis, nunca tamanhos soltos por card.
 */
export const storyType = {
  /** Rótulo pequeno acima do número ("VOCÊ CORREU"). */
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    letterSpacing: 1.6,
    color: 'rgba(235,235,245,0.65)',
  },
  /** O número grande — um por card. */
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 72,
    lineHeight: 78,
    color: colors.textLight,
  },
  /** Versão do clímax: maior que todos os outros. */
  heroClimax: {
    fontFamily: fonts.extrabold,
    fontSize: 92,
    lineHeight: 96,
    color: colors.textLight,
  },
  /** Unidade colada no número ("km", "/km"). */
  unit: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: 'rgba(235,235,245,0.75)',
  },
  /** Título do card. */
  title: {
    fontFamily: fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.textLight,
  },
  /** Corpo / subtítulo. */
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(235,235,245,0.72)',
  },
  /** Legenda pequena. */
  caption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(235,235,245,0.55)',
  },
} as const;
