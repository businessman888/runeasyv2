# Railway Environment Variables for RunEasy Backend

> **Processo de deploy, configuração real do Railway (medida no painel), matriz
> completa de variáveis por ambiente e rotação de `ENCRYPTION_KEY`:
> [`DEPLOY.md`](./DEPLOY.md).**
>
> Este arquivo é só a lista mínima do que precisa existir no serviço. O formato
> e o racional de cada variável estão em `backend/.env.example`.

## Required Variables
Configure these in Railway Dashboard > Variables:

### Supabase
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...your_anon_key
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your_service_role_key
```

### Anthropic (Claude AI)
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Application
```
NODE_ENV=production
PORT=3000
FRONTEND_URL=runeasy://callback
```

### Encryption
```
ENCRYPTION_KEY=<hex de 64 caracteres>
```
Cifra os tokens OAuth de dispositivo. O app **não sobe** sem ela. Cada ambiente
deveria ter a sua — ver a seção de rotação em `DEPLOY.md`.

### Redis / BullMQ
```
REDIS_URL=rediss://...
```
Vem do serviço Redis do mesmo projeto Railway.

### Crons (opcional)
```
CRONS_ENABLED=true|false
```
Kill-switch dos `@Cron`. **Não precisa ser setada no Railway:** sem ela, os
crons ligam porque `NODE_ENV=production`. Serve para desligar pontualmente um
ambiente sem tirar o app do ar.

## Railway Configuration

**Medido no painel em 2026-09-15 — não há Build Command nem Start Command
configurados.**

| Item | Valor real |
|---|---|
| Projeto | `zoological-reprieve`, serviço `runeasyv2` |
| Builder | `RAILPACK` |
| Root Directory | `/backend` |
| Build Command | não configurado (o Railpack roda `npm install` + `npm run build`) |
| Start Command | não configurado (o Railpack escolhe a partir de `backend/package.json`) |
| Branches | `develop` → staging, `main` → production |

Como o Root Directory é `/backend`, o `package.json` da **raiz do monorepo nunca
é executado** pelo Railway: `railway:build` e `railway:start` são atalhos
manuais, não o que o deploy roda. Detalhe e como o entry point real foi medido:
`DEPLOY.md`, seção 2.

## Checklist Before Deploy
- [ ] Migration aplicada **antes** do push (push no `develop` deploya sozinho)
- [ ] All environment variables set in Railway Dashboard
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured (not just anon key)
- [ ] `ENCRYPTION_KEY` presente (sem ela o boot falha)
- [ ] Supabase RLS policies configured
- [ ] `npm run build`, `npm run lint` e `npm test` verdes no `backend/`
- [ ] Depois do deploy: conferir o **log de boot**, não o `GET /api/health`
