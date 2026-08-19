/**
 * O CÁLCULO do alívio de volume — Fase 6.2.
 *
 * ── POR QUE OS SEGMENTOS, E NÃO SÓ `distance_km` ──────────────────────────────
 *
 * A coluna `workouts.distance_km` é ROTULAGEM: é o que o cabeçalho do card
 * exibe. O treino que o corredor de fato executa é montado a partir de
 * `instructions_json` — `segmentEngine.buildSegSteps` no mobile lê
 * `distance_km` de cada sub-bloco e é ele quem governa a corrida.
 *
 * Reduzir só a coluna produziria um treino que MENTE: "8 km" no topo e 10 km de
 * segmentos por baixo, com o motor cronometrando os 10. Por isso o alívio
 * reescreve os segmentos e recalcula a coluna a partir deles — nessa ordem, e
 * nunca o contrário.
 *
 * ── VOLUME, NUNCA PACE ────────────────────────────────────────────────────────
 *
 * `pace_min`, `pace_max` e `zone` NÃO são tocados em nenhum caminho. Pace é da
 * Fase 3 (`applyZonePacesToSegments`), e a Fase 6 escrever pace reabriria a
 * corrida F3×F6 que a fundação existe para fechar. O alívio muda QUANTO, nunca
 * QUÃO RÁPIDO.
 *
 * ── A POLÍTICA, POR TIPO DE BLOCO ─────────────────────────────────────────────
 *
 *   warmup / cooldown  intactos.  São protocolo fixo — 10 min soltando as pernas
 *                      não é "volume" a cortar, e encolhê-los pioraria o treino
 *                      em vez de aliviá-lo.
 *   main (contínuo)    encolhe.  É onde o volume mora.
 *   repeat (tiros)     menos REPS, cada tiro na distância original.
 *                      6×800 → 5×800, nunca 6×640: a distância do tiro É a
 *                      prescrição (o estímulo de VO2max depende dela). Encurtar
 *                      cada tiro não alivia o treino — descaracteriza-o.
 *
 * ── NÃO MUTA ──────────────────────────────────────────────────────────────────
 *
 * `applyZonePacesToSegments` muta o array recebido, e ali isso é adequado. Aqui
 * NÃO pode: o compare-and-swap por linha compara `md5(instructions_json)` com o
 * valor lido ANTES do cálculo. Mutar o original destruiria a base da comparação
 * e o CAS nunca casaria — um falso conflito permanente, do tipo mais difícil de
 * diagnosticar.
 */

/** Os dois alívios oferecidos. Presets, não escala contínua — ver a nota abaixo. */
export type ReliefLevel = 'light' | 'strong';

/**
 * Redução NOMINAL de cada nível. É um alvo, não uma promessa: os pisos abaixo
 * podem impedir que ela seja atingida, e nesse caso `achievedPct` conta a
 * verdade. A UI exibe o resultado calculado, nunca o percentual pedido.
 */
export const RELIEF_TARGET_PCT: Record<ReliefLevel, number> = {
  light: 20,
  strong: 35,
};

/**
 * Piso do bloco contínuo, em km. Abaixo disso o "treino" vira deslocamento: o
 * aquecimento e a volta à calma passariam a ser a maior parte da sessão.
 */
export const MIN_MAIN_KM = 1;

/** Piso do bloco contínuo por TEMPO (protocolo caminhada/corrida). */
export const MIN_MAIN_SECONDS = 300; // 5 min

/**
 * Piso de repetições. Com 1 tiro não há mais intervalado — some a alternância
 * esforço/recuperação, que é o treino inteiro.
 */
export const MIN_REPS = 2;

