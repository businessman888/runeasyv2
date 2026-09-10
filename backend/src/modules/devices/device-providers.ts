/**
 * Os provedores de dispositivo que o backend aceita — fonte única.
 *
 * ── POR QUE ISTO É UM ARQUIVO PRÓPRIO ────────────────────────────────────────
 *
 * A lista morava dentro de `devices.service.ts`, o que impedia o DTO de usá-la:
 * o service já importa `ConnectDeviceDto`, então o DTO importar de volta o
 * service fecharia um ciclo de import. Com a constante isolada aqui, os dois
 * lados leem a MESMA lista — a validação de borda (`@IsIn` no DTO) e a guarda
 * de profundidade (`validateProvider` no service) não podem divergir.
 *
 * Adicionar um provedor novo é acrescentar uma string aqui, e só.
 *
 * ── SOBRE OS DOIS TIPOS DE PROVEDOR ─────────────────────────────────────────
 *
 * A lista mistura duas naturezas, e a diferença importa em quem consome:
 *
 *   OAuth em nuvem   `fitbit`, `polar`, `google_health` — têm token, expiram,
 *                    renovam, e o dado chega por webhook + fetch do servidor.
 *   Registro local   `garmin`, `apple_watch`, `apple_health`, `health_connect`
 *                    — a linha em `connected_devices` é só um marcador; o dado
 *                    chega pelo próprio app, sem token nenhum (por isso
 *                    `access_token` é nullable desde 20260408).
 */

export const VALID_PROVIDERS = [
  'garmin',
  'fitbit',
  'polar',
  'apple_watch',
  'apple_health',
  'health_connect',
  // Sucessor da Fitbit Web API. Presente no vocabulário para que a Fase 3
  // possa persistir a conexão; NENHUMA lógica de OAuth, ingestão ou refresh
  // existe ainda — hoje o valor só passa na validação e é ignorado pelo resto.
  'google_health',
] as const;

export type DeviceProvider = (typeof VALID_PROVIDERS)[number];
