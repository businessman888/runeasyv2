import { Injectable, Logger } from '@nestjs/common';

import { SupabaseService } from '../../database/supabase.service';
import { addDaysStr } from '../training/helpers/plan-window.helper';
import {
  DailyLoad,
  LoadSignal,
  QualifyingActivity,
  buildDailyLoadSeries,
  computeLoadSignal,
  LOAD_WINDOW_DAYS,
} from './helpers/load-series.helper';
import {
  readinessDayStr,
  readinessWindowStartIso,
} from './helpers/readiness-day.helper';
import {
  Baselines,
  Dimension,
  buildBaselines,
} from './helpers/subjective-baseline.helper';
import {
  ReadinessDecision,
  decideReadiness,
} from './helpers/readiness-score.helper';

/** O que degradou nesta computação. Vai para o log e para a narrativa. */
export type Degradation = 'load' | 'weights' | 'baseline';

/** O que o motor LÊ do banco, antes de decidir qualquer coisa. */
export interface GatheredData {
  load: LoadSignal;
  baselines: Baselines;
  degradations: Degradation[];
}

export interface ReadinessComputation {
  decision: ReadinessDecision;
  baselines: Baselines;
  degradations: Degradation[];
}

interface ActivityRow {
  id: string;
  start_date: string;
  moving_time: number | null;
  type: string | null;
}

interface WorkoutTypeRow {
  id: string;
  activity_id: string;
  type: string | null;
  source: string | null;
}

/**
 * O MOTOR — dono de todo o I/O; a matemática mora nos helpers puros.
 *
 * ── A INVARIANTE ──────────────────────────────────────────────────────────────
 *
 * **Nada aqui pode derrubar um check-in.** Cada consulta degrada para uma
 * sentinela explícita e registra em `degradations`. Escrever o check-in é o
 * produto; a modulação por carga é o acabamento. Só autenticação e o DTO têm
 * direito de falhar a requisição.
 *
 * O molde é `fetchPlannedWorkouts` (R.0): `try/catch` + `if (error)` +
 * `logger.error` — nunca `warn`, porque foi um erro engolido em `warn` que
 * manteve o 42703 invisível por semanas.
 */
