# Auditoria de UI/UX — Onboarding RunEasy V2

> Escopo: fluxo de quiz do onboarding (`mobile/src/screens/OnboardingScreen.tsx` + `mobile/src/screens/quiz/*`).
> Data: 2026-06-06 · Skills aplicadas: frontend-mobile, ux-ui-figma, coconote-onboarding-audit, performance, aso-seo.

---

## 0. Sumário executivo

O onboarding tem boa **fundação** (gradiente premium, barra de progresso animada, XP gamificado, pulse no `OptionCard`, fade entre steps, intersticiais com gráfico animado). O problema **não é falta de recurso — é falta de padronização**. Cada tela foi construída isoladamente, com seu próprio bloco de cores, tipografia hardcoded, tipo/tamanho de bullet e espaçamento. O resultado é uma sensação de "telas de apps diferentes coladas".

**Top 5 oportunidades (maior impacto):**
1. **Sistema único de opção** (`SelectableOption`) — elimina de uma vez bullets divergentes, espaçamento e ícones inconsistentes. *(seus pontos 1, 2, 3)*
2. **Tokens de tipografia/título compartilhados** (`QuizHeader`) — hoje há títulos de 20/24/28/30 px em 4 famílias de fonte diferentes. *(seu ponto: padronização de título/tipografia)*
3. **Corrigir o bug da meta** na `GoalAchievableScreen` — no caminho "prova" ela ignora a distância da corrida e cai no fallback de 10 km. *(seu ponto 5)*
4. **Corrigir copy/valores absurdos + animação** na `TimeCompareScreen` — hoje mostra "5× mais rápido" embaixo de um título que diz "metade do tempo". *(seu ponto 6)*
5. **Biblioteca de ícones unificada (Ionicons)** — o padrão correto já existe em uma tela (`GoalTypeScreen`); falta propagar. *(seu ponto 3)*

**Dívida técnica achada de quebra:** existem **dois orquestradores** de onboarding — `OnboardingScreen.tsx` (ATIVO, registrado no `AppNavigator`) e `QuizOnboardingScreen.tsx` (LEGADO, 14 steps, não registrado em lugar nenhum). O legado deve ser removido para não confundir manutenção.

---

## 1. Mapa do fluxo atual (ativo)

Orquestrador real: [OnboardingScreen.tsx](runeasyv2/mobile/src/screens/OnboardingScreen.tsx) — passos calculados dinamicamente conforme `goal_type` (distância vs prova).

| # | Step (key) | Arquivo | Tipo | Bullet | Espaço entre opções | Fonte do título |
|---|---|---|---|---|---|---|
| 1 | birthDate | BirthDateScreen | input | — | — | — |
| 2 | weight | WeightScreen | opções + input | ✓ checkbox 24, **esq.** | **10px** | hardcoded 24 |
| 3 | height | HeightScreen | régua + input | — | — | hardcoded 24 |
| 4 | goal_type | GoalTypeScreen | opção única | ◉ radio 30, dir. | **24px** (gap+margin) | theme 3xl (30) |
| 5 | goal | ObjectiveScreen | opção única | ◉ radio 30, dir. | **24px** (gap+margin) | theme 3xl (30) |
| 5b| racePicker | RacePickerScreen | busca | — | — | — |
| 6 | experience_level | LevelScreen | opção única | ◉ radio 30, dir. | **24px** (gap+margin) | theme 3xl (30) |
| ✦ | __i1 goal_achievable | GoalAchievableScreen | intersticial | — | — | Poppins-Medium 20 |
| 7 | daysPerWeek | FrequencyScreen | slider | — | — | theme 3xl (centrado) |
| ✦ | __i2 assessoria_compare | AssessoriaCompareScreen | intersticial | — | — | Poppins-Bold 24 |
| 8 | availableDays | AvailableDaysScreen | grid dias | — (toggle 64px) | grid 12px | hardcoded **28** |
| 9 | intenseDayIndex | IntenseDayScreen | grid | — | — | — |
| 10| recentDistance | RecentDistanceScreen | opção única | ◉ radio **24**, dir. | **12px** (só gap) | theme 3xl, lh **40** |
| 11| distanceTime | DistanceTimeScreen | input | — | — | — |
| ✦ | __i3 time_compare | TimeCompareScreen | intersticial | — | — | Poppins-Medium 20 |
| 12| pace | PaceConfirmScreen | input | — | — | — |
| 13| startDate | StartDateScreen | input | — | — | — |
| 14| limitations | LimitationsScreen | sim/não | ✓ checkbox 24, **esq.** | **16px** | **Inter-Bold** 24 |
| 15| goalTimeframe | GoalTimeframeScreen | opção | — | — | — |
| 16| preferredWearable | WearableConnectionScreen | sim/não | — | — | — |
| 17| referralCode | ReferralCodeScreen | input | — | — | — |

