/**
 * Os PAPÉIS de um treino dentro da semana — fonte única.
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────
 *
 * `QUALITY_TYPES` nasceu como um `const` local dentro de
 * `TrainingAIService.applyDeterministicVolume`, onde serve para decidir qual
 * treino recebe a distância do slot de qualidade na hora de gerar o plano.
 *
 * A Fase 6.3 (reduzir o volume da semana) precisa da MESMA classificação para
 * decidir o que NÃO cortar. Declarar um segundo conjunto criaria duas cópias da
 * mesma regra, que precisariam concordar por disciplina — exatamente o formato
 * da mina 2 da reauditoria da Fase 6, em que o predicado do serviço e o do SQL
 * divergiram sem ninguém perceber. Aqui o conjunto é um só, e quem precisa dele
 * importa.
 */

/**
 * Sessões de QUALIDADE: o estímulo de intensidade da semana (Z3–Z5).
 *
 * O gerador limita a uma por semana no esqueleto (`qualitySlot`), e só em
 * `build`/`peak` — a regra 80/20 de Daniels que o prompt já aplica.
 */
export const QUALITY_TYPES: ReadonlySet<string> = new Set([
  'intervals',
  'tempo',
  'fartlek',
  'hill_repeats',
  'repetition',
  'progressive',
]);

/**
 * O que o alívio de volume da Fase 6.3 NÃO pode cortar.
 *
 * ── POR QUE É UM CONJUNTO SEPARADO, E NÃO O MESMO ─────────────────────────────
 *
 * `race_simulation` está aqui e NÃO está em `QUALITY_TYPES`, e a divergência é
 * deliberada. São duas perguntas diferentes:
 *
 *   QUALITY_TYPES            "quem recebe a distância do slot de qualidade
 *                             quando o plano é GERADO?"
 *   PROTECTED_FROM_VOLUME_CUT "quem é intocável quando a semana é ALIVIADA?"
 *
 * Na geração, a simulação de prova é tratada como volume comum — mudar isso
 * alteraria a distribuição de todo plano novo, o que está fora do escopo da
 * Fase 6 e mexeria numa lógica que já roda em produção.
 *
 * Na hora de cortar, ela é o oposto de descartável: é o ensaio da prova, um dos
 * treinos mais específicos do ciclo. Encolhê-la como se fosse rodagem leve
 * destruiria justamente o que ela existe para medir.
 *
 * O longão NÃO entra aqui de propósito: ele é volume, não intensidade, e é a
 * maior base de corte disponível. Protegê-lo deixaria a política sem espaço
 * para aliviar sem tocar na qualidade.
 */
export const PROTECTED_FROM_VOLUME_CUT: ReadonlySet<string> = new Set([
  ...QUALITY_TYPES,
  'race_simulation',
]);

/** Este treino cede volume num alívio de semana? */
export function cedesVolume(type: string | null | undefined): boolean {
  return !PROTECTED_FROM_VOLUME_CUT.has(type ?? '');
}

/**
 * O que PESA na perna — a régua de espaçamento da Troca de Dias (T.1).
 *
 * ── POR QUE UM TERCEIRO CONJUNTO ─────────────────────────────────────────────
 *
 * Porque é uma TERCEIRA pergunta, e nenhum dos dois de cima a responde:
 *
 *   QUALITY_TYPES             "quem recebe a distância do slot de qualidade
 *                              quando o plano é GERADO?"
 *   PROTECTED_FROM_VOLUME_CUT "quem é intocável quando a semana é ALIVIADA?"
 *   HEAVY_TYPES               "o que NÃO deveria cair dois dias seguidos?"
 *
 * O `long_run` é a diferença que explica a necessidade. Ele está fora dos dois
 * primeiros de propósito — é volume e não intensidade, e é a maior base de corte
 * que a 6.3 tem. Mas para a perna do corredor ele é o treino mais pesado da
 * semana, e um longão colado numa sessão de qualidade é exatamente o arranjo que
 * a régua existe para sinalizar.
 *
 * `race_simulation` entra pelo mesmo motivo pelo qual já é protegido no corte:
 * é o ensaio da prova, e ensaio de prova não se faz na ressaca de um tiro.
 *
 * Declarar este conjunto localmente no helper da Troca de Dias teria sido o
 * caminho curto — e seria a mina 2 de novo, uma terceira cópia da classificação
 * de tipos precisando concordar com as outras duas por disciplina. Ele mora aqui
 * pelo mesmo motivo que os outros dois.
 */
export const HEAVY_TYPES: ReadonlySet<string> = new Set([
  ...QUALITY_TYPES,
  'long_run',
  'race_simulation',
]);

