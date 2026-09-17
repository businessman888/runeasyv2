import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

/**
 * Parser do TCX que a Google Health devolve em `exportExerciseTcx`.
 *
 * ── A CADEIA TEM SEIS ELOS E CADA UM SILENCIA A ROTA SEM ERRO ────────────────
 *
 * A rota não é campo nem `dataType`: é uma SEGUNDA requisição, em XML, gated
 * por `exerciseMetadata.hasGps`. Entre o `hasGps` e o replay do VDOT há seis
 * passos, e a falha de qualquer um deles produz o MESMO sintoma — atividade
 * ingerida normalmente, rota vazia, ninguém sabendo por quê:
 *
 *   1. checar `hasGps` antes de pedir            (processor)
 *   2. ter `location.readonly` no escopo         (processor)
 *   3. segunda requisição                        (cliente da API)
 *   4. parsear o XML                             ← aqui
 *   5. `<Time>` ISO-8601 vira timestamp NUMÉRICO ← aqui
 *   6. `{lat,lng}` com o nome que o repo espera  ← aqui
 *
 * O passo 5 é o mais traiçoeiro. `normalizePoints` (`effort-replay.ts:198-214`)
 * faz `Number(p.timestamp)` e descarta `!Number.isFinite(ts) || ts <= 0`.
 * Entregar a string ISO direto dá `NaN` e **todos** os pontos somem, em
 * silêncio, sem exceção — a rota inteira desaparece e a atividade continua lá,
 * parecendo normal.
 *
 * ── MEDIDO CONTRA UM TCX REAL (2026-09-17) ──────────────────────────────────
 *
 * `Content-Type: application/vnd.garmin.tcx+xml` — e **não**
 * `application/tcx+xml`, como a Fase 0 registrou.
 *
 * `<Time>` vem com OFFSET, não com `Z`: `2026-09-17T16:31:20.949-03:00`.
 * `Date.parse` lida com os dois, mas a suposição de que viria em `Z` estava
 * errada.
 *
 * Amostragem medida: mediana de ~5,8 s, com um buraco de 72 s no meio (GPS
 * perdeu sinal). Buraco é normal e não invalida a rota — mas pesa no
 * `MIN_COVERAGE_RATIO` de 0,6 do replay de esforço.
 *
 * ── A AMBIGUIDADE DE FORMA DO XML ───────────────────────────────────────────
 *
 * `Activity`, `Lap` e `Trackpoint` viram OBJETO quando há um e ARRAY quando há
 * vários — é como todo parser de XML sem schema se comporta. Uma corrida de uma
 * volta dá objeto; uma de várias dá array. Tratar só o caso que apareceu no
 * teste é garantir que o outro quebre em produção.
 */

/** O ponto no formato que `DeviceLocalActivity.gps_route` espera. */
export interface TcxTrackPoint {
  lat: number;
  lng: number;
  altitude?: number;
  /** Epoch em MILISSEGUNDOS. Numérico — ver o passo 5 acima. */
  timestamp: number;
}

interface RawTrackpoint {
  Time?: string;
  Position?: {
    LatitudeDegrees?: string;
    LongitudeDegrees?: string;
  };
  AltitudeMeters?: string;
}

/** Objeto vira lista de um; ausente vira lista vazia. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class GoogleHealthTcxParser {
  private readonly logger = new Logger(GoogleHealthTcxParser.name);

  /**
   * `parseTagValue: false` é deliberado: deixar o parser adivinhar tipo faria
   * uma latitude como `-21.7750751` virar número às vezes e string outras,
   * dependendo do formato. Converter em UM lugar, explicitamente, é o que torna
   * a conversão testável.
   */
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });

  /**
   * XML → pontos utilizáveis. **Nunca lança**: TCX ilegível é rota ausente, não
   * corrida perdida. A atividade entra sem rota e o log diz o motivo.
   */
  parse(xml: string): TcxTrackPoint[] {
    if (!xml || xml.trim().length === 0) {
      this.logger.warn('[google_health] TCX vazio — sem rota');
      return [];
    }

    let doc: unknown;
    try {
      doc = this.parser.parse(xml);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[google_health] TCX ilegível: ${message}`);
      return [];
    }

    const raw = this.collectTrackpoints(doc);
    if (raw.length === 0) {
      this.logger.warn(
        '[google_health] TCX sem Trackpoint — rota vazia (esteira, ou GPS que não gravou)',
      );
      return [];
    }

    const points: TcxTrackPoint[] = [];
    let semPosicao = 0;
    let semTempo = 0;

    for (const point of raw) {
      const lat = toNumber(point.Position?.LatitudeDegrees);
      const lng = toNumber(point.Position?.LongitudeDegrees);
      if (lat === null || lng === null) {
        // Trackpoint sem posição é normal: o TCX registra o instante mesmo
        // quando o GPS não fixou. Não é erro, é buraco.
        semPosicao += 1;
        continue;
      }

      // PASSO 5. Sem isto, `Number(p.timestamp)` a jusante dá NaN e o ponto
      // some sem deixar rastro.
      const timestamp = point.Time ? Date.parse(point.Time) : NaN;
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        semTempo += 1;
        continue;
      }

      const altitude = toNumber(point.AltitudeMeters);
      points.push({
        lat,
        lng,
        timestamp,
        ...(altitude === null ? {} : { altitude }),
      });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);

    if (semPosicao > 0 || semTempo > 0) {
      this.logger.log(
        `[google_health] TCX: ${points.length} ponto(s) utilizável(eis) de ${raw.length} ` +
          `(${semPosicao} sem posição, ${semTempo} sem tempo válido)`,
      );
    }

    return points;
  }

  /**
   * Desce até os `Trackpoint`, tolerando objeto ou array em cada nível.
   *
   * `TrainingCenterDatabase > Activities > Activity[] > Lap[] > Track > Trackpoint[]`
   */
  private collectTrackpoints(doc: unknown): RawTrackpoint[] {
    const db = (doc as Record<string, unknown>)?.TrainingCenterDatabase as
      | Record<string, unknown>
      | undefined;
    const activities = db?.Activities as Record<string, unknown> | undefined;

    type Node = Record<string, unknown>;
    const out: RawTrackpoint[] = [];

    for (const activity of asArray<Node>(activities?.Activity as Node)) {
      for (const lap of asArray<Node>(activity?.Lap as Node)) {
        const track = lap?.Track as Node | undefined;
        for (const point of asArray<RawTrackpoint>(
          track?.Trackpoint as RawTrackpoint,
        )) {
          out.push(point);
        }
      }
    }
    return out;
  }
}
