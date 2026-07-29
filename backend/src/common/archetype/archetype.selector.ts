import {
  ArchetypeKey,
  ArchetypeSelection,
  ArchetypeSelectionInput,
} from './archetype.types';

/**
 * Teto de volume semanal efetivo (km) que caracteriza CAPACIDADE BAIXA — o
 * usuário precisa construir base antes de perseguir a meta declarada.
 */
const LOW_CAPACITY_WEEKLY_KM = 8;

/** Distância já demonstrada a partir da qual o perfil "destreinado" faz sentido. */
const DETRAINED_MIN_DEMONSTRATED_KM = 5;

/**
 * Volume semanal mínimo para o perfil "corredor express" (pouco tempo, muita
 * intensidade). Sem este piso, o express capturava iniciantes e destreinados só
 * por terem marcado 3 dias/semana — prometendo HIIT a quem mal corre.
 */
const EXPRESS_MIN_WEEKLY_KM = 15;

/**
 * Escolhe a chave do arquétipo a partir da capacidade efetiva. Função PURA —
 * sem I/O, sem IA.
 *
 * ORDEM DE PRIORIDADE (mais estrutural → mais cosmético). A regra: o que muda a
 * FORMA do plano vem primeiro; disponibilidade e meta declarada, que são os
 * sinais mais fracos, vêm por último.
 *
 *   1. walk_run_starter    nunca correu → o plano é outro (por tempo, sem pace)
 *   2. detrained           já correu distância, mas a capacidade de HOJE é baixa
 *   3. base_building       capacidade baixa sem histórico → construir base
 *   4. reabilitacao_segura limitação declarada (sem caso estrutural acima)
 *   5. atleta_de_prova     prova com data
 *   6. corredor_express    poucos dias E volume que sustenta intensidade
 *   7..12                  meta × nível (perfis existentes)
 *   13. primeira_prova     fallback
 *
 * ── DUAS COISAS QUE **NÃO** ENTRAM NA CADEIA, DE PROPÓSITO ───────────────────
 *
 * `hasLimitation` volta como FLAG, não como chave de prioridade máxima. Antes,
 * "tenho uma limitação" apagava o caso "nunca corri" e o usuário mais frágil
 * recebia um arquétipo genérico com pace inventado. Agora compõe: quem nunca
 * correu E tem limitação recebe `walk_run_starter` (o protocolo correto) com o
 * aviso de segurança por cima.
 *
 * `feasible` TAMBÉM é só flag, pelo mesmo motivo — e por um dado concreto: a
 * viabilidade da Fase B/C é um gate de CAPACIDADE, não de prazo. A barreira
 * `MAX_VOLUME_GROWTH_FACTOR` (2.5×) reprova qualquer um abaixo de ~10 km/semana
 * para QUALQUER meta, inclusive 5 km em 6 meses. Se `!feasible` escolhesse a
 * chave, ele viraria o arquétipo da maioria dos iniciantes. Quem decide o TOM
 * (esconder gráfico de meta e projeção otimista) é a flag `viability.feasible`,
 * na camada de UI.
 */
export function selectArchetypeKey(
  input: ArchetypeSelectionInput,
): ArchetypeSelection {
  return { key: pickKey(input), hasLimitation: input.hasLimitation };
}

function pickKey(input: ArchetypeSelectionInput): ArchetypeKey {
  const {
    neverRan,
    effectiveWeeklyKm,
    recentDistanceKm,
    recentFrequency,
    goalKm,
    goal,
    goalType,
    level,
    daysPerWeek,
    goalTimeframeMonths,
    paceMinPerKm,
    hasLimitation,
  } = input;

  // 1. Nunca correu → protocolo caminhada/corrida. Nada sobrescreve: o plano
  //    real É estruturalmente outro (blocos por tempo, sem pace).
  if (neverRan) return 'walk_run_starter';

  const lowCapacity = effectiveWeeklyKm <= LOW_CAPACITY_WEEKLY_KM;
  const demonstrated = recentDistanceKm ?? 0;

  // 2. Destreinado: já demonstrou distância, mas hoje não sustenta volume. O
  //    motor já resolve a contradição ("correu 10 km há 3 anos" ≠ "corre hoje")
  //    via Math.min(kmAnchor, freqCap) — aqui só lemos o resultado dele.
  if (
    demonstrated >= DETRAINED_MIN_DEMONSTRATED_KM &&
    (recentFrequency === 'never' || lowCapacity)
  ) {
    return 'detrained';
  }

  // 3. Capacidade baixa sem histórico de distância → construir base primeiro.
  if (lowCapacity) return 'base_building';

  // 4. Limitação declarada, sem caso estrutural acima.
  if (hasLimitation) return 'reabilitacao_segura';

  // 5. Prova com data marcada.
  if (goalType === 'race') return 'atleta_de_prova';

  // 6. Pouco tempo — mas só para quem tem volume que sustenta intensidade.
  const timeframe = goalTimeframeMonths ?? 3;
  if (
    daysPerWeek <= 3 &&
    timeframe <= 3 &&
    effectiveWeeklyKm >= EXPRESS_MIN_WEEKLY_KM
  ) {
    return 'corredor_express';
  }

  // 7..11 — meta × nível (mantém os perfis existentes).
  const pace = paceMinPerKm ?? 7.0;
  if (level === 'advanced' && goalKm >= 42 && pace < 5.5) {
    return 'maratonista_nato';
  }
  if ((level === 'intermediate' || level === 'advanced') && goalKm >= 21) {
    return 'aspirante_performance';
  }
  // Avançado com meta CURTA (<21 km): o trabalho é limiar, velocidade e economia
  // — não volume. Sem esta regra ele caía no fallback, porque as regras de
  // avançado acima exigem meta ≥42/≥21 km, a de `explorador_limites` é só para
  // beginner e a de `foco_saude` exclui advanced. Era o buraco que fazia um
  // corredor de 30 km/sem a 4:12/km ler "Estamos começando do zero".
  //
  // O `goalKm < 21` é redundante (quem tinha ≥21 já saiu na regra acima), mas
  // fica explícito para o leitor não depender dessa dedução ao reordenar a cadeia.
  if (level === 'advanced' && goalKm < 21) {
    return 'cacador_recordes';
  }
  // `general_fitness` resolve para goalKm 10, mas não é uma meta de distância —
  // sem esta exclusão o iniciante de "fitness geral" viraria Explorador.
  if (level === 'beginner' && goalKm >= 10 && goal !== 'general_fitness') {
    return 'explorador_limites';
  }
  if (level === 'intermediate') return 'guerreiro_consistencia';
  if (goal === 'general_fitness' && level !== 'advanced') return 'foco_saude';

  // 13. Fallback. Depois da regra de `cacador_recordes`, sobra aqui um perfil só:
  //     beginner com meta curta e capacidade já estabelecida (>8 km/sem) — quem
  //     já corre e mira a primeira prova. NÃO é mais "começando do zero".
  return 'primeira_prova';
}