/**
 * TODOS os tipos que podem aparecer em `workouts.type`.
 *
 * União de `GeneratedWorkoutType` (training-ai.service.ts) com os dois que não
 * saem do gerador: `free_run`, criado pela conclusão de corrida livre, e
 * `race_day`, o dia da prova.
 *
 * Existe para uma coisa só: dar ao spec deste arquivo como afirmar que
 * `LOAD_WEIGHT_BY_TYPE` cobre todo mundo. Sem isso, um tipo novo no gerador
 * passa a pesar 1,0 no readiness em silêncio — que é exatamente como
 * `race_simulation` e `repetition` acabaram caindo em 'Moderada' no mapa
 * privado que este bloco substitui.
 */
export const ALL_WORKOUT_TYPES: ReadonlySet<string> = new Set([
  'easy_run',
  'long_run',
  'intervals',
  'tempo',
  'recovery',
  'fartlek',
  'progressive',
  'repetition',
  'hill_repeats',
  'race_simulation',
  'walk_run',
  'free_run',
  'race_day',
]);

/**
 * O CUSTO POR MINUTO de cada tipo — a quarta pergunta deste arquivo.
 *
 * ── POR QUE AQUI, E NÃO NO MÓDULO DE READINESS ────────────────────────────────
 *
 *   QUALITY_TYPES             "quem recebe a distância do slot de qualidade?"
 *   PROTECTED_FROM_VOLUME_CUT "quem é intocável quando a semana é aliviada?"
 *   HEAVY_TYPES               "o que NÃO deveria cair dois dias seguidos?"
 *   LOAD_WEIGHT_BY_TYPE       "quanto este tipo custa à perna POR MINUTO?"
 *
 * É uma quarta pergunta, e mora junto pelo mesmo motivo das outras três. O
 * argumento não é estético: havia um `getIntensity` privado dentro de
 * `readiness.service.ts` fazendo trabalho parecido, e quando o gerador ganhou
 * `race_simulation` e `repetition` ninguém abriu aquele arquivo — os dois caíram
 * no default 'Moderada' e DESLIGARAM a regra de prevenção do readiness para
 * quem tinha um tiro marcado. Este arquivo é o que se abre quando um tipo nasce.
 *
 * ── A ESCALA ──────────────────────────────────────────────────────────────────
 *
 * 1,0 = um minuto de rodagem leve. Os valores são a PRIMEIRA calibragem, feita
 * sem histórico real suficiente para ajustá-los (produção tem 14 atividades), e
 * são deliberadamente conservadores: a razão aguda/crônica que eles alimentam só
 * modula ±10 pontos num score de 0-100, então um peso errado em 15% desloca o
 * resultado em menos de 2 pontos. Revisar quando houver volume.
 *
 * ⚠️ Estes pesos multiplicam DURAÇÃO, não distância. Quando `workouts.rpe`
 * amadurecer (hoje 2/172), a fonte de carga vira sRPE = rpe × minutos e este
 * mapa deixa de ser consultado — o ponto de troca é `cargaDaSessao` em
 * `readiness/helpers/load-series.helper.ts`, não aqui.
 */
export const LOAD_WEIGHT_BY_TYPE: Readonly<Record<string, number>> = {
  // Base aeróbica — a régua.
  easy_run: 1.0,
  free_run: 1.0,
  // Regenerativo: mexe as pernas sem cobrar.
  recovery: 0.7,
  walk_run: 0.7,
  // Volume longo: o minuto custa mais que o de rodagem porque o dano acumula
  // com a duração, mas continua sendo Z2.
  long_run: 1.15,
  // Moderado-alto: sobe de intensidade ao longo do treino.
  progressive: 1.25,
  // Limiar sustentado.
  tempo: 1.4,
  fartlek: 1.4,
  // Ensaio de prova em pace-alvo: intenso e específico, mas não é Z5.
  race_simulation: 1.5,
  // VO2max e impacto.
  intervals: 1.6,
  hill_repeats: 1.6,
  // Z5 puro — o minuto mais caro que se treina.
  repetition: 1.7,
  race_day: 1.7,
};

/**
 * O peso de um tipo, com default explícito.
 *
 * Tipo desconhecido (ou `null`, quando a atividade não tem workout ligado) pesa
 * como rodagem leve. É o default seguro: subestimar a carga de uma sessão faz o
 * motor falar MENOS sobre carga, e a carga só modula nas margens. O oposto —
 * inventar um peso alto — produziria o "risco de lesão" fabricado que este
 * redesenho existe para matar.
 *
 * ⚠️ O teste de tipo NÃO é decorativo, e `?? 1.0` sozinho não bastava:
 * `workouts.type` é texto livre vindo do banco, e `LOAD_WEIGHT_BY_TYPE['constructor']`
 * devolve a função `Object` herdada do prototype — que não é `null` nem
 * `undefined`, atravessaria o `??` e viraria `NaN` na multiplicação, envenenando
 * a série inteira de carga a partir de UM dia. Exigir `number` fecha a família
 * toda (`constructor`, `toString`, `valueOf`, …) de uma vez.
 */
export function loadWeightFor(type: string | null | undefined): number {
  const peso = LOAD_WEIGHT_BY_TYPE[type ?? ''] as unknown;
  return typeof peso === 'number' && Number.isFinite(peso) ? peso : 1.0;
}