---

## 2. Pontos que VOCÊ identificou — confirmados no código

### 2.1 ❌ Espaçamento entre opções sem padronização — **CONFIRMADO (é bug)**
O espaço efetivo entre cards varia de **10 a 24 px**:

| Tela | `optionsContainer.gap` | `optionCard.marginBottom` | **Efetivo** |
|---|---|---|---|
| Objective / Level / GoalType | 12 | **12** | **24px** ← dobro |
| RecentDistance | 12 | 0 | 12px |
| Weight | 10 | 0 | 10px |
| Limitations | 16 | 0 | 16px |

Causa raiz: Objective/Level/GoalType aplicam **gap E marginBottom ao mesmo tempo** (ex.: [ObjectiveScreen.tsx:141-149](runeasyv2/mobile/src/screens/quiz/ObjectiveScreen.tsx#L141-L149)). É somatório duplo → exatamente a "diferença gritante" que você sentiu.

### 2.2 ❌ Bullets: tipo, tamanho e posição divergentes — **CONFIRMADO**

| Tela | Indicador | Tamanho externo | Ponto interno | Lado |
|---|---|---|---|---|
| Objective | radio (anel+ponto) | 30×30 | 18 | direita |
| Level | radio | 30×30 | 18 | direita |
| GoalType | radio | 30×30 | 18 | direita |
| RecentDistance | radio | **24×24** | **12** | direita |
| Weight | **checkbox ✓** | 24×24 | — | **esquerda** |
| Limitations | **checkbox ✓** | 24×24 | — | **esquerda** |

São **3 eixos de inconsistência** num só app: radio vs checkbox; 30 vs 24; ponto 18 vs 12; esquerda vs direita. Bate 100% com sua queixa.

### 2.3 ❌ Ícones ilustrativos pouco premium e sem biblioteca única — **CONFIRMADO**
- `ObjectiveScreen` / `LevelScreen`: SVG paths desenhados à mão em caixa 47×47 cujo `fill` é `colors.card` (mesma cor do card → a caixa some). [ObjectiveScreen.tsx:12-45](runeasyv2/mobile/src/screens/quiz/ObjectiveScreen.tsx#L12-L45)
- `RecentDistanceScreen`: **o mesmo ícone de corrida repetido nas 4 opções** [RecentDistanceScreen.tsx:19-26](runeasyv2/mobile/src/screens/quiz/RecentDistanceScreen.tsx#L19-L26)
- `onboardingStore.onboardingQuestions`: ícones em **emoji** 🏃🏅🏆 (config legada)
- ✅ **`GoalTypeScreen` já usa `Ionicons`** num `IconBox` 47×47 — [GoalTypeScreen.tsx:15-19](runeasyv2/mobile/src/screens/quiz/GoalTypeScreen.tsx#L15-L19). **Esse é o padrão-alvo**: basta propagar para todas.

### 2.4 ⚠️ Peso/Altura — entrada manual pouco premium — **CONFIRMADO**
- `WeightScreen`: "Inserir peso exato" abre um `TextInput` inline que empurra o layout. [WeightScreen.tsx:126-149](runeasyv2/mobile/src/screens/quiz/WeightScreen.tsx#L126-L149)
- `HeightScreen`: idem com input inline + botão "OK". [HeightScreen.tsx:242-260](runeasyv2/mobile/src/screens/quiz/HeightScreen.tsx#L242-L260)
- Recomendação: trocar por **modal/bottom-sheet** clean (overlay escurecido, blur, teclado numérico grande, confirmar) — coeso entre as duas telas.

### 2.5 ❌ "Meta alcançável" não usa os km da prova — **CONFIRMADO (bug)**
[GoalAchievableScreen.tsx:13-16](runeasyv2/mobile/src/screens/quiz/GoalAchievableScreen.tsx#L13-L16) chama `getGoalAchievableCopy(data.goal, data.experience_level)`.
No caminho "prova" (`goal_type === 'race'`) a `ObjectiveScreen` é pulada, então `data.goal` fica `''`. Em [onboardingCopyMatrix.ts:52](runeasyv2/mobile/src/utils/onboardingCopyMatrix.ts#L52) isso cai no **fallback `'10k'`** → a copy sempre diz "10 km", ignorando a corrida escolhida.
O store **já tem** `data.race_distance` e `data.race_name`, e a função `deriveGoalFromDistance()` [onboardingStore.ts:160](runeasyv2/mobile/src/stores/onboardingStore.ts#L160) — só não estão sendo usadas aqui.
**Fix:** passar `goal_type`/`race_distance`/`race_name` para a copy e exibir a distância/nome reais (ex.: "Alcançar a **Maratona de SP (42 km)**…").

### 2.6 ❌ "Dobro de km / metade do tempo" com valores absurdos + sem animação — **CONFIRMADO (bug)**
[TimeCompareScreen.tsx:32-33](runeasyv2/mobile/src/screens/quiz/TimeCompareScreen.tsx#L32-L33):
```ts
const doubleDistance = userDistance * 2;                  // 2× distância
const fasterTimeSec = Math.max(60, Math.round(userTimeSec * 0.2)); // 5× mais rápido (!)
```
O título promete "**metade** do tempo" mas o código mostra **1/5** do tempo. 2× distância em 1/5 do tempo ⇒ **10× de ganho de pace** — impossível, destrói credibilidade.
Além disso, as barras são **estáticas** (alturas fixas `0.28`/`0.70`, [linhas 23-24](runeasyv2/mobile/src/screens/quiz/TimeCompareScreen.tsx#L23-L24)) — sem animação de preenchimento.
**Fix:** comparação realista (ex.: mesma distância, ~10–15% mais rápido; ou +1 faixa de distância em tempo similar) **+ animação de barra enchendo** ao entrar. A `AssessoriaCompareScreen` já anima um gráfico em 1500 ms ([AssessoriaCompare.tsx:52-58](runeasyv2/mobile/src/screens/quiz/AssessoriaCompareScreen.tsx#L52-L58)) — reusar esse padrão (Reanimated `withTiming`).

---

## 3. Pontos que EU identifiquei (adicionais)

### 3.1 ❌ Tipografia de título sem escala única — **alta prioridade**
Títulos no mesmo fluxo: **20** (GoalAchievable/TimeCompare), **24** (Weight/Height/Limitations/Assessoria), **28** (AvailableDays), **30** (Objective/Level/GoalType/Recent/Frequency). LineHeights: 30/32/36/**40**. E **4 famílias misturadas**: theme (Plus Jakarta via fontWeight), `Inter-Bold` (Limitations), `Poppins-Medium`, `Poppins-Bold`. Não há `fontFamily` explícito em metade das telas → no Android o peso "bold" pode nem renderizar a fonte custom.

### 3.2 ❌ Subtítulo idem
`lg` (16) lh 22 em umas; `15` lh 22 hardcoded em outras; Recent lh 24.

### 3.3 ❌ Alinhamento de título inconsistente
Quase todas à esquerda, mas `FrequencyScreen` centraliza ([linha 301](runeasyv2/mobile/src/screens/quiz/FrequencyScreen.tsx#L301)) e os intersticiais centralizam. Sem regra.

### 3.4 ⚠️ Cores duplicadas/divergentes do tema
Cada tela redefine um objeto `DS` local com hex próprios (`#0F0F1E`, `#1C1C2E`, `#EBEBF5`…) que **não batem** com `theme/index.ts` (`background: #0A0A18`, `card: #1A1A2E`, `text: #FFFFFF`). Há dois "pretos", dois "cards", dois "textos" no app. Selecionado também varia: `rgba(0,212,255,0.08)` vs `0.1` vs `0.15`.

### 3.5 ⚠️ Acessibilidade abaixo do checklist da skill
`WeightScreen`/`HeightScreen`/`AvailableDays`/`Limitations` usam `TouchableOpacity` cru sem `accessibilityRole`/`accessibilityState`/`accessibilityLabel`. Toggles de dia 64×64 ok; checkboxes 24×24 < alvo 44×44 (o card inteiro é tocável, mas o alvo declarado é pequeno). O `OptionCard` central já faz isso certo — outra razão para padronizar nele.

### 3.6 ⚠️ Transição entre perguntas pode ser mais rica
Hoje: `FadeIn 260ms` no remount ([OnboardingScreen.tsx:469-471](runeasyv2/mobile/src/screens/OnboardingScreen.tsx#L469-L471)). Funciona, mas é só fade. Sugestão: **slide-fade horizontal** (entra de +24px X, sai para -24px) coerente com "avançar/voltar", respeitando `reduce motion`.

### 3.7 ⚠️ Microcopy/UX (lente Coconote)
- A barra de XP é ótima ancoragem de progresso (✅ mantém). 
- Os intersticiais de prova social (90% / 80%) são fortes — mas os **números são afirmações sem fonte**; o playbook Coconote recomenda prova social, mas sinalizo o trade-off ético: idealmente ancorar em dado real ou suavizar ("a maioria").
- `GoalAchievable` tem 6 quebras de linha manuais `{'\n'}` → quebra feio em telas pequenas (SE). Usar quebra natural.

### 3.8 ℹ️ Performance
- `Dimensions.get('window')` no módulo (vários arquivos) não reage a rotação/split — ok para onboarding portrait-lock, mas registrar.
- Ícones SVG inline recriados a cada render; com a migração para Ionicons isso some.
- Nenhum problema de lista (não há FlatList aqui).

---

## 4. Solução proposta — padronização (a base de tudo)

Criar **2 componentes + 1 token file** e refatorar as telas para consumi-los. Isso resolve 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5 de uma vez.

**a) `mobile/src/screens/quiz/_tokens.ts`** — fonte única de verdade do quiz:
```ts
export const QUIZ = {
  color: { bg:'#0F0F1E', card:'#1C1C2E', cyan:'#00D4FF',
           text:'#EBEBF5', textDim:'rgba(235,235,245,0.6)',
           selectedFill:'rgba(0,212,255,0.10)', stroke:'rgba(235,235,245,0.1)' },
  title:    { fontFamily:'Poppins-Bold', fontSize:26, lineHeight:34 },
  subtitle: { fontFamily:'Poppins-Regular', fontSize:15, lineHeight:22 },
  gap: 12,            // ÚNICO espaçamento entre opções
  card:    { radius:16, padding:16, borderWidth:2 },
  bullet:  { size:26, dot:14, side:'right' as const }, // radio único
  iconBox: { size:48, radius:12 },
};
```

**b) `mobile/src/components/onboarding/QuizHeader.tsx`** — `title` + `subtitle` (com suporte a destaque cyan), sempre mesma escala/alinhamento.

**c) `mobile/src/components/onboarding/SelectableOption.tsx`** — envolve o `OptionCard` atual e padroniza: ícone (Ionicons), título, subtítulo e **um único bullet** (radio à direita), `gap` e paddings vindos de `_tokens`. Acessibilidade embutida.

**d) Mapa de ícones Ionicons** (substitui SVGs/emoji):
| Opção | Ionicon |
|---|---|
| 5K / iniciante | `walk-outline` |
| 10K / resistência | `pulse-outline` |
| Meia / 21k | `trophy-outline` |
| Maratona / 42k | `medal-outline` |
| Fitness geral | `fitness-outline` |
| Distância (meta) | `trending-up-outline` |
| Prova | `flag-outline` |

Depois, **Weight/Height/Recent/Objective/Level/GoalType/Limitations** passam a usar `QuizHeader` + `SelectableOption`. Cada tela perde ~100 linhas de estilo duplicado.

---

## 5. Roadmap priorizado (ICE = Impact × Confidence × Ease, 1-5)

| # | Item | I | C | E | ICE | Esforço |
|---|---|---|---|---|---|---|
| 1 | Bug copy/valores `TimeCompareScreen` + animação de barra | 5 | 5 | 4 | **100** | 0,5 d |
| 2 | Bug `GoalAchievableScreen` usar distância/nome da prova | 5 | 5 | 5 | **125** | 0,5 d |
| 3 | `_tokens.ts` + remover gap duplicado (espaçamento único) | 5 | 5 | 4 | **100** | 0,5 d |
| 4 | `SelectableOption` (bullet único) + aplicar em 6 telas | 5 | 5 | 3 | **75** | 1,5 d |
| 5 | `QuizHeader` (tipografia/título único) em todas | 5 | 4 | 3 | **60** | 1 d |
| 6 | Ícones Ionicons unificados | 4 | 5 | 4 | **80** | 0,5 d |
| 7 | Modal premium de input Peso/Altura | 4 | 4 | 3 | **48** | 1 d |
| 8 | Slide-fade nas transições + reduce-motion | 3 | 4 | 4 | **48** | 0,5 d |
| 9 | Unificar cores no `theme` (remover `DS` locais) | 3 | 4 | 3 | **36** | 1 d |
| 10| Remover `QuizOnboardingScreen` legado | 2 | 5 | 5 | **50** | 0,2 d |
| 11| Acessibilidade (roles/labels/alvos 44px) | 3 | 5 | 3 | **45** | 0,5 d |

**Ordem sugerida de PRs:** (1+2) bugs isolados → (3) tokens → (6) ícones → (4) opção única → (5) header → (7+8) polish → (9+10+11) limpeza.

---

## 6. Quick wins prontos para hoje

- **TimeCompare:** título "≈ % mais rápido" coerente com o cálculo; `fasterTimeSec = userTimeSec * 0.88` (12% mais rápido) e `betterDistance = userDistance` (ou +1 faixa) — e animar as barras com `useSharedValue`+`withTiming` como na Assessoria.
- **GoalAchievable:** `const isRace = data.goal_type==='race'` → quando prova, `goalLabel = data.race_name ?? \`${data.race_distance} km\`` e derivar dificuldade via `deriveGoalFromDistance(data.race_distance)`.
- **Espaçamento:** remover `marginBottom:12` de `optionCard` em Objective/Level/GoalType (mantendo só o `gap`) — corrige o "dobro" imediatamente.

---

*Fim da auditoria. Próximo passo recomendado: aprovar o pacote de padronização (itens 3-6) para eu implementar em PRs pequenos e revisáveis.*