export interface ReliefResult {
  /** Cópia NOVA dos segmentos, com pace intacto. */
  segments: unknown[];
  /** Distância total recalculada A PARTIR dos segmentos novos. */
  distanceKm: number;
  /** Duração total (s) dos blocos por tempo — 0 num treino por distância. */
  durationSeconds: number;
  /** A redução REAL alcançada, em % — pode ser menor que a nominal. */
  achievedPct: number;
  /** `false` quando os pisos impediram qualquer redução. A UI não oferece. */
  changed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura dos sub-blocos
// ─────────────────────────────────────────────────────────────────────────────

type Seg = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Blocos que o alívio pode encolher.
 *
 * A lista é positiva (o que PODE) e não negativa (o que não pode) de propósito:
 * um `type` novo que a geração venha a produzir fica de fora por padrão, e o
 * pior caso é "não aliviou" em vez de "encolheu o aquecimento".
 *
 * O schema tem exatamente três tipos simples (`warmup | main | cooldown`, ver
 * `training-ai.service.ts:165` e `plan-overview.dto.ts:12`) mais `repeat`.
 * Segmento SEM `type` conta como `main` porque é assim que o motor que executa
 * o treino o trata (`segmentEngine.buildSegSteps`: `simple.type ?? 'main'`) —
 * divergir aqui faria o alívio pular justamente o bloco que a corrida cronometra.
 */
const REDUCIBLE_TYPES: ReadonlySet<string> = new Set(['main']);

const isReducible = (seg: Seg): boolean =>
  seg.type == null || (typeof seg.type === 'string' && REDUCIBLE_TYPES.has(seg.type));

/** Distância de um sub-bloco (km). Blocos por tempo devolvem 0. */
const effortKm = (raw: unknown): number =>
  raw && typeof raw === 'object' ? num((raw as Seg).distance_km) : 0;

/** Duração de um sub-bloco (s). Blocos por distância devolvem 0. */
const effortSec = (raw: unknown): number =>
  raw && typeof raw === 'object' ? num((raw as Seg).duration_seconds) : 0;

const repsOf = (seg: Seg): number => Math.max(1, Math.round(num(seg.reps) || 1));

// ─────────────────────────────────────────────────────────────────────────────
// Totais
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distância e duração totais de um array de segmentos.
 *
 * Expande `repeat` (reps × (work + recovery)), do mesmo jeito que
 * `segmentEngine.buildSegSteps` no mobile e `expectedPaceRangeForWorkout` no
 * backend. As três contagens têm de concordar, senão o número exibido descreve
 * um treino diferente do que o motor executa.
 */
export function totalsOfSegments(segments: unknown): {
  km: number;
  seconds: number;
} {
  if (!Array.isArray(segments)) return { km: 0, seconds: 0 };

  let km = 0;
  let seconds = 0;

  for (const raw of segments) {
    if (!raw || typeof raw !== 'object') continue;
    const seg = raw as Seg;

    if (seg.type === 'repeat') {
      const reps = repsOf(seg);
      km += reps * (effortKm(seg.work) + effortKm(seg.recovery));
      seconds += reps * (effortSec(seg.work) + effortSec(seg.recovery));
      continue;
    }
    km += effortKm(seg);
    seconds += effortSec(seg);
  }

  return { km: round2(km), seconds: Math.round(seconds) };
}

// ─────────────────────────────────────────────────────────────────────────────
// O cálculo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula o treino aliviado. Função pura: não toca no array recebido.
 *
 * Devolve `null` quando não há segmentos utilizáveis (treino sem prescrição
 * estruturada) — a UI trata como "não dá para aliviar", sem oferecer a ação.
 *
 * ── COMO O ALVO É DISTRIBUÍDO ─────────────────────────────────────────────────
 *
 * O alvo é uma fração do total, mas o corte sai SÓ dos blocos redutíveis. Num
 * treino 2+6+2 km, −20% = 2 km, e esses 2 km saem inteiros do `main` (6 → 4).
 * Cortar proporcionalmente encolheria o aquecimento junto, que é justamente o
 * que a política proíbe.
 *
 * Quando o alvo não cabe (o piso do `main` seria violado), corta o quanto cabe e
 * `achievedPct` reporta o real. Não existe caminho em que a função devolva um
 * treino que não bate com o número que ela mesma anuncia.
 */
export function computeRelief(
  segments: unknown,
  level: ReliefLevel,
): ReliefResult | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const before = totalsOfSegments(segments);
  // Um treino sem distância NEM duração não tem volume a reduzir.
  if (before.km <= 0 && before.seconds <= 0) return null;

  const pct = RELIEF_TARGET_PCT[level];
  // Treino por tempo (caminhada/corrida) opera em segundos pela mesma escada.
  const byTime = before.km <= 0;
  const targetCut = byTime
    ? (before.seconds * pct) / 100
    : (before.km * pct) / 100;