@Injectable()
export class ReadinessEngineService {
  private readonly logger = new Logger(ReadinessEngineService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Só o sinal de carga — o que `getReadinessStatus` precisa para decidir
   * elegibilidade sem montar o veredito inteiro.
   */
  async loadSignalFor(userId: string): Promise<LoadSignal> {
    const { signal } = await this.buildLoad(userId);
    return signal;
  }

  /**
   * TODO o I/O do motor, sem decidir nada.
   *
   * ── POR QUE É SEPARADO DA DECISÃO ─────────────────────────────────────────
   *
   * `decideReadiness` precisa do tipo do treino de HOJE, que vem de outra
   * consulta (`fetchPlannedWorkouts`, no service). Enquanto a coleta e a
   * decisão eram uma coisa só, o service tinha de buscar o treino ANTES de
   * chamar o motor, e as duas leituras ficavam em série.
   *
   * Separadas, o chamador roda as duas em `Promise.all` e a profundidade cai de
   * duas idas ao banco para uma. Também é o que permite checar o PISO antes de
   * montar o veredito — e portanto antes de gastar uma chamada de IA.
   */
  async gather(userId: string): Promise<GatheredData> {
    const [carga, historico] = await Promise.all([
      this.buildLoad(userId),
      this.fetchBaselineHistory(userId),
    ]);

    const degradations: Degradation[] = [
      ...carga.degradations,
      ...historico.degradations,
    ];

    if (degradations.length > 0) {
      this.logger.warn(
        `[Readiness][engine] user=${userId} degradou: ${degradations.join(',')}`,
      );
    }

    return {
      load: carga.signal,
      baselines: buildBaselines(historico.rows),
      degradations,
    };
  }

  /** Coleta + decisão, para quem não precisa das duas separadas. */
  async compute(
    userId: string,
    answers: Record<Dimension, number>,
    contexto: {
      todayWorkoutType?: string | null;
      todayIsRaceDay?: boolean;
    } = {},
  ): Promise<ReadinessComputation> {
    const dados = await this.gather(userId);

    return {
      decision: decideReadiness({
        answers,
        baselines: dados.baselines,
        load: dados.load,
        todayWorkoutType: contexto.todayWorkoutType ?? null,
        todayIsRaceDay: contexto.todayIsRaceDay ?? false,
      }),
      baselines: dados.baselines,
      degradations: dados.degradations,
    };
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  private async buildLoad(userId: string): Promise<{
    signal: LoadSignal;
    series: DailyLoad[];
    degradations: Degradation[];
  }> {
    const degradations: Degradation[] = [];

    // A série termina no ÚLTIMO DIA FECHADO — ontem. O check-in acontece de
    // manhã, quando o treino de hoje ainda não aconteceu.
    const fim = addDaysStr(readinessDayStr(), -1);
    const inicio = addDaysStr(fim, -(LOAD_WINDOW_DAYS - 1));

    const atividades = await this.fetchActivities(userId, inicio);
    if (atividades.failed) {
      return {
        signal: computeLoadSignal([], { fetchFailed: true }),
        series: [],
        degradations: ['load'],
      };
    }

    const tipos = await this.fetchWorkoutTypes(
      userId,
      atividades.rows.map((a) => a.id),
    );
    if (tipos.failed) degradations.push('weights');

    const qualifying: QualifyingActivity[] = atividades.rows.map((a) => ({
      id: a.id,
      start_date: a.start_date,
      moving_time: a.moving_time,
      workoutType: tipos.byActivityId.get(a.id) ?? null,
    }));

    const series = buildDailyLoadSeries(qualifying, fim);
    return { signal: computeLoadSignal(series), series, degradations };
  }

  private async fetchActivities(
    userId: string,
    desdeDia: string,
  ): Promise<{ rows: ActivityRow[]; failed: boolean }> {
    const LIMITE = 1000;
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('activities')
        .select('id, start_date, moving_time, type')
        .eq('user_id', userId)
        // A janela em UTC começa antes do dia SP; um dia inteiro de folga é
        // suficiente e mais barato que converter a fronteira exata.
        .gte('start_date', `${addDaysStr(desdeDia, -1)}T00:00:00.000Z`)
        // ⚠️ ASCENDENTE. Com `desc` + `limit`, o que cai fora do corte é o dado
        // MAIS ANTIGO — exatamente a janela crônica, deflacionando o denominador
        // e inflando toda razão.
        .order('start_date', { ascending: true })
        .limit(LIMITE);

      if (error) {
        this.logger.error(
          `[Readiness][load] activities falhou para user=${userId}: ` +
            `code=${error.code} message=${error.message}`,
        );
        return { rows: [], failed: true };
      }

      const rows = (data ?? []) as ActivityRow[];

      if (rows.length === LIMITE) {
        this.logger.warn(
          `[Readiness][load] user=${userId} bateu o teto de ${LIMITE} atividades — ` +
            'a janela crônica pode estar truncada',
        );
      }

      // Sem `.eq('type','Run')` de propósito: um filtro de igualdade é o
      // mecanismo de descarte silencioso que já produziu dois incidentes neste
      // módulo. Se um tipo novo aparecer, queremos saber por log — não por um
      // score errado.
      const outros = [
        ...new Set(rows.map((r) => r.type).filter((t) => t && t !== 'Run')),
      ];
      if (outros.length > 0) {
        this.logger.warn(
          `[Readiness][load] user=${userId} tem atividades de tipo não-Run: ${outros.join(',')}`,
        );
      }

      return { rows, failed: false };
    } catch (error) {
      this.logger.error(`[Readiness][load] exceção em activities`, error);
      return { rows: [], failed: true };
    }
  }

  /**
   * O tipo do treino de cada atividade.
   *
   * ⚠️ O JOIN É `workouts.activity_id → activities.id`, e o sentido importa:
   * `activities.workout_id` está NULL em 14 de 14 linhas de produção. Ligar pelo
   * lado errado devolve tipo `null` para 100% das corridas, todas pesam 1,0, e
   * nada avisa — é a mesma forma do 42703 que a R.0 acabou de consertar.
   *
   * Também não se usa embed do PostgREST (`activities.select('…, workouts(type)')`):
   * ele depende de um nome de constraint que não foi verificado e falha
   * exatamente assim, em silêncio.
   */
  private async fetchWorkoutTypes(
    userId: string,
    activityIds: string[],
  ): Promise<{ byActivityId: Map<string, string>; failed: boolean }> {
    const byActivityId = new Map<string, string>();
    if (activityIds.length === 0) return { byActivityId, failed: false };

    try {
      const supabase = this.supabaseService.getClient();
      const CHUNK = 100;

      for (let i = 0; i < activityIds.length; i += CHUNK) {
        const lote = activityIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('workouts')
          .select('id, activity_id, type, source')
          .eq('user_id', userId)
          .in('activity_id', lote);

        if (error) {
          this.logger.error(
            `[Readiness][load] workouts falhou para user=${userId}: ` +
              `code=${error.code} message=${error.message}`,
          );
          return { byActivityId, failed: true };
        }

        for (const row of (data ?? []) as WorkoutTypeRow[]) {
          if (!row.activity_id || !row.type) continue;
          const atual = byActivityId.get(row.activity_id);
          if (atual === undefined) {
            byActivityId.set(row.activity_id, row.type);
            continue;
          }
          // Duas linhas apontando a mesma atividade é estado possível. Sem
          // desempate, o peso da sessão mudaria entre leituras e o score
          // oscilaria sem motivo. Precedência: treino de plano vence corrida
          // livre; empate resolve pelo menor id.
          const vencedor = this.desempata(
            byActivityId.get(row.activity_id),
            row,
          );
          byActivityId.set(row.activity_id, vencedor);
        }
      }

      return { byActivityId, failed: false };
    } catch (error) {
      this.logger.error(`[Readiness][load] exceção em workouts`, error);
      return { byActivityId, failed: true };
    }
  }

  private desempata(atual: string, candidato: WorkoutTypeRow): string {
    // `free_run` é o tipo sintético da corrida livre; qualquer treino de plano
    // descreve melhor o esforço.
    if (
      atual === 'free_run' &&
      candidato.type &&
      candidato.type !== 'free_run'
    ) {
      return candidato.type;
    }
    return atual;
  }

  // ── Baseline ───────────────────────────────────────────────────────────────

  /**
   * O histórico de respostas, SEM o de hoje.
   *
   * Hoje não pode entrar no próprio baseline — no fluxo normal a linha nem
   * existe ainda quando isto roda, mas um segundo check-in no mesmo dia (que a
   * janela pode permitir se `hasCheckedInToday` falhar) daria peso dobrado
   * àquele dia na mediana, para sempre.
   */
  private async fetchBaselineHistory(userId: string): Promise<{
    rows: Array<Record<string, unknown> | null>;
    degradations: Degradation[];
  }> {
    const DIAS = 180;
    const LIMITE = 90;
    try {
      const supabase = this.supabaseService.getClient();
      const dia = readinessDayStr();
      const desde = readinessWindowStartIso(addDaysStr(dia, -DIAS));
      const inicioDeHoje = readinessWindowStartIso(dia);

      const { data, error } = await supabase
        .from('readiness_history')
        .select('check_in_answers, created_at')
        .eq('user_id', userId)
        .gte('created_at', desde)
        .lt('created_at', inicioDeHoje)
        .order('created_at', { ascending: false })
        .limit(LIMITE);

      if (error) {
        this.logger.error(
          `[Readiness][baseline] histórico falhou para user=${userId}: ` +
            `code=${error.code} message=${error.message}`,
        );
        return { rows: [], degradations: ['baseline'] };
      }

      const rows = ((data ?? []) as Array<{ check_in_answers: unknown }>).map(
        (r) => (r.check_in_answers ?? null) as Record<string, unknown> | null,
      );

      return { rows, degradations: [] };
    } catch (error) {
      this.logger.error(`[Readiness][baseline] exceção`, error);
      return { rows: [], degradations: ['baseline'] };
    }
  }
}
