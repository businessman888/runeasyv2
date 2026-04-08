# 🗺️ Fluxo Sequencial de Perguntas do Onboarding — RunEasy

O onboarding é gerenciado pela `OnboardingScreen.tsx` (versão ativa), com **15 steps** (0–14), totalizando **50XP** ao final.

---

## 📊 Visão Geral da Estrutura

```
LoginScreen → Onboarding (15 steps) → PlanLoadingScreen → SmartPlanScreen
```

O header exibe: **barra de progresso** + **percentual** + **badge 50XP**.

---

## 🔢 Mapeamento Step a Step

### Step 0 — Data de Nascimento
- **Arquivo:** `BirthDateScreen.tsx`
- **Título interno:** `"Qual a sua data de nascimento?"`
- **Pergunta exibida na tela:** _"Qual a sua data de nascimento?"_
- **Tipo de Input:** Wheel Picker (modal bottom sheet com três colunas: Dia / Mês / Ano)
- **Detalhes:** Mostra a idade calculada em tempo real enquanto o usuário rola os seletores. Obrigatório.

---

### Step 1 — Peso
- **Arquivo:** `WeightScreen.tsx`
- **Título interno:** `"Qual é o seu peso atual?"`
- **Pergunta exibida na tela:** _"Qual é o seu peso atual?"_
- **Subtítulo:** _"Usamos para calcular suas zonas de esforço e calorias."_
- **Tipo de Input:** Cards de seleção (radio) + campo de texto livre opcional
- **Opções:**
  - 50 kg (faixa: 45–55 kg)
  - 60 kg (faixa: 55–65 kg)
  - 70 kg (faixa: 65–75 kg)
  - 80 kg (faixa: 75–85 kg)
  - 90 kg (faixa: 85–95 kg)
  - 100 kg (faixa: 95+ kg)
- **Extra:** Botão "Inserir peso exato" exibe campo numérico livre. Obrigatório (> 0).

---

### Step 2 — Altura
- **Arquivo:** `HeightScreen.tsx`
- **Título interno:** `"Qual é a sua altura?"`
- **Pergunta exibida na tela:** _"Qual é a sua altura?"_
- **Subtítulo:** _"Arraste a régua ou toque em um valor."_
- **Tipo de Input:** Régua vertical interativa (arrastar) + marcadores clicáveis
- **Detalhes:**
  - Range: 140–210 cm
  - Marcadores clicáveis: 150, 160, 170, 180, 190, 200
  - Avatar animado que escala conforme a altura selecionada
  - Botão "Inserir valor exato" para digitação livre
- **Obrigatório** (> 0).

---

### Step 3 — Objetivo
- **Arquivo:** `ObjectiveScreen.tsx`
- **Título interno:** `"Qual é o seu objetivo?"`
- **Pergunta exibida na tela:** _"Qual é o seu principal objetivo?"_
- **Subtítulo:** _"Vamos personalizar seu treino para sua meta específica."_
- **Tipo de Input:** Cards com ícone SVG + Radio Button (seleção única)
- **Opções:**
  - 🏃 **5K** — "Primeiros passos"
  - 🏃 **10K** — "Resistência"
  - ⏱️ **Meia Maratona** — "21km"
  - 🏆 **Maratona** — "42km – Desafio supremo"
  - ❤️ **Fitness Geral** — "Saúde e bem-estar"
- **Obrigatório.**

---

### Step 4 — Nível de Experiência
- **Arquivo:** `LevelScreen.tsx`
- **Título interno:** `"Qual é o seu nível?"`
- **Pergunta exibida na tela:** _"Qual é o seu nível **atual**?"_
- **Subtítulo:** _"Selecione a opção que melhor descreve seu histórico de treinos. Isso nos ajuda a calibrar a intensidade."_
- **Tipo de Input:** Cards com ícone SVG + Radio Button (seleção única)
- **Opções:**
  - 🚶 **Iniciante** — "0–6 meses de prática"
  - 🏃 **Intermediário** — "6 meses – 2 anos"
  - 🏆 **Avançado** — "Mais de 2 anos"
