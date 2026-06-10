# RunEasy — Checklist de Lançamento (ações manuais)

Estas ações **não são feitas por código** e precisam ser executadas manualmente
antes do build/submissão de produção. Geradas a partir das correções de
pré-produção (C1–C4, I1–I8).

## 1. Variáveis de ambiente no EAS (antes do build `production`)

O `eas.json` (profile `production`) contém placeholders `[SUBSTITUIR_*]`. Antes
de buildar, defina os valores reais — preferencialmente como **EAS environment
variables / secrets** no dashboard do EAS (Expo), não commitando segredos:

| Variável | Observação |
|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | Chave **de produção** `appl_...` (hoje estava uma `test_...`) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | Chave **de produção** `goog_...` |
| `EXPO_PUBLIC_SUPERWALL_API_KEY` | Chave pública de produção do Superwall |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Token público `pk....` do Mapbox |
| `EXPO_PUBLIC_MAPBOX_STYLE_URL` | URL do estilo Mapbox |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` | Client ID Android (GCP) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` | Client ID iOS (GCP) |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` | **Secret de build** `sk....` — defina como EAS secret, NÃO no `eas.json` |

> Sem isso, em produção o RevenueCat/Superwall/Mapbox/Google Sign-In ficam
> `undefined` e quebram silenciosamente.

## 2. Backend (Railway) — variável obrigatória

Garanta no ambiente de produção do Railway:

- `REVENUECAT_WEBHOOK_SECRET` — sem ele o webhook `POST /api/webhooks/revenuecat`
  rejeita **todas** as requisições (por design).
- `NODE_ENV=production` — ativa CORS restrito (só `https://app.runeasy.com.br` +
  apps nativos) e respostas de erro sem stack trace.

## 3. Supabase — rodar o SQL de segurança (prod **e** staging)

Aplicar `backend/supabase/migrations/20260610_fix_function_security.sql` em
**ambos** os projetos:

- Produção: `ndlsxgsccyjspbhzccyp`
- Staging: `gcaozgnevvmnlxnkfthh`

É idempotente (seguro re-rodar). Depois, rode o **security advisor** do Supabase
e confirme que sumiram os lints `anon_security_definer_function_executable` e
`function_search_path_mutable`.

## 4. Build de validação (produção)

Gerar um build EAS `production` e confirmar em dispositivo real:

- Login Google **e** Apple funcionam (token chega ao backend; nenhuma chamada
  retorna 401 — o `authedFetch` injeta o Bearer).
- Mapas renderizam (Mapbox), paywall abre (Superwall), compra processa
  (RevenueCat com chave de produção).
- Home, Calendário, Notificações e Perfil carregam sem erro.

## 5. Notas de comportamento introduzido

- **Auth global**: toda rota do backend exige `Authorization: Bearer` exceto as
  marcadas `@Public()` (login/refresh, health, webhooks RevenueCat/Fitbit/Polar,
  listagem pública de `races`). O app passou a enviar o token via
  `mobile/src/services/apiClient.ts` (`authedFetch`).
- **Quota de IA (Free)**: 2 gerações de plano/dia + 10 feedbacks/dia; Pro é
  ilimitado. Plano excedido → HTTP 429; feedback excedido → enqueue é pulado
  (a conclusão do treino nunca falha por isso).
- **Pro-only**: `POST /api/training/retrospective/generate` agora exige plano Pro
  (`ProGuard`, 403 para Free). Reutilizável em outros endpoints pagos.
- **Filas BullMQ**: retry 3x com backoff exponencial + limpeza automática.

## 6. Itens conhecidos NÃO alterados (decisões registradas)

- `BadgesScreen` permanece em `ScrollView` (catálogo fixo ~29 badges, bounded —
  não é o problema de escala da `NotificationsScreen`, que foi migrada para
  `FlatList`).
- Testes pré-existentes que falham (não relacionados a estas mudanças):
  `stats.service.spec.ts` e `gamification.service.spec.ts` (mocks de Supabase
  incompletos / lógica de badge). Recomenda-se corrigir em separado.
