# Plano de Implementação — Sistema de Badges V2

**Data:** 2026-04-18  
**Objetivo:** Reparar os pontos críticos auditados, expandir o catálogo de badges e implementar o novo sistema visual de brasões coloridos.

---

## Resumo do Escopo

| Área | O que muda |
|------|-----------|
| Backend — Arquitetura | Lógica de badges sai do hardcode e passa para sistema orientado a `criteria` |
| Backend — XP | XP diferenciado por tier (não mais 100 fixo) |
| Backend — Novos badges | Catálogo cresce de **10 → 28 badges** |
| Mobile — Visual | Novo componente `BadgeShield` com brasão colorido por tipo/tier |
| Mobile — Screen | `BadgesScreen` atualizada com agrupamento por categoria |

---

## Fase 1 — Backend: Refactor Arquitetural

### 1.1 — Eliminar hardcode por `badge.name`

**Problema atual:** `checkBadges()` usa `switch(badge.type)` + `if(badge.name === '...')` — renomear um badge no banco quebra a lógica silenciosamente.

**Solução:** Adicionar coluna `slug` (identificador estável) na tabela `badges` e usar `badge.slug` no código. O `name` pode ser editado livremente no banco sem quebrar nada.

**Migration SQL:**
```sql
-- Migration: add_badge_slug
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 100;

-- Preencher slugs dos badges existentes
UPDATE public.badges SET slug = 'primeiro_passo',   xp_reward = 50  WHERE name = 'Primeiro Passo';
UPDATE public.badges SET slug = 'maratonista',       xp_reward = 150 WHERE name = 'Maratonista';
UPDATE public.badges SET slug = 'velocista_i',       xp_reward = 100 WHERE name = 'Velocista I';
UPDATE public.badges SET slug = 'velocista_ii',      xp_reward = 150 WHERE name = 'Velocista II';
UPDATE public.badges SET slug = 'superacao',         xp_reward = 150 WHERE name = 'Superação';
UPDATE public.badges SET slug = 'consistente',       xp_reward = 120 WHERE name = 'Consistente';
UPDATE public.badges SET slug = 'semana_completa',   xp_reward = 80  WHERE name = 'Semana Completa';
UPDATE public.badges SET slug = 'chama_eterna',      xp_reward = 200 WHERE name = 'Chama Eterna';
UPDATE public.badges SET slug = 'na_chuva_e_no_sol', xp_reward = 100 WHERE name = 'Na Chuva e no Sol';
UPDATE public.badges SET slug = 'fiel_ao_plano',     xp_reward = 150 WHERE name = 'Fiel ao Plano';

-- Tornar slug NOT NULL após backfill
ALTER TABLE public.badges ALTER COLUMN slug SET NOT NULL;
```

**Mudança no service:**
```typescript
// ANTES (frágil)
if (badge.name === 'Primeiro Passo') { ... }

// DEPOIS (estável)
if (badge.slug === 'primeiro_passo') { ... }
```

---

### 1.2 — XP diferenciado por tier/dificuldade

**Problema atual:** Todos os 10 badges valem 100 XP. Conquistar "Primeiro Passo" (1 treino) vale tanto quanto "Chama Eterna" (30 dias seguidos).

**Solução:** Ler `badge.xp_reward` da tabela (coluna adicionada na migration acima) e usar no `addPoints()`.

```typescript
// gamification.service.ts — dentro de checkBadges()
if (earned) {
  await this.addPoints(userId, badge.xp_reward, `Badge: ${badge.name}`, 'badge', badge.id);
  // ... notificações
}
```

**Tabela de XP por tier:**
| Tier | Dificuldade | XP |
|------|-------------|-----|
| 1 | Iniciante | 50 |
| 2 | Intermediário | 100 |
| 3 | Avançado | 150 |
| 4 | Elite | 200 |
| 5 | Lendário | 300 |

---

### 1.3 — Corrigir "Na Chuva e no Sol"

**Problema atual:** Nome diz "clima", código verifica "horário do dia". Duas opções:

