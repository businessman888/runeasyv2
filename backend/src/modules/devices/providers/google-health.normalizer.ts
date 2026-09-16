import { Injectable, Logger } from '@nestjs/common';
import { DeviceLocalActivity } from '../activity-sync.service';
import {
  GoogleHealthDataPoint,
  GoogleHealthExercise,
  extractDataPointId,
} from './google-health-api.client';

/**
 * Converte um dataPoint de `exercise` da Google Health API no
 * `DeviceLocalActivity` que `processDeviceLocalActivity` consome.
 *
 * ── ESTE ARQUIVO É O LUGAR ONDE AS UNIDADES SÃO DECIDIDAS ────────────────────
 *
 * A Google Health entrega **tudo em milímetros**, durações como **string com
 * sufixo** (`"1800s"`) e inteiros de 64 bits como **string** (`steps: "6200"`,
 * `averageHeartRateBeatsPerMinute: "148"` — medido na doc oficial). O modelo
 * interno espera metros, segundos e números. Cada conversão abaixo tem um modo
 * de falha SILENCIOSO a jusante, e é por isso que cada linha tem teste próprio:
 *
 *   • `distanceMillimeters` cru num campo que espera metros faz 1 km virar
 *     1.000 km — e isso propaga para badges de distância e para a tolerância de
 *     ±10% da reconciliação.
 *   • `activeDuration / 1000` dá `NaN`. `NaN` num `integer` do Postgres falha
 *     como **erro de INSERT**, não como erro de parsing: o log mostra o lugar
 *     errado.
 *   • `elevationGainMillimeters` cru faz 100 m de ganho virar 100.000 m.
 *
 * ── MINA 1: O PACE ───────────────────────────────────────────────────────────
 *
 * `common/pace-calculator/pace-format.ts:30-36` multiplica por 60 **todo valor
 * menor que 20**, em silêncio, sem log — é a heurística que cura os planos
 * antigos gravados em decimal min/km. Um pace entregue na unidade errada não
 * estoura: ele fica 60× errado e ninguém vê.
 *
 * Duas consequências, e as duas estão implementadas aqui:
 *   1. este normalizer entrega **segundos/km inteiros**, já convertidos, e
 *      nunca passa valor cru por aquele helper;
 *   2. a fonte é `averageSpeedMillimetersPerSecond` (`1e6 / mmPerSec` é exato),
 *      **não** `averagePaceSecondsPerMeter`, que chega arredondado a uma casa —
 *      e cuja própria documentação se contradiz no exemplo publicado.
 *
 * ── `external_id`: O PREFIXO NÃO É COSMÉTICO ─────────────────────────────────
 *
 * A UNIQUE de `activities.external_id` é **global, não por usuário**, e o
 * upsert de `completeWorkout` usa `onConflict: 'external_id'`. Uma colisão
 * **sobrescreve a linha de outro usuário**. Daí `gh_`. E o id é o ÚLTIMO
 * SEGMENTO do `name`, não o `name` inteiro: o inteiro estoura o
 * `@MaxLength(120)` do DTO e ainda vaza o `healthUserId` para dentro da coluna.
 *
 * ── O QUE NÃO ENTRA ──────────────────────────────────────────────────────────
 *
 * **`steps` não vira activity.** Medido: o `exercise` reporta 1284 passos e a
 * soma dos baldes de minuto do `dataTypes/steps` dá 1369, com janelas que nem
 * coincidem — não são fontes reconciliáveis. Pior: dataPoints de `steps` não
 * têm `name`, logo não têm chave de idempotência, e reentrega duplicaria. A
 * própria doc avisa que escrever métricas dentro de uma sessão de `exercise`
 * não popula os rollups diários: são fontes independentes. O campo é parseado
 * aqui (para que a conversão string→número viva em UM lugar só) e exposto no
 * resultado, mas **não é gravado em lugar nenhum hoje** — não existe coluna.
 */

/** O limiar de `pace-format.ts`. Abaixo dele o helper multiplica por 60. */
const PACE_FORMAT_LEGACY_THRESHOLD = 20;

