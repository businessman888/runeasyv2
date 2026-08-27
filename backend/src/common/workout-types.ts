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
