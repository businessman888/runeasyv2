# RunEasy — Checklist de Lançamento (ações manuais)

Estas ações **não são feitas por código** e precisam ser executadas manualmente
antes do build/submissão de produção. Geradas a partir das correções de
pré-produção (C1–C4, I1–I8).

## 1. Variáveis de ambiente no EAS

Arquitetura: `mobile/eas.json` define `env` por profile (inline), que **tem
precedência** sobre as variáveis do EAS Dashboard. Profiles `development`/`staging`
→ staging; `production` → produção. Cada profile mapeia para um EAS environment
(`development`/`preview`/`production`) via campo `environment`, de onde vêm os
**secrets de build** (não comitados).

✅ **Resolvido / verificado:**
- Todas as `EXPO_PUBLIC_*` preenchidas e separadas por ambiente no `eas.json`
  (Supabase, API, RevenueCat `appl_`/`goog_` em prod e `test_` em dev/staging,
  Mapbox, Superwall, Google WEB/Android/iOS).
- **Google Client IDs = projeto `911159721571` (`runeasy-production`)** —
  confirmado contra a fonte da verdade nativa (`google-services.json` e
  `GoogleService-Info.plist`). Android `...0lltl662...`, iOS `...ltiean858...`,
  Web `...707rgl0s1...`.
- **`RNMAPBOX_MAPS_DOWNLOAD_TOKEN` já configurado como EAS secret** nos 3
  environments (development, preview, production). Nada a fazer — é o que faz o
  build cloud baixar o SDK nativo do Mapbox. (Mantido fora do `eas.json` por ser
  secret `sk....`.)
- **`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (token `pk.` público) vive só no EAS env**,
  nos 3 environments — **removido do `eas.json`** porque o GitHub Push Protection
  bloqueia qualquer token Mapbox no versionado. O `eas build` lê do Dashboard; o
  dev local lê do `.env` (nunca usou o `eas.json`). `EXPO_PUBLIC_MAPBOX_STYLE_URL`
  permanece inline (não é segredo).
- **Superwall separado por plataforma:** a variável única
  `EXPO_PUBLIC_SUPERWALL_API_KEY` foi substituída por
  `EXPO_PUBLIC_SUPERWALL_API_KEY_ANDROID` (`pk_VhV-...`) e
  `EXPO_PUBLIC_SUPERWALL_API_KEY_IOS` (`pk_LxD8...`) nos 3 profiles. Cada chave
  aponta para um **app distinto** no dashboard do Superwall (campanhas/paywalls
  próprios por loja); o app iOS agora está configurado com seus próprios
  paywalls. `getSuperwallApiKey()` resolve via `Platform.OS` (espelha o split do
  RevenueCat). Antes o iOS usava a chave do app Android, puxando paywalls do app
  errado. Ambas resolvidas.

✅ **EAS Dashboard sincronizado** (feito via `eas env:push --force`): os 3
environments agora batem com o `eas.json` — `development`/`preview` → staging
(backend staging, Google `911...` web de staging, RevenueCat `test_`),
`production` → produção (backend prod, Google `911...` web `707`, RevenueCat
`appl_`/`goog_`). O projeto Google stale `74528549958` foi eliminado e o secret
`RNMAPBOX_MAPS_DOWNLOAD_TOKEN` foi preservado nos 3.
- Obs.: o push deixou as chaves públicas (`EXPO_PUBLIC_*`) com visibilidade
  *plaintext* no dashboard — sem impacto, pois já são embutidas no bundle.

⏳ **Apenas confirmar (valores já preenchidos, validar se são os corretos):**

| Variável | Ação |
|---|---|
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` (staging) | Confirmar se `sb_publishable_c11B_...` é a publishable key correta da staging. |

## 2. Backend (Railway) — variável obrigatória  ✅ FEITO

- [x] `REVENUECAT_WEBHOOK_SECRET` setado no Railway (sem ele o webhook
  `POST /api/webhooks/revenuecat` rejeita todas as requisições, por design).
- [x] `NODE_ENV=production` setado (ativa CORS restrito a `https://app.runeasy.com.br`
  + apps nativos, e respostas de erro sem stack trace).

## 3. Supabase — SQL de segurança das funções  ✅ FEITO

- [x] `backend/supabase/migrations/20260610_fix_function_security.sql` aplicado
  em produção (`ndlsxgsccyjspbhzccyp`) e staging (`gcaozgnevvmnlxnkfthh`).
- [ ] (Opcional) Rodar o **security advisor** do Supabase e confirmar que sumiram
  os lints `anon_security_definer_function_executable` e
  `function_search_path_mutable`.

## 4. Como gerar os builds (dev, preview, prod)

Os três profiles do `eas.json` resolvem o ambiente automaticamente:
- **development** e **preview** → backend **staging** (mesma config; preview é um
  build de release contra staging, dev é depurável com `__DEV__`).
- **production** → backend **produção**.

Pré-requisitos: `eas login` (conta `businessman23`); rodar de dentro de `mobile/`.

### development (build depurável, dev client + Metro)
```bash
cd mobile
eas build --profile development --platform android   # ou ios
# instalar o dev client no aparelho/emulador e então:
npm run start        # Metro; o app abre apontando para staging
```

### preview (build de release contra staging — QA final)
```bash
cd mobile
eas build --profile preview --platform android       # gera APK (instalação direta)
eas build --profile preview --platform ios           # build interno (TestFlight/ad-hoc)
# distribuição "internal" — instale o APK direto ou via TestFlight
```

### production (loja)
```bash
cd mobile
eas build --profile production --platform android     # gera AAB (app-bundle) p/ Play Store
eas build --profile production --platform ios         # build de loja (credenciais remotas)

# submissão às lojas:
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

Notas:
- `appVersionSource: remote` + `autoIncrement: true` → o EAS incrementa
  versionCode/buildNumber automaticamente; não precisa editar à mão.
- Ambos os platforms podem ser disparados juntos com `--platform all`.

### Checklist de validação pós-build (rodar em dispositivo real)
- [ ] Login Google **e** Apple (token chega ao backend; nenhuma chamada 401 —
  o `authedFetch` injeta o Bearer).
- [ ] Mapas renderizam (Mapbox), paywall abre (Superwall), compra processa
  (RevenueCat — `test_` em staging/sandbox, `appl_`/`goog_` em produção).
- [ ] Home, Calendário, Notificações e Perfil carregam sem erro.
- [ ] Selo de ambiente aparece em dev/preview (DEV/STAGING) e **não** aparece em
  produção.

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
