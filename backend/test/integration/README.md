# Testes de integração — a fundação da Fase 6

Estes testes rodam contra um **Postgres de verdade**, executando as funções SQL
da fundação. Eles existem porque os testes de unidade **mockam o `.rpc()`**, e
foi assim que a divergência entre a fronteira calculada pelo serviço e o
predicado de `shift_pending_workouts` atravessou 95 testes verdes.

Lock, transação, compare-and-swap e idempotência **não existem em JavaScript**.
Um mock não prova nada disso.

```bash
npm run db:test:up     # sobe o Postgres descartável
npm run test:int       # roda a suíte
```

## O banco

Qualquer Postgres **local** cujo banco se chame `runeasy_test`. A trava
(`assertDisposableTarget`) é uma allowlist: host local + esse nome. Staging e
produção são remotos (`*.supabase.co`) e nunca se chamam assim — e estes testes
fazem `TRUNCATE` em `workouts`, `training_plans` e `users`.

Sobrescreva com `TEST_DATABASE_URL` se precisar de outra porta.

### Opção A — container (padrão)

```bash
docker compose --profile test up -d postgres-test
```

Imagem `postgis/postgis:17-3.5-alpine`, dados em `tmpfs` (morrem com o
container), porta 55432. Fica atrás do profile `test` para que
`docker-compose up -d` continue subindo só o Redis.

### Opção B — cluster local descartável (sem Docker)

O Docker Desktop no Windows depende do WSL2. **Se `wsl -l -v` não listar
nenhuma distro, o daemon não sobe** — foi o caso na máquina onde esta fase foi
implementada. Com os binários do PostgreSQL instalados, dá para criar um cluster
próprio, sem senha e sem privilégio de administrador:

```bash
PG="/c/Program Files/PostgreSQL/17/bin"
DATA=/tmp/pgdata-runeasy

"$PG/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C
"$PG/pg_ctl" -D "$DATA" -l /tmp/pg.log -o "-p 55432 -c fsync=off" start
node -e "const{Client}=require('pg');(async()=>{const c=new Client('postgres://postgres@localhost:55432/postgres');await c.connect();await c.query('CREATE DATABASE runeasy_test');await c.end()})()"
```

Para derrubar: `"$PG/pg_ctl" -D "$DATA" stop && rm -rf "$DATA"`.

## Como o schema é montado

`globalSetup` monta **uma vez** por execução; entre testes só há `TRUNCATE`.

```
bootstrap.sql  →  schema_producao.sql  →  migrations (ordem alfabética)
```

O dump vem primeiro porque as tabelas **core** (`users`, `training_plans`,
`workouts`, `activities`) **não estão em migration nenhuma** — foram criadas
fora do versionamento. É por isso que `supabase db reset` falharia hoje.

Duas tolerâncias documentadas no carregador:

- **Migrations anteriores ao dump** batem em "objeto duplicado" (o dump já
  contém o efeito delas). Só a família de erros de duplicata é tolerada;
  sintaxe inválida ou coluna inexistente continuam abortando. E há uma trava:
  se uma migration **nova** (`>= 20260815`) for pulada por duplicata, o setup
  falha — silêncio ali seria perigoso.
- **Sem PostGIS**, as duas colunas de geometria (`activities.route_geometry`,
  `workout_routes.route`) viram `text`. Elas ficam em tabelas que a fundação
  nunca toca. Se um teste da fundação passar a precisar de geometria, essa
  degradação tem que sair.

## O que cada arquivo prova

| Arquivo | Cobertura |
|---|---|
| `plan-adaptation.int-spec.ts` | fronteira (incl. **paridade TS ↔ SQL**), digest, caminho feliz, propriedade/RLS, tudo-ou-nada, CAS por linha (F3×F6), **duas conexões**, idempotência/replay |
| `schedule-shift.int-spec.ts` | **a mina 2** (só os IDs recebidos se movem), reclaim atômico, carimbo do insight, duplo toque não empurra duas semanas, função antiga dropada |
