# Simulador de histórico de treinos (`sim-workouts.ts`)

Gera histórico de treinos de um tester no **staging** para validar a retrospectiva de fim
de plano e, adiante, os insights semanais/mensais — sem depender de correr na rua.

## Por que ele não escreve no banco

O script **não** faz `INSERT`/`UPDATE` em `workouts`, `activities` nem em nenhuma tabela.
Ele autentica como o tester e chama **os mesmos endpoints que o app chama**.

Não é preciosismo. Dois invariantes do produto só existem porque o produtor real os aplica:

- **Unidade de pace** — `activities.average_pace` é gravado em **segundos/km** pelo
  `completeWorkout` (corrigido na Fase 0). Um `INSERT` na mão gravaria o que o autor do
  script achasse que era o formato.
- **Idempotência por `external_id`** — o `UPSERT` existe por causa de um incidente de
  recursão que gerou milhões de linhas órfãs.

Escrevendo no banco na unha, o script validaria ficção. Dirigindo os endpoints, *o que o
script gera é exatamente o que uma corrida real geraria*.

## Pré-requisitos (manuais, uma vez)

O script cuida **só das conclusões**. O tester e o plano são criados na UI:

1. Signup do tester no app apontado para staging.
2. Completar o onboarding.
3. Tornar o tester **Pro** e gerar o plano:
   ```bash
   npm run qa:sim-revenuecat -- --user <uuid> --env staging --type INITIAL_PURCHASE
   ```

> **O tester precisa ser Pro.** `completeWorkout` degrada silenciosamente para corrida
> livre quando o usuário não é Pro (defesa em profundidade contra payload manipulado).
> Sem isso, toda "conclusão de plano" viraria corrida livre, `plan_id` ficaria `null` em
> tudo, e a aderência mediria 0% sem explicar por quê. O script faz esse pré-check e
> aborta com instruções.

## Variáveis de ambiente (`backend/.env`)

```bash
SIM_TESTER_EMAIL=tester@exemplo.com
SIM_TESTER_PASSWORD=senha-do-tester

# Projeto Supabase de STAGING (não os de produção)
SUPABASE_URL_STAGING=https://<ref-staging>.supabase.co
SUPABASE_ANON_KEY_STAGING=<anon key de staging>
```

Para `--env local` ou `--env production`, o script usa `SUPABASE_URL` / `SUPABASE_ANON_KEY`.

## Trava de segurança

O script **escreve dado real** via endpoints. Ele aborta se detectar produção em
**qualquer** das duas pontas — backend **ou** Supabase — porque elas são configuradas
separadamente: dá para rodar `--env staging` com um `SUPABASE_URL` de produção no `.env`
e as escritas caírem na base real.

Bloqueia quando: `--env production`, `SUPABASE_URL` contendo o ref de produção, ou a base
URL sendo `app.runeasy.com.br`. O override é `--i-know-this-is-production` — e não há
outra forma de destravar.

Em produção isso sujaria dados de usuários pagantes **e** dispararia XP, badges, streak e
feedback de IA neles.

## Uso

### Cenário de validação da Fase 1A

```bash
npm run qa:sim-workouts:retro-1a
```

Equivale a `--env staging --completions 5 --free-runs 1 --free-run-km 8 --rpe
--generate-retrospective`: conclui 5 treinos do plano, registra 1 corrida livre de 8 km,
anexa RPE aleatório e dispara a retrospectiva.

A corrida livre é o que torna o defeito D1 testável — sem ela, aderência e total dariam o
mesmo número e o bug passaria despercebido.

### Cenário de validação da Fase 2A (insight semanal)

```bash
npm run qa:sim-workouts:week-2a
```

Equivale a `--env staging --week 2 --completions 3 --completion-ratio 1.0 --free-runs 1
--free-run-km 6 --rpe --generate-weekly-insight`: conclui **3 treinos da semana 2** com a
distância cheia, registra 1 corrida livre **dentro da janela daquela semana**, e dispara a
geração do insight.

`--week` existe porque sem ele o script pega os pendentes em ordem de data, atravessando
semanas — o que serve para a retrospectiva (escopo = plano inteiro) mas não para o insight
semanal, cujo escopo é uma semana só.

**Pré-condições que o backend exige** (senão ele responde `no_eligible_week`):

1. A semana já **fechou** — o último treino dela é anterior a hoje.
2. Não é a **última** semana do plano (essa é coberta pela retrospectiva).
3. Ela fecha em data `>= WEEKLY_INSIGHT_START_DATE` (o cutoff sem-backfill).
4. Ainda não existe linha em `plan_week_insights` para ela.

**O sinal que importa:** `suggested_adjustment.code` = `manter`. Três de cinco treinos com
a distância cheia significa que o atleta faltou, mas cumpriu o que fez — sugerir
`reduzir_volume` aí seria o conselho errado, porque o volume não foi o problema.

Os outros dois casos-chave:

