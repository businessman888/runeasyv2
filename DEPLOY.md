# Deploy — RunEasy backend

Como o backend chega ao staging e à produção, medido no painel do Railway, não
suposto a partir do repositório.

Variáveis por ambiente: a matriz está na seção 5. Formato e explicação de cada
uma: `backend/.env.example`.

---

## 1. Ordem de deploy

**Push no `develop` deploya o staging sozinho, em ~90 s.** Não existe passo de
aprovação. Consequência direta: **migration entra ANTES do push**, senão o
código novo sobe contra um schema que ainda não tem a coluna.

### Staging

1. `npm run build` e `npm test` no `backend/` — verdes.
   **Não rode `npm run lint`.** O script tem `--fix` e o repositório tem 627
   erros auto-corrigíveis: ele reescreve dezenas de arquivos alheios ao seu
   diff. E nunca fica verde — o baseline é de 2.465 problemas (medido
   2026-09-15). Lint de verdade é `npx eslint <os arquivos do seu diff>`,
   sem `--fix`, comparado com o mesmo comando em `HEAD`.
2. Se houver migration: **o usuário aplica no SQL Editor do Supabase**
   (`gcaozgnevvmnlxnkfthh`). O agente escreve o arquivo em
   `backend/supabase/migrations/`; aplicar nunca é do agente, nem em staging.
3. Push no `develop`.
4. Conferir o **log de boot** no Railway. Não confira por `GET /api/health`: o
   container é sempre PID 38 e essa rota é respondida pelo `AppController`, sem
   `uptime` — ela responde igual antes e depois do restart. O log de boot é o
   único sinal de que o processo novo subiu.

### Produção

1. Migration primeiro, no Supabase de produção (`ndlsxgsccyjspbhzccyp`),
   aplicada pelo usuário.
2. Só então o código (`main`).
3. Migration é aditiva: **nunca `drop` no revert.** Coluna sem leitor é inerte;
   coluna derrubada com código antigo no ar é incidente.

---

## 2. Configuração real do Railway

Medido em 2026-09-15 com `get-service-config` nos dois ambientes.

| Item | Valor |
|---|---|
| Projeto | `zoological-reprieve` (backend + Redis) |
| Serviço | `runeasyv2` |
| Builder | `RAILPACK` |
| Root Directory | `/backend` |
| Build Command | **não configurado** |
| Start Command | **não configurado** |
| Branch → ambiente | `develop` → staging, `main` → production |
| Build efetivo (log) | `npm install` + `npm run build` |

**Não existe IaC no repositório** — nenhum `railway.json`, `railway.toml`,
`Procfile` ou `Dockerfile`. A verdade do deploy está só no painel.

### O `package.json` da raiz nunca é executado

O Root Directory do serviço é `/backend`, então o Railway **não enxerga a raiz
do monorepo**. Os scripts `railway:build` e `railway:start` em
`runeasyv2/package.json` são código morto: funcionariam se alguém os rodasse,
mas nada no Railway os roda. Ficam no lugar porque `railway:start` encadeia em
`backend`'s `start:prod` e serve de atalho manual.

### Entry point real

**MEDIDO no log de boot do staging em 2026-09-16:**

```
[Bootstrap] argv[1]: /app/dist/src/main
```

E a resposta não é nenhum dos dois candidatos. `start` é `nest start`, que daria
o caminho do CLI do Nest; `start:prod` é `node dist/src/main.js`, que daria o
caminho **com** a extensão. O que roda é `node dist/src/main`, sem `.js`.

**Conclusão: o Railpack não executa script nenhum do `package.json`.** Ele
resolve o entry point sozinho, a partir do layout do `dist/`. Isso fecha o
mistério de por que o antigo `start:prod` apontando para `node dist/main` — um
arquivo que não existe desde março — nunca derrubou o deploy: ele nunca foi
executado.

Consequências práticas:

- os scripts `start`, `start:prod`, `railway:build` e `railway:start` valem
  **só para uso local**. Nenhum deles governa o que a produção roda;
- o que governa é o **layout do `dist/`**. Por isso **não adicione `rootDir`**
  ao `tsconfig`: a saída migraria de `dist/src/` para `dist/` e o Railpack
  passaria a resolver outro caminho, sem aviso.

