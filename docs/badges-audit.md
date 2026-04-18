# Auditoria do Sistema de Badges — RunEasy V2

**Data:** 2026-04-18  
**Fonte:** `backend/src/modules/gamification/gamification.service.ts` — método `checkBadges()`  
**Tabelas Supabase envolvidas:** `badges`, `user_badges`, `activities`, `workouts`, `users`, `user_levels`

---

## Visão Geral

| Item | Valor |
|------|-------|
| Total de badges implementados | **10** |
| Categorias (types) | 6 |
| XP concedido por badge conquistado | **100 XP** (fixo para todos) |
| Trigger de verificação | Após sincronização de atividade (`checkBadges(userId, activityData)`) |
| Notificações ao conquistar | Push notification + notificação in-app |

---

## Catálogo Completo de Badges

### 1. Primeiro Passo
| Campo | Valor |
|-------|-------|
| **Type** | `milestone` |
| **Tier** | — (definido no DB) |
| **Requisito** | Usuário possui ao menos **1 atividade** registrada |
| **Como é verificado** | `COUNT(*) FROM activities WHERE user_id = ? >= 1` |
| **Dados necessários** | Contagem total de atividades do usuário |
| **Dependência de activityData** | Não — usa contagem do banco |

---

### 2. Maratonista
| Campo | Valor |
|-------|-------|
| **Type** | `milestone` |
| **Tier** | — (definido no DB) |
| **Requisito** | Concluir uma corrida com distância **≥ 21 km** |
| **Como é verificado** | `activityData.distance / 1000 >= 21` |
| **Dados necessários** | `activityData.distance` (em metros) |
| **Dependência de activityData** | Sim — verificado apenas no momento da atividade sincronizada |

---

### 3. Velocista I
| Campo | Valor |
|-------|-------|
| **Type** | `performance` |
| **Tier** | — (definido no DB) |
| **Requisito** | Pace **≤ 5:30/km** em uma corrida de **≥ 5 km** |
| **Como é verificado** | `(1000 / activityData.average_speed) / 60 <= 5.5` e `activityData.distance >= 5000` |
| **Dados necessários** | `activityData.average_speed` (m/s), `activityData.distance` (metros) |
| **Dependência de activityData** | Sim |

---

### 4. Velocista II
| Campo | Valor |
|-------|-------|
| **Type** | `performance` |
| **Tier** | — (definido no DB) |
| **Requisito** | Pace **≤ 5:00/km** em uma corrida de **≥ 5 km** |
| **Como é verificado** | `(1000 / activityData.average_speed) / 60 <= 5.0` e `activityData.distance >= 5000` |
| **Dados necessários** | `activityData.average_speed` (m/s), `activityData.distance` (metros) |
| **Dependência de activityData** | Sim |

---

### 5. Superação
| Campo | Valor |
|-------|-------|
| **Type** | `performance` |
| **Tier** | — (definido no DB) |
| **Requisito** | Melhorar o pace em **≥ 5%** em relação ao melhor pace registrado **há mais de 30 dias** (em corridas ≥ 5 km) |
| **Como é verificado** | Busca a atividade com maior `average_speed` em distâncias ≥ 5000m com `start_date <= now - 30 dias`. Calcula: `((oldPace - newPace) / oldPace) * 100 >= 5` |
| **Dados necessários** | `activityData.average_speed`, histórico de `activities` com `distance >= 5000` e `start_date <= 30 dias atrás` |
| **Dependência de activityData** | Sim + query ao banco |
| **Observação** | Só pode ser conquistado se houver atividades registradas há mais de 30 dias. Novo usuário não pode ganhar. |

---

### 6. Consistente
| Campo | Valor |
|-------|-------|
| **Type** | `consistency` |
| **Tier** | — (definido no DB) |
| **Requisito** | **12 atividades** nos últimos **30 dias** |
| **Como é verificado** | `COUNT(*) FROM activities WHERE user_id = ? AND start_date >= now - 30 dias >= 12` |
| **Dados necessários** | Contagem de atividades nos últimos 30 dias |
| **Dependência de activityData** | Não — usa contagem do banco |

---

### 7. Semana Completa
| Campo | Valor |
|-------|-------|
| **Type** | `consistency` |
| **Tier** | — (definido no DB) |
| **Requisito** | Todos os treinos planejados nos últimos **7 dias** com status `completed`, sendo no mínimo **3 treinos** |
| **Como é verificado** | Busca todos os `workouts` com `scheduled_date >= now - 7 dias`, verifica se `every(w => w.status === 'completed')` e `length >= 3` |
| **Dados necessários** | Tabela `workouts` — campo `status` e `scheduled_date` |
| **Dependência de activityData** | Não — usa dados de `workouts` |
| **Observação** | Depende de o usuário ter um plano de treino ativo com pelo menos 3 treinos na semana. |

---