/** Resultado do normalizer: o modelo interno mais o que o Commit E precisa. */
export interface GoogleHealthActivity extends DeviceLocalActivity {
  /**
   * Passos da sessão, já convertidos de string. **Sem destino hoje** — não há
   * coluna. Existe para que a conversão fique testada em um lugar só e para o
   * dia em que houver coluna. Ver o bloco "O QUE NÃO ENTRA" acima.
   */
  steps?: number;
  /**
   * `exerciseMetadata.hasGps` — o gate do `exportExerciseTcx`. O Commit E lê
   * isto junto com `hasLocationScope` antes de gastar uma segunda requisição.
   */
  has_gps: boolean;
  /** O `{dataPoint}` sem o prefixo `gh_`, para o Commit E montar a URL do TCX. */
  data_point_id: string;
}

@Injectable()
export class GoogleHealthNormalizer {
  private readonly logger = new Logger(GoogleHealthNormalizer.name);

  /**
   * Devolve `null` quando o dataPoint não deve virar activity. Quem chama
   * DESCARTA — nunca insere.
   */
  normalize(
    dataPoint: GoogleHealthDataPoint,
    userId: string,
  ): GoogleHealthActivity | null {
    const exercise = dataPoint.exercise;
    if (!exercise) return null;

    // ── Filtro de tipo ──────────────────────────────────────────────────────
    //
    // Decisão tomada: rejeitar não-corrida, espelhando o
    // `HealthConnectNormalizer`. Uma política só para o módulo inteiro.
    //
    // ⚠️ A FRESTA DO HEALTH CONNECT NÃO É COPIADA. Lá,
    // `health-connect.normalizer.ts:97-99` trata `exercise_type === undefined`
    // como `'outdoor'`, porque o Health Connect publica `RUNNING` sem
    // qualificador e o mobile já filtrou antes. Aqui NÃO há filtro antes: o
    // dado vem direto da nuvem do Google, onde convivem caminhada, natação e
    // musculação. Tipo ausente é tipo desconhecido, e desconhecido é rejeitado.
    const environment = this.mapEnvironment(exercise.exerciseType);
    if (!environment) return null;

    // ── `external_id` ───────────────────────────────────────────────────────
    const dataPointId = extractDataPointId(dataPoint.name);
    if (!dataPointId) {
      // Sem `name` não há chave de idempotência: reentrega duplicaria a
      // corrida. Descartar é a única saída segura.
      this.logger.warn(
        '[google_health] dataPoint de exercise sem `name` — descartado (sem chave de idempotência)',
      );
      return null;
    }

    const externalId = `gh_${dataPointId}`;
    if (externalId.length > 120) {
      // O DTO tem `@MaxLength(120)`. Se isto disparar, o formato do id mudou —
      // o comprimento vai para o log, o id não (é identificador ligado a dado
      // de saúde).
      this.logger.error(
        `[google_health] external_id com ${externalId.length} chars excede o limite de 120 — dataPoint descartado`,
      );
      return null;
    }

    // ── Data/hora ───────────────────────────────────────────────────────────
    const startDate = this.resolveStartDate(exercise);
    if (!startDate) {
      this.logger.warn(
        `[google_health] dataPoint ${externalId} sem hora de início utilizável — descartado`,
      );
      return null;
    }

    // ── Duração ─────────────────────────────────────────────────────────────
    const movingTime = this.parseDurationSeconds(exercise.activeDuration);
    if (movingTime === null || movingTime <= 0) {
      // Sem duração não há pace, não há carga na R.1 e o INSERT falharia num
      // `integer`. Falhar aqui, com log, é melhor que falhar no banco.
      this.logger.warn(
        `[google_health] dataPoint ${externalId} sem \`activeDuration\` utilizável — descartado`,
      );
      return null;
    }

    const metrics = exercise.metricsSummary ?? {};

    // ── Distância: milímetros → METROS ──────────────────────────────────────
    //
    // ÷ 1e6 dá km; o campo interno `distance` é METROS (activity-sync.service
    // :27), então ÷ 1e3. Escrito assim, e não como `mm / 1000`, para que a
    // unidade de destino fique explícita ao lado da conversão.
    const distanceMm = this.parseNumber(metrics.distanceMillimeters);
    const distanceKm = distanceMm === null ? null : distanceMm / 1e6;
    const distanceMeters =
      distanceKm === null ? 0 : this.round(distanceKm * 1000, 2);

    // ── Elevação: milímetros → metros ───────────────────────────────────────
    const elevationMm = this.parseNumber(metrics.elevationGainMillimeters);
    const elevationGain =
      elevationMm === null ? undefined : this.round(elevationMm / 1e6, 2);

    // ── Pace ────────────────────────────────────────────────────────────────
    const averagePace = this.resolvePaceSecondsPerKm(
      this.parseNumber(metrics.averageSpeedMillimetersPerSecond),
      distanceMeters,
      movingTime,
      externalId,
    );

    // ── Passos / FC / calorias ──────────────────────────────────────────────
    const steps = this.parseNumber(metrics.steps);
    const averageHeartrate = this.parseNumber(
      metrics.averageHeartRateBeatsPerMinute,
    );
    // ⚠️ NÃO VALIDADO: a lista publicada do `metricsSummary` não traz FC máxima.
    // A leitura é defensiva — se o campo existir num payload real, ele entra;
    // se não existir, `max_heartrate` fica `undefined`, que é o que já
    // acontecia antes desta integração. Não inventamos máxima a partir da
    // média.
    const maxHeartrate = this.parseNumber(metrics.maxHeartRateBeatsPerMinute);
    const calories = this.parseNumber(metrics.caloriesKcal);

    return {
      external_id: externalId,
      source: 'google_health',
      user_id: userId,
      name: exercise.displayName
        ? `Google Health — ${exercise.displayName}`
        : 'Google Health Run',
      type: 'Run',
      start_date: startDate,
      distance: distanceMeters,
      moving_time: movingTime,
      elapsed_time: movingTime,
      average_pace: averagePace,
      average_heartrate: averageHeartrate ?? undefined,
      max_heartrate: maxHeartrate ?? undefined,
      calories: calories === null ? undefined : Math.round(calories),
      elevation_gain: elevationGain,
      environment,
      // A rota é o Commit E. Até lá a corrida entra sem `gps_route`, que é
      // exatamente o que uma corrida de esteira já faz hoje.
      gps_route: undefined,
      steps: steps === null ? undefined : Math.round(steps),
      has_gps: exercise.exerciseMetadata?.hasGps === true,
      data_point_id: dataPointId,
    };
  }