  return reduceByAmount(segments, targetCut);
}

/**
 * O mesmo corte, pedido em VALOR ABSOLUTO em vez de percentual.
 *
 * ── POR QUE ESTA VARIANTE EXISTE (Fase 6.3) ───────────────────────────────────
 *
 * O alívio de UM treino (6.2) pergunta "reduza 20%". O alívio de uma SEMANA
 * precisa perguntar "tire 2,4 km DESTE treino" — porque quem decide o quanto
 * cada treino cede é a política de distribuição semanal, não o próprio treino.
 *
 * `computeRelief` virou um wrapper: converte o percentual em alvo e chama esta.
 * As duas compartilham a escada inteira, então a política por tipo de bloco —
 * aquecimento intacto, `main` encolhe, `repeat` perde reps, pace nunca tocado —
 * é literalmente a mesma nos dois níveis, não duas implementações que precisam
 * concordar.
 *
 * `targetCut` é em km, ou em segundos quando o treino é por tempo. A unidade é
 * inferida do próprio treino (`byTime`), e não passada pelo chamador: pedir um
 * corte em km a um treino medido em minutos não é um caso a suportar, é um bug
 * a impedir.
 */
export function reduceByAmount(
  segments: unknown,
  targetCut: number,
): ReliefResult | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const before = totalsOfSegments(segments);
  if (before.km <= 0 && before.seconds <= 0) return null;

  const byTime = before.km <= 0;
  if (!(targetCut > 0)) {
    // Alvo zero ou negativo: nada a fazer, mas devolve um resultado íntegro
    // (cópia intacta) para o chamador tratar como "este treino não cedeu".
    const copy = JSON.parse(JSON.stringify(segments)) as Seg[];
    return {
      segments: copy,
      distanceKm: before.km,
      durationSeconds: before.seconds,
      achievedPct: 0,
      changed: false,
    };
  }

  // Cópia profunda ANTES de qualquer escrita — o md5 do original é a base do CAS.
  const out = JSON.parse(JSON.stringify(segments)) as Seg[];

  let remaining = targetCut;

  for (const seg of out) {
    if (remaining <= 0) break;
    if (!seg || typeof seg !== 'object') continue;

    // ── Intervalado: menos repetições ──────────────────────────────────────
    if (seg.type === 'repeat') {
      const reps = repsOf(seg);
      if (reps <= MIN_REPS) continue;

      const perRep = byTime
        ? effortSec(seg.work) + effortSec(seg.recovery)
        : effortKm(seg.work) + effortKm(seg.recovery);
      if (perRep <= 0) continue;

      // Arredonda para BAIXO: tirar meia repetição não existe, e cortar de
      // menos é sempre preferível a cortar demais num treino de qualidade.
      const wanted = Math.floor(remaining / perRep);
      if (wanted <= 0) continue;

      const removable = Math.min(wanted, reps - MIN_REPS);
      if (removable <= 0) continue;

      seg.reps = reps - removable;
      remaining -= removable * perRep;
      continue;
    }

    // ── Contínuo: encolhe só os blocos redutíveis ──────────────────────────
    if (!isReducible(seg)) continue;

    if (byTime) {
      const cur = effortSec(seg);
      if (cur <= MIN_MAIN_SECONDS) continue;
      const cut = Math.min(remaining, cur - MIN_MAIN_SECONDS);
      seg.duration_seconds = Math.round(cur - cut);
      remaining -= cut;
      continue;
    }

    const cur = effortKm(seg);
    if (cur <= MIN_MAIN_KM) continue;
    const cut = Math.min(remaining, cur - MIN_MAIN_KM);
    seg.distance_km = round2(cur - cut);
    remaining -= cut;
  }

  const after = totalsOfSegments(out);
  const base = byTime ? before.seconds : before.km;
  const now = byTime ? after.seconds : after.km;
  const achievedPct = base > 0 ? Math.round(((base - now) / base) * 100) : 0;

  return {
    segments: out,
    distanceKm: after.km,
    durationSeconds: after.seconds,
    achievedPct,
    // Comparação por total, não por igualdade de objeto: um corte que os pisos
    // engoliram por inteiro tem de sair daqui como "nada mudou".
    changed: now < base,
  };
}