O build gera `dist/src/main.js`, e não `dist/main.js`, porque o `tsconfig` não
define `rootDir` e a pasta `scripts/` entra na compilação — o TypeScript então
usa `backend/` como raiz comum. `start:prod` aponta para o caminho que existe.
**Não adicione `rootDir`**: a saída migraria de `dist/src/` para `dist/`, o que
pode quebrar um start que hoje funciona.

---

## 3. Crons

`CRONS_ENABLED` é o kill-switch dos cinco `@Cron` do app. Definida, manda
(`true`/`1` liga, o resto desliga); ausente, liga apenas com
`NODE_ENV=production`.

⚠️ **O Railway NÃO seta `NODE_ENV=production` nos dois ambientes.** Medido em
2026-09-16, depois de este documento ter afirmado o contrário a partir do *nome*
da variável aparecer nas duas listas — e não do valor:

| Ambiente | `NODE_ENV` | Como foi medido |
|---|---|---|
| staging | **`staging`** | `[Bootstrap] NODE_ENV:` no log de boot |
| produção | `production` | sonda de CORS: o `main.ts` só recusa origem fora da lista quando é `production`, e a produção recusou |

O primeiro deploy do kill-switch, por isso, **desligou os crons do staging** —
inclusive o refresh de token a cada 10 min. O erro apareceu em 3 minutos porque
o log de boot imprime o motivo da decisão; sem essa linha, teria aparecido como
a ausência de uma notificação no dia seguinte.

Daí a regra: **`CRONS_ENABLED` é setada explicitamente em todo ambiente que deve
ter cron.** Staging já está. Produção ainda depende do default por `NODE_ENV`, e
isso é frágil — quem mexer no `NODE_ENV` de lá desliga os crons sem perceber.

🔴 **Passo obrigatório ao promover o Commit A para a `main`:** setar
`CRONS_ENABLED=true` na produção **no mesmo movimento**. Não antes: a produção
ainda não tem código que leia a variável, e setá-la agora custaria um restart de
produção para um efeito nulo.

Desenvolvimento local fica sem cron, que é o ponto: o `.env` local aponta para o Supabase de staging, e antes
disso um backend rodando na máquina disparava IA paga e push real às 00:00
(retrospectiva e insight semanal), 04:00 (lembrete) e 07:00 (readiness).

O log de boot diz qual estado vigora e de onde veio a decisão:

```
[Bootstrap] CRONS: LIGADOS (env explícita CRONS_ENABLED="true")
[Bootstrap] CRONS: DESLIGADOS (default por NODE_ENV="staging")
[Bootstrap] CRONS: DESLIGADOS (env explícita CRONS_ENABLED="false")
```

Para rodar o backend local contra o staging: `npm run build` e
`node dist/src/main.js`. **Nunca `npm run start:dev`** — o watcher sobrevive à
morte da porta e renasce sozinho.

---

## 4. `ENCRYPTION_KEY` por ambiente

`ENCRYPTION_KEY` é a chave AES-256-GCM que cifra os tokens OAuth de dispositivo
em `connected_devices`. Hex de 64 caracteres; o `EncryptionService` lança no
boot se ela faltar ou tiver outro tamanho, derrubando o app inteiro.

### O problema, como medido

**A chave do `.env` local é a MESMA do staging** (medido na Fase 3: a chave
local decifra tokens que o Railway gravou — o GCM recusaria chave errada pela
tag de autenticação). Se a de produção é a mesma: **não determinado.**

Consequência: uma máquina de desenvolvimento comprometida decifra todos os
tokens OAuth de staging. E quem tiver o `.env` local tem, de fato, a chave dos
dados de outro ambiente.

### O que se quer

Uma chave distinta por ambiente — local, staging, produção — sem nenhuma
compartilhada. Nenhuma delas versionada.

### Rotação — passos do usuário, não do agente

Trocar a chave torna **ilegível todo token já cifrado** com a anterior. Não é
uma operação que se faz sozinha; é um plano com estado do banco no meio.

1. **Medir antes.** Quantas linhas de `connected_devices` existem no ambiente
   que vai rodar. Zero linhas = a rotação é gratuita, e é o cenário do staging
   hoje.