**Opção A (recomendada — sem dados climáticos):** Renomear o badge para algo honesto.
- Novo name: **"Coruja e Cotovia"**
- Nova descrição: *"Treinou em todos os 5 períodos do dia: madrugada, manhã, tarde, fim de tarde e noite."*
- Slug permanece `na_chuva_e_no_sol` para não quebrar registros existentes em `user_badges`.

**Opção B (futura):** Quando Strava passar `weather_condition` na atividade, criar lógica real de clima.

---

## Fase 2 — Backend: Novos Badges

### 2.1 — Catálogo expandido (18 novos badges)

#### Categoria: `milestone` — Distância Acumulada

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `cinquenta_km` | Cinquenta | 50 km acumulados (soma de todas as atividades) | 100 |
| `centuriao` | Centurião | 100 km acumulados | 150 |
| `quinhentos_km` | Meio Milhar | 500 km acumulados | 200 |
| `mil_km` | Milha de Ouro | 1.000 km acumulados | 300 |
| `maratona_completa` | Maratonista Completo | Corrida única ≥ 42,195 km | 200 |

**Lógica de verificação:**
```typescript
// Para distância acumulada — query adicional necessária
const { data: distanceSum } = await this.supabaseService
  .from('activities')
  .select('distance')
  .eq('user_id', userId);

const totalKm = (distanceSum || []).reduce((acc, a) => acc + (a.distance / 1000), 0);
```

---

#### Categoria: `performance` — Pace

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `velocista_iii` | Velocista III | Pace ≤ 4:30/km em corrida ≥ 5 km | 200 |
| `velocista_iv` | Velocista IV | Pace ≤ 4:00/km em corrida ≥ 5 km | 250 |
| `foguete` | Foguete | Pace ≤ 3:30/km em qualquer distância | 300 |

---

#### Categoria: `performance` — Tempo de Corrida

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `uma_hora` | Hora da Verdade | Corrida única com duração ≥ 60 min | 100 |
| `duas_horas` | Dois Tempos | Corrida única com duração ≥ 120 min | 200 |

**Nota:** Requer campo `elapsed_time` ou `moving_time` de `activityData` (disponível no webhook Strava).

---

#### Categoria: `milestone` — Elevação

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `subidor` | Subidor | Corrida única com ≥ 500 m de elevação | 150 |
| `alpinista` | Alpinista | 5.000 m de elevação acumulada (total) | 300 |

---

#### Categoria: `streak` — Progressão de Sequência

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `ignicao` | Ignição | Streak ≥ 7 dias | 80 |
| `chama_viva` | Chama Viva | Streak ≥ 14 dias | 120 |
| `imortal` | Imortal | Streak ≥ 60 dias | 250 |

---

#### Categoria: `exploration` — Hábitos

| Slug | Nome | Requisito | XP |
|------|------|-----------|-----|
| `madrugador` | Madrugador | 5 corridas iniciadas entre 05h–07h | 100 |
| `noturno` | Corredor Noturno | 5 corridas iniciadas após 20h | 100 |
| `diversificado` | Diversificado | Treinar em todos os 7 dias da semana (ao longo do histórico) | 150 |

---

### 2.2 — Migration SQL: seed dos novos badges