  // ---- Conversões ----

  /**
   * `exerciseType` → ambiente interno. `null` = não é corrida, descarta.
   *
   * A doc publica `RUNNING` como valor do enum e cita `WALKING`, `BIKING` e
   * `AEROBIC_WORKOUT` em texto corrido. O nome do valor de esteira NÃO está
   * publicado — as duas grafias plausíveis estão cobertas, e qualquer outra
   * cai no `default` e é rejeitada, que é o lado seguro do erro.
   */
  private mapEnvironment(
    exerciseType?: string,
  ): 'outdoor' | 'treadmill' | null {
    switch (exerciseType) {
      case 'RUNNING':
        return 'outdoor';
      case 'RUNNING_TREADMILL':
      case 'TREADMILL_RUNNING':
        return 'treadmill';
      default:
        return null;
    }
  }

  /**
   * `"1800s"` → `1800`. **Nunca aritmética direta**: `"1800s" / 1000` é `NaN`,
   * e `NaN` num `integer` do Postgres aparece como erro de INSERT — o log
   * aponta para o banco, não para o parser, e a investigação começa no lugar
   * errado.
   */
  private parseDurationSeconds(value?: string): number | null {
    if (typeof value !== 'string') return null;
    const match = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
    if (!match) return null;
    const seconds = Number(match[1]);
    if (!Number.isFinite(seconds)) return null;
    return Math.round(seconds);
  }