- **Obrigatório.**

---

### Step 5 — Frequência Semanal
- **Arquivo:** `FrequencyScreen.tsx`
- **Título interno:** `"Quantos dias por semana?"`
- **Pergunta exibida na tela:** _"Quantos dias por semana você pode se comprometer a treinar?"_
- **Tipo de Input:** Slider interativo horizontal (arrastar ou clicar nos números)
- **Detalhes:**
  - Range: **2 a 7 dias/semana**
  - Número selecionado exibido em destaque grande (96px)
  - Dica: _"Nós recomendamos pelo menos 3 dias para resultados consistentes no primeiro mês."_
- **Obrigatório** (≥ 2 e ≤ 7).
- ⚠️ **Este valor define o limite de seleção no Step 6.**

---

### Step 6 — Dias Disponíveis
- **Arquivo:** `AvailableDaysScreen.tsx`
- **Título interno:** `"Quais dias você tem disponíveis?"`
- **Pergunta exibida na tela:** _"Quais dias você pode **treinar**?"_
- **Subtítulo:** _"Selecione X dias para seu treino semanal."_ (X = valor do Step 5)
- **Tipo de Input:** Grid de círculos clicáveis (multi-seleção)
- **Opções:** Dom / Seg / Ter / Qua / Qui / Sex / Sáb
- **Regras:**
  - Limite máximo de seleção = `daysPerWeek` (Step 5)
  - Exibe alerta amarelo se 3+ dias consecutivos selecionados
  - Contador: "X / Y dias selecionados"
- **Obrigatório** (ao menos 1 dia).
- ⚠️ **Os dias selecionados aqui determinam as opções do Step 7.**

---

### Step 7 — Dia de Treino Intenso
- **Arquivo:** `IntenseDayScreen.tsx`
- **Título interno:** `"Qual dia para treino intenso?"`
- **Pergunta exibida na tela:** _"Qual dia você prefere **treinar mais forte**?"_
- **Subtítulo:** _"No treino intenso, você terá sessões mais longas e desafiadoras."_
- **Tipo de Input:** Cards de seleção única (lista filtrada)
- **Detalhes:**
  - Exibe **apenas** os dias selecionados no Step 6
  - Ícone de fogo 🔥 no topo
  - Dica: _"Escolha um dia em que você tenha mais tempo e energia disponível."_
- **Obrigatório.**

---

### Step 8 — Distância Recente
- **Arquivo:** `RecentDistanceScreen.tsx`
- **Título interno:** `"Maior distância recente?"`
- **Pergunta exibida na tela:** _"Qual foi a maior distância **que você correu recentemente**?"_
- **Subtítulo:** _"Isso nos ajuda a calibrar o ponto de partida do seu plano."_
- **Tipo de Input:** Cards com ícone + Radio Button (seleção única)
- **Opções:**
  - 🏃 **3 km** — "Iniciante"
  - 🏃 **5 km** — "Popular"
  - 🏃 **10 km** — "Intermediário"
  - 🏃 **15+ km** — "Avançado"
- **Dica:** _"Não se preocupe se foi há algum tempo. Usamos essa informação como referência inicial."_
- **Obrigatório.**
- ⚠️ **Este valor é usado com o Step 9 para calcular o pace automaticamente.**

---

### Step 9 — Tempo da Distância
- **Arquivo:** `DistanceTimeScreen.tsx`
- **Título interno:** `"Em quanto tempo?"`
- **Pergunta exibida na tela:** _"Em **quanto tempo** você completou essa distância?"_
- **Tipo de Input:** Teclado numérico customizado com três campos
- **Campos:** `HH` (horas) : `MM` (minutos) : `SS` (segundos)
- **Regras:**
  - Auto-avança entre campos ao preencher 2 dígitos
  - Minutos e segundos: máximo 59
  - Ao concluir: pace calculado = `totalMinutos / distanciaKm`
  - Pace é validado: < 2 min/km → clampado para 3.0; > 15 min/km → padrão 7.0