```sql
-- Migration: add_new_badges_v2
INSERT INTO public.badges (name, slug, description, icon, type, tier, xp_reward, criteria) VALUES
-- Milestone: distância acumulada
('Cinquenta', 'cinquenta_km',
  'Acumulou 50 km de corrida no total.',
  'shield_blue_1', 'milestone', 2, 100,
  '{"type": "total_distance_km", "threshold": 50}'),

('Centurião', 'centuriao',
  'Acumulou 100 km de corrida no total.',
  'shield_blue_2', 'milestone', 3, 150,
  '{"type": "total_distance_km", "threshold": 100}'),

('Meio Milhar', 'quinhentos_km',
  'Acumulou 500 km de corrida no total.',
  'shield_blue_3', 'milestone', 4, 200,
  '{"type": "total_distance_km", "threshold": 500}'),

('Milha de Ouro', 'mil_km',
  'Acumulou 1.000 km de corrida no total.',
  'shield_gold_5', 'milestone', 5, 300,
  '{"type": "total_distance_km", "threshold": 1000}'),

('Maratonista Completo', 'maratona_completa',
  'Completou uma corrida de maratona (42,195 km).',
  'shield_orange_4', 'milestone', 4, 200,
  '{"type": "single_distance_km", "threshold": 42.195}'),

-- Performance: pace
('Velocista III', 'velocista_iii',
  'Correu 5 km+ com pace abaixo de 4:30/km.',
  'shield_red_3', 'performance', 3, 200,
  '{"type": "pace_on_distance", "max_pace_min_km": 4.5, "min_distance_km": 5}'),

('Velocista IV', 'velocista_iv',
  'Correu 5 km+ com pace abaixo de 4:00/km.',
  'shield_red_4', 'performance', 4, 250,
  '{"type": "pace_on_distance", "max_pace_min_km": 4.0, "min_distance_km": 5}'),

('Foguete', 'foguete',
  'Manteve pace abaixo de 3:30/km em uma corrida.',
  'shield_red_5', 'performance', 5, 300,
  '{"type": "pace_on_distance", "max_pace_min_km": 3.5, "min_distance_km": 1}'),

-- Performance: tempo
('Hora da Verdade', 'uma_hora',
  'Completou uma corrida de pelo menos 1 hora.',
  'shield_purple_2', 'performance', 2, 100,
  '{"type": "single_duration_min", "threshold": 60}'),

('Dois Tempos', 'duas_horas',
  'Completou uma corrida de pelo menos 2 horas.',
  'shield_purple_3', 'performance', 3, 200,
  '{"type": "single_duration_min", "threshold": 120}'),

-- Milestone: elevação
('Subidor', 'subidor',
  'Completou uma corrida com 500 m ou mais de elevação.',
  'shield_teal_3', 'milestone', 3, 150,
  '{"type": "single_elevation_m", "threshold": 500}'),

('Alpinista', 'alpinista',
  'Acumulou 5.000 m de elevação no histórico total.',
  'shield_teal_5', 'milestone', 5, 300,
  '{"type": "total_elevation_m", "threshold": 5000}'),

-- Streak: progressão
('Ignição', 'ignicao',
  'Manteve uma sequência de 7 dias de treino.',
  'shield_amber_1', 'streak', 1, 80,
  '{"type": "current_streak", "threshold": 7}'),

('Chama Viva', 'chama_viva',
  'Manteve uma sequência de 14 dias de treino.',
  'shield_amber_2', 'streak', 2, 120,
  '{"type": "current_streak", "threshold": 14}'),

('Imortal', 'imortal',
  'Manteve uma sequência de 60 dias de treino.',
  'shield_amber_5', 'streak', 5, 250,
  '{"type": "current_streak", "threshold": 60}'),

-- Exploration: hábitos
('Madrugador', 'madrugador',
  'Completou 5 corridas entre 05h e 07h da manhã.',
  'shield_indigo_2', 'exploration', 2, 100,
  '{"type": "runs_in_time_window", "hour_from": 5, "hour_to": 7, "threshold": 5}'),

('Corredor Noturno', 'noturno',
  'Completou 5 corridas após as 20h.',
  'shield_indigo_2', 'exploration', 2, 100,
  '{"type": "runs_in_time_window", "hour_from": 20, "hour_to": 24, "threshold": 5}'),

('Diversificado', 'diversificado',
  'Treinou em todos os 7 dias da semana ao longo do histórico.',
  'shield_indigo_3', 'exploration', 3, 150,
  '{"type": "all_weekdays_covered", "threshold": 7}');
```

---

### 2.3 — Refactor de `checkBadges()` no service

A função deve ser refatorada para um mapa de handlers por slug, eliminando o switch gigante:

