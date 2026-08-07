/**
 * Teto do corpo das requisições.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * O default do body-parser é 100 KB, e a conclusão de treino manda a rota GPS
 * inteira em `route_points`. O `locationTask` aceita um ponto a cada ≥10 m e o
 * `expo-location` entrega a cada 2 s, o que dá ~1 ponto por 11 m na prática —
 * e cada ponto serializa em ~140 bytes (lat, lng, altitude, timestamp, speed,
 * accuracy, todos em precisão dupla).
 *
 * Medido:
 *    5 km →   455 pontos →  78 KB   (passava)
 *    8 km →   727 pontos → 125 KB   ← já estourava
 *   10 km →   909 pontos → 156 KB
 *   21 km → 1 918 pontos → 329 KB
 *   42 km → 3 836 pontos → 657 KB
 *
 * Ou seja: TODA corrida ao ar livre acima de ~6,5 km falhava com
 * `PayloadTooLargeError` → HTTP 500, e o treino não era concluído. Passou
 * despercebido porque as corridas de teste eram curtas.
 *
 * ── POR QUE 2 MB ─────────────────────────────────────────────────────────────
 *
 * Cobre uma maratona (657 KB) com ~3× de folga, e ainda é pequeno o bastante
 * para não virar vetor de abuso — um teto alto demais deixaria qualquer cliente
 * ocupar memória do processo à vontade.
 *
 * O próximo candidato a passar disto é o sync de wearable em lote (as rotas de
 * `/devices`), que recebe VÁRIAS atividades com `gps_route` numa requisição só.
 * Se aquilo começar a falhar, o limite deve subir junto com uma paginação do
 * lote — não sozinho.
 */
export const BODY_SIZE_LIMIT = '2mb';

/** O mesmo valor em bytes, para os testes conferirem contra payloads reais. */
export const BODY_SIZE_LIMIT_BYTES = 2 * 1024 * 1024;