```bash
# Ausência severa → repetir_semana, classe schedule (não reduzir_volume)
npm run qa:sim-workouts -- --week 2 --completions 1 --generate-weekly-insight

# O cue central: correu os fáceis rápido demais → aliviar_ritmo
npm run qa:sim-workouts -- --week 2 --completions 5 --pace 250 --generate-weekly-insight
```

### Outros exemplos

```bash
# Ver o que faria, sem escrever nada
npm run qa:sim-workouts -- --completions 5 --free-runs 1 --dry-run

# Aderência parcial: cumpre 80% da distância prescrita
npm run qa:sim-workouts -- --completions 8 --completion-ratio 0.8

# Atleta mais rápido, com variação maior de pace
npm run qa:sim-workouts -- --completions 6 --pace 280 --jitter 0.1

# Reprodutível (mesma seed = mesmos números)
npm run qa:sim-workouts -- --completions 5 --seed 42

# Com rota GPS sintética (exercita splits/altimetria)
npm run qa:sim-workouts -- --completions 3 --gps
```

## Flags

| Flag | Default | O que faz |
|---|---|---|
| `--env` | `staging` | `local` \| `staging` \| `production` |
| `--completions N` | 5 | Quantos treinos **pendentes** do plano concluir |
| `--week N` | — | Restringe conclusões **e corridas livres** à semana N do plano |
| `--completion-ratio R` | 1.0 | Fração da distância prescrita (0.8 = corre menos) |
| `--free-runs M` | 0 | Quantas corridas livres registrar |
| `--free-run-km K` | 8 | Distância de cada corrida livre |
| `--pace S` | 330 | Pace-base em segundos/km (330 = 5:30/km) |
| `--jitter P` | 0.05 | Variação aleatória de pace (±5%) |
| `--rpe [N]` | — | Anexa RPE. Sem valor = aleatório 1–10; com valor = fixo |
| `--gps` | off | Gera rota GPS sintética |
| `--seed S` | aleatória | Semente, para runs reprodutíveis |
| `--generate-retrospective` | off | Dispara a retrospectiva no fim |
| `--generate-weekly-insight` | off | Dispara o insight da última semana fechada elegível |
| `--dry-run` | off | Imprime o que faria, sem escrever |

## Idempotência

`external_id` é estável por treino (`sim_plan_<workoutId>`), então o `UPSERT` em
`activities` sobrescreve em vez de duplicar. Além disso, o script só seleciona treinos com
`status === 'pending'` — re-rodar pula naturalmente o que já foi concluído.

O prefixo `sim_` deixa óbvio no banco o que é dado fabricado.

## A saída é o oráculo

Ao terminar, o script imprime os valores que a retrospectiva **deve** produzir:

```
  plan_distance_completed_km  esperado:  27.5
  free_run_distance_km        esperado:  8
  total_distance_km           esperado:  35.5
  total_runs_in_period        esperado:  6
  total_workouts_completed    esperado:  5
```

…mais o SQL de conferência já com o `plan_id` preenchido. A validação vira: rodar o
script → comparar com a linha de `plan_retrospectives`.

**O sinal que importa:** `plan_distance_completed_km` **não** pode incluir os km da
corrida livre. Se incluir, o defeito D1 da Fase 1A voltou.

Com `--week`, sai um **oráculo semanal** no lugar, para conferir contra
`plan_week_insights`:

```
  planned_workouts             esperado:  5
  completed_workouts           esperado:  3
  completion_rate              esperado:  60%
  completed_distance_km        esperado:  15   ← SEM os livres
  frequency_actual_days        esperado:  3    ← dias, não treinos
  total_distance_km            esperado:  21   ← COM os livres
  free_run_distance_km         esperado:  6
```

Note `frequency_actual_days`: são **dias distintos**, não contagem de treinos. Dois
treinos no mesmo dia contam 1, porque a meta do onboarding é "quantos dias por semana
você pode treinar".

## Nota sobre GPS

Por padrão as conclusões vão com `route_points: []`. Isso **não** é uma simplificação
desonesta — é a forma real de uma corrida de esteira e de toda importação de
HealthKit/Health Connect sem rota, e o backend trata o caso (`total_distance_meters` é
autoritativo sobre o cálculo por GPS).

Use `--gps` quando precisar exercitar splits ou altimetria, sabendo que isso enfileira o
job de enriquecimento de elevação (Mapbox Terrain-DEM), que faz chamada externa.

## Reuso nas próximas fases

Este harness **não é descartável**. As fases seguintes o chamam com outros parâmetros:

- ~~**Fase 2 (insight semanal)**~~ — **feito**: `--week` + `--generate-weekly-insight`.
- **Fase 4 (mensal/mesociclo)** — volume maior, ~4 semanas de conclusões.
- **Fase 7 (carga interna / sRPE)** — `--rpe` obrigatório, com `--seed` fixa para séries
  de carga reprodutíveis entre execuções.

Ao estender, mantenha a regra: **parâmetros novos, nunca escrita direta no banco.**