```typescript
// gamification.service.ts

private readonly badgeCheckers: Record<string, BadgeChecker> = {
  primeiro_passo:    this.check_primeiro_passo.bind(this),
  maratonista:       this.check_single_distance(21),
  maratona_completa: this.check_single_distance(42.195),
  cinquenta_km:      this.check_total_distance(50),
  centuriao:         this.check_total_distance(100),
  quinhentos_km:     this.check_total_distance(500),
  mil_km:            this.check_total_distance(1000),
  velocista_i:       this.check_pace_on_distance(5.5, 5),
  velocista_ii:      this.check_pace_on_distance(5.0, 5),
  velocista_iii:     this.check_pace_on_distance(4.5, 5),
  velocista_iv:      this.check_pace_on_distance(4.0, 5),
  foguete:           this.check_pace_on_distance(3.5, 1),
  superacao:         this.check_superacao.bind(this),
  uma_hora:          this.check_single_duration(60),
  duas_horas:        this.check_single_duration(120),
  consistente:       this.check_activity_count_in_days(12, 30),
  semana_completa:   this.check_semana_completa.bind(this),
  ignicao:           this.check_streak(7),
  chama_viva:        this.check_streak(14),
  chama_eterna:      this.check_streak(30),
  imortal:           this.check_streak(60),
  subidor:           this.check_single_elevation(500),
  alpinista:         this.check_total_elevation(5000),
  madrugador:        this.check_runs_in_window(5, 7, 5),
  noturno:           this.check_runs_in_window(20, 24, 5),
  diversificado:     this.check_all_weekdays.bind(this),
  na_chuva_e_no_sol: this.check_all_time_periods.bind(this),
  fiel_ao_plano:     this.check_fidelidade_plano.bind(this),
};
```

Cada checker recebe `(userId: string, activityData?: ActivityData)` e retorna `Promise<boolean>`.

---

## Fase 3 — Mobile: Sistema Visual de Brasões

### 3.1 — Design System dos Brasões

Baseado no Figma (`node 983:709`):
- Tamanho base: **30×30 px** (ícone de lista), **80×80 px** (tela de detalhe)
- Shape: escudo SVG (`badgeSymbol.svg`) com fill colorido
- Label/ícone: texto com gradiente metálico `linear-gradient(180deg, #EBEBF5 0%, #89898F 100%)`
- Cor do escudo varia por `type` + `tier`

**Mapeamento de cores por tipo:**

```typescript
// mobile/src/constants/badgeColors.ts

export const BADGE_TYPE_COLORS: Record<string, string[]> = {
  // milestone — Azul royal (progressão de lightness por tier)
  milestone:    ['#4A7FC1', '#3A6DB5', '#2A5AA8', '#1A4799', '#0A3485'],

  // performance — Vermelho/laranja (velocidade, intensidade)
  performance:  ['#E07B54', '#D4633A', '#C84B22', '#BC3310', '#B01B00'],

  // consistency — Verde (constância, crescimento)
  consistency:  ['#4CAF7A', '#3A9E68', '#288D56', '#167C44', '#046B32'],

  // streak — Âmbar/fogo (sequência, calor)
  streak:       ['#F5A623', '#E8921A', '#DB7E11', '#CE6A08', '#C15600'],

  // exploration — Índigo (descoberta, variedade)
  exploration:  ['#7B68EE', '#6A55E0', '#5942D2', '#482FC4', '#371CB6'],

  // adherence — Esmeralda (comprometimento, disciplina)
  adherence:    ['#2DC6B4', '#1FB5A3', '#11A492', '#039381', '#008270'],
};

export const BADGE_TIER_OVERLAY: Record<number, string> = {
  1: 'CD7F32', // bronze
  2: 'C0C0C0', // prata
  3: 'FFD700', // ouro
  4: 'E5E4E2', // platina
  5: 'B9F2FF', // diamante (brilho cristalino)
};
```

---

### 3.2 — Componente `BadgeShield`

**Arquivo:** `mobile/src/components/ui/BadgeShield.tsx`

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Mask, Rect, G } from 'react-native-svg';
import { BADGE_TYPE_COLORS } from '../../constants/badgeColors';