2. **Se houver linhas**, escolher entre:
   - **Reconexão forçada** — trocar a chave, apagar as linhas e pedir ao usuário
     que reconecte. Simples, e enquanto o app Google estiver em modo Teste o
     usuário já reconecta toda semana (refresh token de 7 dias).
   - **Re-cifragem** — script que lê com a chave velha e grava com a nova, com
     as duas em memória. Só vale a pena com volume que justifique.
3. **Gerar a chave nova:**
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **Setar no Railway** no ambiente alvo, e **só nele**.
5. **Reiniciar** e conferir o log de boot. Chave malformada derruba o app na
   inicialização — o erro aparece ali, não em runtime.
6. **Provar**: conectar uma conta e desconectar. Se o token for legível, a chave
   está certa.

Pendência aberta do usuário: decidir e executar a separação. O Commit A da Fase
4 só documenta o caminho — **não gera e não troca chave nenhuma.**

---

## 5. Matriz de variáveis por ambiente

Legenda: ✅ setada e medida · ❌ ausente e medida · **?** não determinado (não
foi medido no painel — `.env` local nunca é prova do que o serviço deployado
tem).

| Variável | Local | Staging | Produção |
|---|---|---|---|
| `SUPABASE_URL` | ✅ `gcaozgnevvmnlxnkfthh` | ✅ `gcaozgnevvmnlxnkfthh` | ✅ `ndlsxgsccyjspbhzccyp` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ |
| `SUPABASE_ANON_KEY` | ✅ | **?** | **?** |
| `ANTHROPIC_API_KEY` | ✅ | ✅ | ✅ |
| `NODE_ENV` | `development` | ✅ **`staging`** (medido) | ✅ `production` (medido) |
| `PORT` | 3000 | ✅ | ✅ |
| `FRONTEND_URL` | ✅ | **?** | **?** |
| `REDIS_URL` | fallback 127.0.0.1 | ✅ (serviço Redis) | ✅ (serviço Redis) |
| `ENCRYPTION_KEY` | ✅ | ✅ **igual à local** (medido) | **?** |
| `CRONS_ENABLED` | ausente ou `false` | ✅ **`true`** (obrigatória: `NODE_ENV` ali não é `production`) | ⬜ **setar `true` ao promover o Commit A** |
| `GOOGLE_HEALTH_WEBHOOK_SECRET` | ✅ igual à do staging | ✅ setada 2026-09-16 | ⬜ Fase 5/6 |
| `GOOGLE_HEALTH_SERVICE_ACCOUNT` | ⬜ Commit C | ⬜ **Commit C** | ⬜ Fase 5/6 |
| `GOOGLE_HEALTH_PROJECT_ID` | ⬜ Commit C | ⬜ **Commit C** | ⬜ Fase 5/6 |
| `GOOGLE_HEALTH_SUBSCRIBER_ID` | ⬜ Commit C | ⬜ **Commit C** | ⬜ Fase 5/6 |
| `MAPBOX_ACCESS_TOKEN` | ✅ | **?** | **?** |
| `REVENUECAT_WEBHOOK_SECRET` | ✅ | ✅ (próprio) | ✅ (próprio) |
| `GOOGLE_HEALTH_CLIENT_ID` | ✅ | ✅ (medido) | ❌ (medido) |
| `GOOGLE_HEALTH_CLIENT_SECRET` | ✅ | ✅ (medido) | ❌ (medido) |
| `GOOGLE_HEALTH_REDIRECT_URI` | ✅ **valor antigo** | ✅ (medido) | ❌ (medido) |
| `FITBIT_*` / `POLAR_*` | ✅ | ✅ | ✅ |

Notas:

- **`GOOGLE_HEALTH_*` não existe em produção**, e é assim de propósito: Google
  Health em produção é assunto da Fase 5/6. Sem elas, o app sobe com um WARN e
  as rotas respondem 503 com o motivo — não derruba nada.
- O `GOOGLE_HEALTH_REDIRECT_URI` do `.env` local ainda aponta para o caminho
  antigo (`/integrations/google-health/callback`). O correto é
  `/api/devices/google-health/callback`.
- Variável de ambiente **não se prova pelo `.env` do repositório.** Sem CLI ou
  painel, o status é "não determinado"; meça o serviço deployado.
