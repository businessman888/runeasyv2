# RunEasy V2 — AI Cost Audit (dados reais)

**Gerado**: 2026-06-18T21:13:59.797Z
**Projeto**: gcaozgnevvmnlxnkfthh (staging)
**Fonte**: tabela `ai_usage_logs` (custo real registrado pelo backend)
**Janela**: 2026-06-18T20:55:05.781882+00:00 → 2026-06-18T21:11:56.517653+00:00
**Filtro**: user=todos | linhas analisadas: 5

> Diferente de `ai-audit-stress-test.ts` (prompts simulados direto na Anthropic),
> este relatório reflete o **custo real da geração atual** (prompt único) por usuário.

---

## Custo por Feature

| Feature | Chamadas | Input Tokens | Output Tokens | Custo USD | Latência média | Falhas |
|---------|----------|--------------|---------------|-----------|----------------|--------|
| plan_generation_legacy | 3 | 1755 | 15119 | $0.247534 | 60.1s | 0 |
| feedback | 1 | 699 | 686 | $0.003303 | 6.0s | 0 |
| readiness | 1 | 1114 | 480 | $0.002811 | 3.7s | 0 |

**Custo total no período**: $0.2536 · **Usuários distintos**: 1

---

## Custo por Usuário (top 50 por custo)

| user_id | Chamadas | Plano | Readiness | Feedback | Retrospectiva | Total |
|---------|----------|-------|-----------|----------|---------------|-------|
| (null) | 3 | $0.247534 | $0.000000 | $0.000000 | $0.000000 | **$0.247534** |
| fac0acbd-8ec4-449c-827b-094c12012ca3 | 2 | $0.000000 | $0.002811 | $0.003303 | $0.000000 | **$0.006114** |

---

## Médias por usuário (entre quem usou cada feature)

| Categoria | Usuários que usaram | Custo médio/usuário |
|-----------|---------------------|---------------------|
| Plano | 1 | $0.2475 |
| Readiness | 1 | $0.0028 |
| Feedback | 1 | $0.0033 |
| Retrospectiva | 0 | $0.0000 |

---

## Projeção Mensal — 1000 Usuários Ativos

Premissas: 1 plano/usuário, 20 readiness/usuário, 15 feedback/usuário por mês.
Custo por chamada derivado da média real observada acima.

| Feature | Custo/chamada (real) | Chamadas/usuário/mês | Custo Total/Mês |
|---------|----------------------|----------------------|-----------------|
| Plano de Treino | $0.0825 | 1 | $82.51 |
| Readiness | $0.002811 | 20 | $56.22 |
| Feedback | $0.003303 | 15 | $49.55 |
| **TOTAL** | | | **$188.28** |

---

*Gerado por `scripts/ai-cost-audit.ts` — fonte: `ai_usage_logs` (gcaozgnevvmnlxnkfthh).*