interface BadgeShieldProps {
  type: string;
  tier: number;
  label: string;           // Ex: "3k", "🔥", "⚡"
  size?: number;           // default 40
  earned?: boolean;
}

export const BadgeShield = ({ type, tier, label, size = 40, earned = false }: BadgeShieldProps) => {
  const colors = BADGE_TYPE_COLORS[type] ?? BADGE_TYPE_COLORS['milestone'];
  const fillColor = colors[Math.min(tier - 1, colors.length - 1)];
  const opacity = earned ? 1 : 0.35; // não conquistado = dessaturado

  const scale = size / 100; // SVG original é 100x100

  return (
    <View style={{ width: size, height: size, opacity }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="textGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#EBEBF5" />
            <Stop offset="100%" stopColor="#89898F" />
          </LinearGradient>
          <Mask id="shieldMask">
            <Path
              d="M12.5 17.2L50.0188 6.25L87.5 17.2V39.6542C87.4985 51.1616 83.8768 62.3769 77.1476 71.7117C70.4185 81.0465 60.9231 88.0278 50.0062 91.6667C39.0853 88.0293 29.586 81.0475 22.8544 71.7103C16.1227 62.3732 12.5002 51.1545 12.5 39.6438V17.2Z"
              fill="white"
            />
          </Mask>
        </Defs>

        {/* Shield background */}
        <G mask="url(#shieldMask)">
          <Rect width="100" height="100" fill={fillColor} />
        </G>

        {/* Shield border */}
        <Path
          d="M12.5 17.2L50.0188 6.25L87.5 17.2V39.6542C87.4985 51.1616 83.8768 62.3769 77.1476 71.7117C70.4185 81.0465 60.9231 88.0278 50.0062 91.6667C39.0853 88.0293 29.586 81.0475 22.8544 71.7103C16.1227 62.3732 12.5002 51.1545 12.5 39.6438V17.2Z"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="2"
        />

        {/* Label text — metallic gradient */}
        <Text
          x="50"
          y="56"
          textAnchor="middle"
          fill="url(#textGrad)"
          fontSize={size > 60 ? 28 : 18}
          fontWeight="700"
          fontFamily="Inter"
        >
          {label}
        </Text>
      </Svg>
    </View>
  );
};
```

---

### 3.3 — Mapeamento de labels por badge

```typescript
// mobile/src/constants/badgeLabels.ts

export const BADGE_LABELS: Record<string, string> = {
  // Milestone
  primeiro_passo:    '1°',
  maratonista:       '21k',
  maratona_completa: '42k',
  cinquenta_km:      '50k',
  centuriao:         '100k',
  quinhentos_km:     '500k',
  mil_km:            '1M',
  subidor:           '⛰',
  alpinista:         '🏔',

  // Performance
  velocista_i:       '5:30',
  velocista_ii:      '5:00',
  velocista_iii:     '4:30',
  velocista_iv:      '4:00',
  foguete:           '⚡',
  superacao:         '↑5%',
  uma_hora:          '1h',
  duas_horas:        '2h',

  // Consistency
  consistente:       '12x',
  semana_completa:   '7d',

  // Streak
  ignicao:           '7🔥',
  chama_viva:        '14🔥',
  chama_eterna:      '30🔥',
  imortal:           '60🔥',

  // Exploration
  na_chuva_e_no_sol: '☀',
  madrugador:        '🌅',
  noturno:           '🌙',
  diversificado:     '7',

  // Adherence
  fiel_ao_plano:     '80%',
};
```

---

### 3.4 — Atualização da `BadgesScreen`

**Arquivo:** `mobile/src/screens/BadgesScreen.tsx` (ou path atual)

- Agrupar badges por `type` com cabeçalho de seção
- Mostrar contagem `X / Y conquistados` por categoria
- Grid 4 colunas para ícones pequenos (40px)
- Tap no badge abre modal de detalhe com escudo 80px + nome + descrição + data de conquista (se earned)
- Badges não conquistados aparecem com `opacity: 0.35` + lock icon sobreposto

**Estrutura visual:**
```
┌─────────────────────────────────────────┐
│  🏆 Badges                 8 / 28       │
├─────────────────────────────────────────┤
│  DISTÂNCIA & MARCOS              2 / 7  │
│  [🛡] [🛡] [🛡🔒] [🛡🔒]              │
│                                         │
│  VELOCIDADE                      1 / 5  │
│  [🛡] [🛡🔒] [🛡🔒] [🛡🔒]           │
│                                         │
│  CONSISTÊNCIA                    2 / 2  │
│  [🛡] [🛡]                              │
│  ...                                    │
└─────────────────────────────────────────┘
```

---

## Fase 4 — Ordem de Execução

```
Sprint 1 (Backend — Foundations)
  ├── [ ] Migration: add_badge_slug + xp_reward
  ├── [ ] Update gamification.service.ts → usar badge.slug
  ├── [ ] Implementar XP por badge.xp_reward
  ├── [ ] Renomear "Na Chuva e no Sol" → "Coruja e Cotovia"
  └── [ ] Testes: gamification.service.spec.ts atualizado

Sprint 2 (Backend — Novos badges)
  ├── [ ] Migration: add_new_badges_v2 (seed 18 badges)
  ├── [ ] Refactor checkBadges() para sistema de handlers por slug
  ├── [ ] Implementar checkers de distância acumulada
  ├── [ ] Implementar checkers de tempo de corrida
  ├── [ ] Implementar checkers de elevação
  ├── [ ] Implementar checkers de streak progressivo
  └── [ ] Implementar checkers de hábitos (madrugador, noturno, diversificado)

Sprint 3 (Mobile — Visual)
  ├── [ ] Criar badgeColors.ts e badgeLabels.ts
  ├── [ ] Implementar componente BadgeShield.tsx
  ├── [ ] Atualizar BadgesScreen com agrupamento por tipo
  ├── [ ] Implementar modal de detalhe do badge
  └── [ ] Testar em iPhone SE e Pro Max
```

---

## Catálogo Final: 28 Badges

| # | Nome | Type | Tier | XP |
|---|------|------|------|----|
| 1 | Primeiro Passo | milestone | 1 | 50 |
| 2 | Maratonista | milestone | 3 | 150 |
| 3 | Maratonista Completo | milestone | 4 | 200 |
| 4 | Cinquenta | milestone | 2 | 100 |
| 5 | Centurião | milestone | 3 | 150 |
| 6 | Meio Milhar | milestone | 4 | 200 |
| 7 | Milha de Ouro | milestone | 5 | 300 |
| 8 | Subidor | milestone | 3 | 150 |
| 9 | Alpinista | milestone | 5 | 300 |
| 10 | Velocista I | performance | 2 | 100 |
| 11 | Velocista II | performance | 3 | 150 |
| 12 | Velocista III | performance | 3 | 200 |
| 13 | Velocista IV | performance | 4 | 250 |
| 14 | Foguete | performance | 5 | 300 |
| 15 | Superação | performance | 3 | 150 |
| 16 | Hora da Verdade | performance | 2 | 100 |
| 17 | Dois Tempos | performance | 3 | 200 |
| 18 | Consistente | consistency | 2 | 120 |
| 19 | Semana Completa | consistency | 1 | 80 |
| 20 | Ignição | streak | 1 | 80 |
| 21 | Chama Viva | streak | 2 | 120 |
| 22 | Chama Eterna | streak | 4 | 200 |
| 23 | Imortal | streak | 5 | 250 |
| 24 | Coruja e Cotovia | exploration | 2 | 100 |
| 25 | Madrugador | exploration | 2 | 100 |
| 26 | Corredor Noturno | exploration | 2 | 100 |
| 27 | Diversificado | exploration | 3 | 150 |
| 28 | Fiel ao Plano | adherence | 3 | 150 |

**XP total disponível:** 4.230 XP