- **Obrigatório** (ao menos H > 0 OU M > 0 OU S > 0).

---

### Step 10 — Confirmação do Pace
- **Arquivo:** `PaceConfirmScreen.tsx`
- **Título interno:** `"Qual é o seu Pace?"`
- **Label do card:** _"Ritmo Médio"_
- **Subtítulo do card:** Exibe o pace pré-calculado nos steps 8+9 em formato `MM:SS min/km`
- **Tipo de Input:** Teclado numérico customizado (MM:SS) + Checkbox
- **Detalhes:**
  - Pace pré-preenchido automaticamente com o valor calculado
  - Usuário pode **ajustar manualmente**
  - Checkbox **"Não sei meu pace atual"** — desabilita os campos e marca `dontKnowPace = true`
- **Obrigatório:** pace preenchido (MM e SS) **OU** checkbox marcado.

---

### Step 11 — Data de Início
- **Arquivo:** `StartDateScreen.tsx`
- **Título interno:** `"Quando quer começar?"`
- **Pergunta exibida na tela:** _"Quando você quer iniciar os **treinamentos**?"_
- **Subtítulo:** _"Escolha a data de início do seu plano de treinamento."_
- **Tipo de Input:** Calendário mensal interativo
- **Detalhes:**
  - Navegação por setas (mês anterior / próximo)
  - Dias passados desabilitados e exibidos em cinza
  - "Hoje" destacado em ciano
  - Data selecionada com borda ciano arredondada
- **Obrigatório.**

---

### Step 12 — Limitações Físicas
- **Arquivo:** `LimitationsScreen.tsx`
- **Título interno:** `"Alguma limitação física?"`
- **Pergunta exibida na tela:** _"Você possui alguma **lesão ou limitação**?"_
- **Subtítulo:** _"Lesões anteriores, problemas de saúde ou restrições físicas."_
- **Tipo de Input:** Cards Sim / Não (seleção única)
- **Opções:**
  - **Não** — "Não possuo limitações físicas"
  - **Sim** — "Tenho uma lesão ou limitação física"
- **Se Sim:** aparece campo de texto descritivo com animação fade-in
  - Placeholder: _"Ex: dor no joelho direito, tendinite no tornozelo..."_
  - Dica: _"Esta informação ajuda a IA a criar um plano mais seguro para você"_
- **Obrigatório** (escolher Sim ou Não).

---

### Step 13 — Prazo da Meta
- **Arquivo:** `GoalTimeframeScreen.tsx`
- **Título interno:** `"Quando deseja atingir sua meta?"`
- **Pergunta exibida na tela:** _"Quando deseja **atingir sua meta**?"_
- **Subtítulo:** _"Escolha o prazo para alcançar seu objetivo. Isso determina a intensidade da progressão."_
- **Tipo de Input:** Cards com ícone de calendário + Radio Button (seleção única)
- **Opções:**
  - 📅 **1 mês** — "Objetivo de curto prazo"
  - 📅 **3 meses** — "Tempo ideal para iniciantes" ⭐ **(Recomendado)**
  - 📅 **6 meses** — "Planejamento moderado"
  - 📅 **12 meses** — "Objetivo de longo prazo"
- **Dica:** _"Prazos muito curtos podem ser desafiadores. Recomendamos pelo menos 3 meses para resultados sustentáveis."_
- **Obrigatório.**

---

### Step 14 — Conexão de Dispositivo (Wearable)
- **Arquivo:** `WearableConnectionScreen.tsx`
- **Título interno:** `"Conectar dispositivo"`
- **Pergunta exibida na tela:** _"Conectar seu dispositivo **de corrida**."_
- **Subtítulo:** _"Sincronize seu dispositivo Garmin, Polar, Fitbit, Apple Watch para melhorarmos ainda mais a sua experiência."_
- **Tipo de Input:** Dois botões de ação (sem navegação padrão Voltar/Continuar)
- **Ações:**
  - 🔵 **"Continuar"** → abre modal de seleção de dispositivo (Garmin, Polar, Fitbit, Apple Watch)
  - ⚫ **"Não obrigado"** → pula a etapa sem selecionar nada
