# RunEasy V2 — AI Audit Report

**Data**: 2026-03-29
**Modelos**: Sonnet 4.6 (planos/retrospectiva) + Haiku 4.5 (readiness/feedback)
**SDK**: @anthropic-ai/sdk v0.80.0

---

## Resultados por Feature

### Geração de Plano (Sonnet 4.6)

| Perfil | Prompt | Input Tokens | Output Tokens | Custo USD | Latência |
|--------|--------|-------------|---------------|-----------|----------|
| Iniciante 5K | Prompt 1 | 489 | 1216 | $0.0197 | 16.3s |
| Iniciante 5K | Prompt 2 | 318 | 4611 | $0.0701 | 43.9s |
| Intermediário 10K | Prompt 1 | 493 | 1355 | $0.0218 | 18.2s |
| Intermediário 10K | Prompt 2 | 317 | 10126 | $0.1528 | 104.8s |
| Intermediário Meia | Prompt 1 | 497 | 1466 | $0.0235 | 20.0s |
| Intermediário Meia | Prompt 2 | 317 | 12189 | $0.1838 | 118.4s |
| Avançado Maratona | Prompt 1 | 494 | 1775 | $0.0281 | 24.9s |
| Avançado Maratona | Prompt 2 | 317 | 18334 | $0.2760 | 187.5s |
| Fitness Geral | Prompt 1 | 488 | 1133 | $0.0185 | 14.5s |
| Fitness Geral | Prompt 2 | 318 | 4977 | $0.0756 | 50.9s |

**Médias por plano completo (P1+P2)**: Input: 810 tokens | Output: 11436 tokens | Custo: $0.1740 | Latência: 59.9s

### Readiness (Haiku 4.5)

| Cenário | Input Tokens | Output Tokens | Custo USD | Latência |
|---------|-------------|---------------|-----------|----------|
| Readiness 1 | 206 | 439 | $0.001921 | 4.0s |
| Readiness 2 | 204 | 749 | $0.003159 | 7.3s |
| Readiness 3 | 206 | 411 | $0.001809 | 3.3s |

**Média**: Custo: $0.002296 | Latência: 4.9s

### Feedback (Haiku 4.5)

| Cenário | Input Tokens | Output Tokens | Custo USD | Latência |
|---------|-------------|---------------|-----------|----------|
| Feedback 1 | 249 | 483 | $0.002131 | 3.9s |
| Feedback 2 | 247 | 526 | $0.002302 | 4.3s |
| Feedback 3 | 246 | 695 | $0.002977 | 6.1s |

**Média**: Custo: $0.002470 | Latência: 4.8s

---

## Projeção de Custo Mensal — 1.000 Usuários Ativos

| Feature | Chamadas/Usuário/Mês | Custo por Chamada | Custo Total/Mês |
|---------|---------------------|-------------------|-----------------|
| Plano de Treino (Sonnet 4.6) | 1 | $0.1740 | $173.97 |
| Readiness (Haiku 4.5) | 20 | $0.002296 | $45.93 |
| Feedback (Haiku 4.5) | 15 | $0.002470 | $37.05 |
| **TOTAL** | | | **$256.95** |

### Comparação com Setup Anterior (tudo Sonnet)

| Cenário | Custo Mensal (1K users) |
|---------|----------------------|
| Novo (Sonnet 4.6 + Haiku 4.5) | **$256.95** |
| Antigo (Sonnet 4.5 para tudo) | ~$485.12 |
| **Economia estimada** | **~47%** |

---

## Validação de Qualidade

| Métrica | Resultado |
|---------|-----------|
| Total de chamadas | 16 |
| Chamadas bem-sucedidas | 16 |
| JSON válido em todas | ❌ Não |
| Falhas | 0 |



---

## Custo Total do Stress Test

Total gasto neste teste: **$0.8842**

---

*Gerado automaticamente por `scripts/ai-audit-stress-test.ts`*