  /**
   * Aceita número OU string. A API mistura os dois no MESMO objeto: doubles
   * (`caloriesKcal: 380.0`) vêm como número, int64 (`steps: "6200"`,
   * `averageHeartRateBeatsPerMinute: "148"`) vêm como string, porque é assim
   * que protobuf serializa int64 em JSON.
   */
  private parseNumber(value?: number | string | null): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Pace em **segundos/km inteiros** — a unidade canônica do repo.
   *
   * Fonte primária: `averageSpeedMillimetersPerSecond`. `1e6 / mmPerSec` é
   * exato (1e6 mm = 1 km), enquanto `averagePaceSecondsPerMeter` chega
   * arredondado a uma casa.
   *
   * Fallback: distância e duração, do mesmo jeito que os normalizers do Apple
   * Health e do Health Connect fazem — e na mesma unidade, para que a
   * substituição seja invisível a jusante.
   *
   * A GUARDA DOS 20: `paceValueToSecondsPerKm` multiplica por 60 todo valor
   * abaixo de 20, achando que é decimal min/km legado. 20 s/km é 180 km/h —
   * nenhum humano. Se a conta der isso, a entrada estava corrompida; devolver
   * `undefined` deixa o pace vazio (visível) em vez de gravar um número 60×
   * errado (invisível).
   */
  private resolvePaceSecondsPerKm(
    speedMmPerSecond: number | null,
    distanceMeters: number,
    movingTimeSeconds: number,
    externalId: string,
  ): number | undefined {
    let paceSecondsPerKm: number | null = null;

    if (speedMmPerSecond !== null && speedMmPerSecond > 0) {
      paceSecondsPerKm = Math.round(1e6 / speedMmPerSecond);
    } else if (distanceMeters > 0 && movingTimeSeconds > 0) {
      paceSecondsPerKm = Math.round(
        movingTimeSeconds / (distanceMeters / 1000),
      );
    }

    if (paceSecondsPerKm === null || paceSecondsPerKm <= 0) return undefined;

    if (paceSecondsPerKm < PACE_FORMAT_LEGACY_THRESHOLD) {
      this.logger.error(
        `[google_health] pace calculado de ${paceSecondsPerKm} s/km para ${externalId} ` +
          `é fisicamente impossível e cairia na heurística de pace-format.ts (×60) — descartado`,
      );
      return undefined;
    }

    return paceSecondsPerKm;
  }

  /**
   * Data/hora a partir do CIVIL DA FONTE.
   *
   * A API entrega `civilStartTime` (hora do relógio de parede de quem correu,
   * sem fuso) e `startUtcOffset` (o fuso daquele momento, como Duration:
   * `"-10800s"`, `"0s"`). Juntar os dois num ISO com offset preserva as duas
   * informações e deixa `new Date()` calcular o instante certo.
   *
   * **Não reconverter do UTC.** `toSaoPauloDateString` usa `-3` fixo, e o dia
   * de São Paulo é a CHAVE da reconciliação com o treino do plano: derivar o
   * civil de novo, a partir do UTC e de um offset fixo, é reintroduzir a classe
   * de bug que este projeto já pagou (dois treinos na mesma data).
   *
   * Fallback para `startTime` (RFC3339 UTC) só quando o civil não vem — é o
   * mínimo para não perder a corrida, e fica registrado que é fallback.
   */
  private resolveStartDate(exercise: GoogleHealthExercise): string | null {
    const interval = exercise.interval;
    if (!interval) return null;

    const civil = interval.civilStartTime?.trim();
    if (civil) {
      const offset = this.formatUtcOffset(interval.startUtcOffset);
      const candidate = offset === null ? civil : `${civil}${offset}`;
      if (this.isParsableDate(candidate)) return candidate;
    }

    const physical = interval.startTime?.trim();
    if (physical && this.isParsableDate(physical)) return physical;

    return null;
  }

  /** `"-10800s"` → `"-03:00"`; `"0s"` → `"+00:00"`. `null` se não der. */
  private formatUtcOffset(value?: string): string | null {
    const seconds = this.parseDurationSeconds(value);
    if (seconds === null) return null;
    const sign = seconds < 0 ? '-' : '+';
    const absolute = Math.abs(seconds);
    const hours = Math.floor(absolute / 3600);
    const minutes = Math.floor((absolute % 3600) / 60);
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private isParsableDate(value: string): boolean {
    return Number.isFinite(new Date(value).getTime());
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