### 8. Chama Eterna
| Campo | Valor |
|-------|-------|
| **Type** | `streak` |
| **Tier** | — (definido no DB) |
| **Requisito** | Streak ativo de **≥ 30 dias consecutivos** |
| **Como é verificado** | `userStats.current_streak >= 30` |
| **Dados necessários** | `user_levels.current_streak` ou `users.current_streak` |
| **Dependência de activityData** | Não — usa dado do perfil do usuário |
| **Observação** | O streak é atualizado via `updateStreak()` usando fuso horário de São Paulo (UTC-3). |

---

### 9. Na Chuva e no Sol
| Campo | Valor |
|-------|-------|
| **Type** | `exploration` |
| **Tier** | — (definido no DB) |
| **Requisito** | Treinar nos **5 horários distintos** do dia |
| **Como é verificado** | Extrai as horas de `start_date` de todas as atividades do usuário e classifica em zonas: `morning` (5–9h), `late_morning` (9–12h), `noon` (12–15h), `evening` (17–20h), `night` (20h+ ou antes das 5h). Ganha quando `conditions.size >= 5` |
| **Dados necessários** | Todas as atividades do usuário (`start_date`) |
| **Dependência de activityData** | Não — usa histórico completo |
| **⚠️ Observação crítica** | O nome sugere condições climáticas, mas a implementação verifica **horários do dia**. Isso é um workaround documentado no código: *"This would require weather data from activities. For now, we'll check if user has activities in different times of day."* **Comportamento diverge do que o nome do badge sugere.** |

---

### 10. Fiel ao Plano
| Campo | Valor |
|-------|-------|
| **Type** | `adherence` |
| **Tier** | — (definido no DB) |
| **Requisito** | Taxa de **adesão ao plano ≥ 80%** nos últimos **28 dias** (4 semanas) |
| **Como é verificado** | Busca todos os `workouts` com `scheduled_date >= now - 28 dias`. Calcula: `(completedCount / plannedWorkouts.length) * 100 >= 80` |
| **Dados necessários** | Tabela `workouts` — campos `status` e `scheduled_date` |
| **Dependência de activityData** | Não — usa dados de `workouts` |
| **Observação** | Só pode ser conquistado se houver workouts planejados no período. |

---

## Resumo por Categoria (Type)

| Type | Badges | Nomes |
|------|--------|-------|
| `milestone` | 2 | Primeiro Passo, Maratonista |
| `performance` | 3 | Velocista I, Velocista II, Superação |
| `consistency` | 2 | Consistente, Semana Completa |
| `streak` | 1 | Chama Eterna |
| `exploration` | 1 | Na Chuva e no Sol |
| `adherence` | 1 | Fiel ao Plano |
| **Total** | **10** | |

---

## Observações Técnicas Importantes

### Critérios armazenados vs. lógica em código
O campo `criteria` (tipo `Record<string, unknown>`) existe na interface `Badge` e no banco, mas **não é utilizado na verificação**. Toda a lógica de elegibilidade está hardcoded no switch/case do método `checkBadges()` via `badge.name`. Isso significa:
- Adicionar um badge no banco sem ajustar o código **não terá efeito**.
- O campo `criteria` está disponível para evolução futura (poderia externalizar a lógica).

### Campo `tier`
- Existe na interface e no banco.
- Usado apenas para **ordenação** na listagem (`ORDER BY tier ASC`).
- Não impacta lógica de desbloqueio ou XP.

### XP de badge
- Todos os badges concedem **100 XP fixo** ao serem conquistados — sem diferenciação por dificuldade ou tier.

### Verificação de badges já conquistados
- `checkBadges()` faz um early-skip de badges já no set `earnedBadgeIds`. Badges são conquistados **uma única vez** por usuário.

### Momento de verificação
- `checkBadges()` é chamado após sincronização de atividade via Strava ou registro manual.
- Badges que dependem de `activityData` (Maratonista, Velocistas, Superação) **só podem ser conquistados no momento em que a atividade é processada**. Se a atividade for registrada sem os dados corretos, o badge não será concedido retroativamente.

### Problema de consistência: "Semana Completa"
- O período verificado é `scheduled_date >= now - 7 dias`, o que é uma **janela deslizante**, não a semana calendário. Pode gerar comportamento inesperado dependendo do dia em que o treino é concluído.

---

## Gaps Identificados para Evolução Futura

| Gap | Impacto |
|-----|---------|
| Nenhum badge de distância acumulada (ex: 100km totais) | Engajamento de longo prazo |
| Sem badges de nível (ex: "Atingiu nível 10") | Milestone por progressão |
| Velocista I e II não têm Velocista III+ | Progressão de performance truncada |
| Sem badge de consistência mensal (ex: 3 meses seguidos) | Retenção de longo prazo |
| "Na Chuva e no Sol" é enganoso — mede horário, não clima | Problema de UX/comunicação |
| Critérios de badges estão hardcoded por `badge.name` | Fragilidade: renomear badge no DB quebra a lógica |
| Todos os badges valem 100 XP independente da dificuldade | Falta de diferenciação de valor |