- **⚠️ Step OPCIONAL** — sempre permite avançar, seja conectando ou pulando.

---

## ⚙️ Lógica de Dependências entre Steps

```
Step 5 (Frequência)
    └──► define o limite máximo de seleção no Step 6 (Dias Disponíveis)

Step 6 (Dias Disponíveis)
    └──► filtra as opções exibidas no Step 7 (Dia de Treino Intenso)

Step 8 (Distância Recente) + Step 9 (Tempo da Distância)
    └──► calculam automaticamente o pace (min/km)
         └──► pré-preenchem os campos do Step 10 (Confirmação do Pace)
```

---

## 🔄 Fluxo Pós-Quiz

```
Step 14 (Wearable) — Continuar / Não obrigado
    │
    ▼
PlanLoadingScreen
    ├── Animação Lottie (corredor)
    ├── Mensagens rotativas a cada 3 segundos:
    │       "Analisando seu perfil de corredor"
    │       "Computando suas respostas"
    │       "Montando seu cronograma de treino"
    └── Barra de progresso animada (0% → 70% → 100%)
    │
    ▼
SmartPlanScreen (plano gerado pela IA)
```

Se o usuário não estiver autenticado ao chegar no `PlanLoadingScreen`, ele é redirecionado para `LoginScreen` com a mensagem:
> _"Faça login para gerar seu plano de treino personalizado."_

---

## 📋 Dados Coletados e Armazenados no `onboardingStore`

| Campo no Store | Step | Tipo | Descrição |
|---|---|---|---|
| `birthDate` | 0 | `{ day, month, year }` | Data de nascimento |
| `weight` | 1 | `number` | Peso em kg |
| `height` | 2 | `number` | Altura em cm |
| `goal` | 3 | `string` | `5k` / `10k` / `half_marathon` / `marathon` / `general_fitness` |
| `experience_level` | 4 | `string` | `beginner` / `intermediate` / `advanced` |
| `daysPerWeek` | 5 | `number` | Dias de treino por semana (2–7) |
| `availableDays` | 6 | `number[]` | Índices dos dias (0=Dom ... 6=Sáb) |
| `intenseDayIndex` | 7 | `number` | Índice do dia de treino intenso |
| `recentDistance` | 8 | `number` | Distância em km (3, 5, 10, 15) |
| `distanceTime` | 9 | `{ hours, minutes, seconds }` | Tempo para completar a distância |
| `calculatedPace` | *auto* | `number` | Pace calculado em min/km |
| `paceMinutes` | 10 | `string` | Minutos do pace (MM) |
| `paceSeconds` | 10 | `string` | Segundos do pace (SS) |
| `dontKnowPace` | 10 | `boolean` | Usuário não sabe o pace |
| `startDate` | 11 | `string` | Data ISO (YYYY-MM-DD) |
| `limitations` | 12 | `{ hasLimitation: boolean, details: string }` | Limitação física |
| `goalTimeframe` | 13 | `number` | Prazo em meses (1, 3, 6, 12) |
| `preferredWearable` | 14 | `string \| null` | Provider do dispositivo ou null |

---

## 📌 Observação sobre Versões

Existem **dois arquivos** de onboarding no projeto:

| Arquivo | Steps | Status |
|---|---|---|
| `OnboardingScreen.tsx` | 15 steps (0–14) | ✅ **Versão ativa** |
| `QuizOnboardingScreen.tsx` | 14 steps | ⚠️ Versão legada (ordem diferente) |

A principal diferença é que na versão legada o step de "Pace" aparece **antes** da distância (posição 8), enquanto na versão ativa o fluxo é: Distância (8) → Tempo (9) → Pace Calculado/Confirmado (10), que é a ordem lógica correta.
