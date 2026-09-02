# RunEasy — Mapeamento histórico de backgrounds sólidos

> Snapshot auditado: `1541466e3e252696aeea8339eb143e8a832743c6`  
> Data do snapshot: 21/08/2026 21:49:45 (America/Sao_Paulo)  
> Primeiro commit da frente de redesign/tokenização: `2ca856476f987c75d089c80ad233fa9cd576667b`  
> Escopo: somente leitura histórica; este documento é o único artefato criado.

## 1. Objetivo e critério histórico

Este documento registra como eram compostos os backgrounds sólidos do aplicativo antes da frente de redesign e tokenização iniciada em `2ca8564`, em 22/08/2026.

O estado considerado como **“antes das mudanças”** é o pai direto daquele commit, `1541466`. Esse recorte evita misturar a paleta original com migrações parciais feitas nos commits seguintes.

A auditoria percorreu todo o snapshot `mobile/src`:

- 178 arquivos continham `backgroundColor`;
- 889 propriedades `backgroundColor` foram identificadas por análise da AST;
- 273 expressões distintas existiam antes da resolução de aliases e constantes locais;
- o inventário abaixo retém somente superfícies pertencentes às categorias solicitadas.

## 2. O que entrou e o que ficou fora

### Incluído

- fundo-base de telas e shells de navegação;
- fundo de modais, dialogs, sheets, popups e seus backdrops;
- fundo principal de cards e subcards;
- preenchimentos sólidos de estados de cards, quando mudavam a superfície;
- elementos flutuantes, menus, banners, docks, pills e controles sobre conteúdo;
- cores `rgba(...)`, pois continuam sendo preenchimentos sólidos, apenas com alpha.

### Excluído

- qualquer `LinearGradient` ou lista de stops de gradiente;
- imagens usadas como background;
- cores de texto, ícones, bordas, divisores, sombras, rotas e gráficos;
- progress bars, bullets e pequenos indicadores sem função de superfície;
- bottom tab bar e FAB, conforme solicitado;
- puck/indicador de localização do usuário;
- `transparent`, por não representar uma cor de superfície.

## 3. Leitura rápida da composição antiga

| Camada | Cores dominantes | Comportamento histórico |
| --- | --- | --- |
| Fundo de tela | `#0A0A18`, `#0E0E1F`, `#0F0F1E`, `#0A0A14`, `#0F172A` | Não havia um único canvas. Fluxos próximos alternavam navy, violeta quase preto e slate. |
| Card principal | `#1A1A2E`, `#1C1C2E` | Dois tons visualmente próximos exerciam o mesmo papel semântico. |
| Card profundo | `#15152A`, `#12121F`, `#13132A`, `#11151B` | Usado para cards internos, estados passados e conteúdo aninhado. |
| Modal/sheet | `#1C1C2E`, `#1A1A2E`, `#15152A`, `#0E0E1F` | O nível de elevação não determinava uma cor única. |
| Backdrop | preto entre 50% e 75% | Existiam cinco opacidades principais para a mesma função. |
| Flutuantes | navy opaco ou navy com alpha entre 72% e 94% | Map overlays e menus criavam uma família própria, sem token comum. |
| Estados selecionados | cyan com alpha entre 4% e 30% | A mesma intenção usava diversas opacidades. |

## 4. Tokens e aliases antigos relevantes

O antigo `mobile/src/theme/index.ts` centralizava parte da paleta, mas diversos fluxos mantinham constantes locais equivalentes ou concorrentes.

| Alias histórico | Valor | Papel encontrado |
| --- | --- | --- |
| `colors.background` | `#0A0A18` | canvas principal |
| `colors.backgroundLight` | `#0E0E1F` | canvas alternativo e superfícies profundas |
| `colors.card` | `#1A1A2E` | card principal e algumas sheets |
| `colors.cardDark` | `#0E0E1F` | sheet/card profundo |
| `colors.highlight` | `#1E1E32` | realce e pequenos containers |
| `colors.streakCard` | `#15152A` | card secundário |
| `colors.streakDayCard` | `#1C1C2E` | card/linha elevada |
| `colors.glassLight` | `rgba(255,255,255,0.05)` | card translúcido e conteúdo auxiliar |
| `colors.glassDark` | `rgba(0,0,0,0.3)` | véu escuro |
| `colors.proGlassOverlay` | `rgba(28,28,46,0.6)` | overlay de card Pro |
| `colors.proGlassOverlayStrong` | `rgba(14,14,30,0.82)` | overlay denso |
| `colors.proCardGlassFill` | `rgba(28,28,46,0.5)` | card de benefício Pro |
| `colors.proCtaFill` | `rgba(8,34,42,0.92)` | CTA escuro com tonalidade teal |
| `QUIZ.color.bg` | `#0F0F1E` | shell do quiz/onboarding |
| `QUIZ.color.card` | `#1C1C2E` | opções e cards do quiz |
| `QUIZ.color.selectedFill` | `rgba(0,212,255,0.10)` | opção selecionada |
| `T.bgPrimary` / `T.bg` em tracking | `#0E0E1F` | telas e overlays de corrida/esteira |
| `T.cardSurface` em tracking | `#1C1C2E` | cards, dock e sheet |
| `T.cardDarker` em tracking | `#15152A` | card aninhado |

## 5. Backgrounds de telas

### `#0A0A18` — canvas dark navy principal

Era o `colors.background` e também o valor fixo do `ScreenContainer`.

Aplicações diretas ou herdadas:

- `components/ScreenContainer.tsx` — `container`; todas as telas que usavam o componente herdavam esse fundo, salvo override.
- `screens/BadgesScreen.tsx`
- `screens/CalendarScreen.tsx` — `container` explícito.
- `screens/CustomizeGoalScreen.tsx`
- `screens/HelpScreen.tsx`
- `screens/HomeScreen.tsx` — `container` explícito.
- `screens/ManualWorkoutConfigScreen.tsx`
- `screens/NotificationsScreen.tsx`
- `screens/PersonalInfoScreen.tsx`
- `screens/RankingScreen.tsx`
- `screens/RetrospectiveScreen.tsx` — `root` explícito.
- `screens/SettingsScreen.tsx`
- `screens/SupportScreen.tsx`
- `screens/TrainingHistoryScreen.tsx`
- `screens/WorkoutDetailScreen.tsx`
- `screens/coach/CoachAudioSettingsScreen.tsx`
- `screens/weekly-insight/WeeklyInsightScreen.tsx`
- `screens/FeedbackScreen.tsx` — `container`, loading e empty.
- `screens/LandingScreen.tsx` — `container`.
- `screens/StatsScreen.tsx` — `container`.
- `screens/WellnessScreen.tsx` — `safeArea`.
- `screens/auth/AuthScreen.tsx` — `container`.
- `screens/dev/DevMenuScreen.tsx` — `container`.
- `screens/meso-insight/MesoInsightScreen.tsx` — `root`.
- `screens/meso-insight/dashboard/MesoDashboard.tsx` — `root`.
- `screens/meso-insight/stories/MesoStoryDeck.tsx` — `root`.
- `screens/quiz/PlanPreviewScreen.tsx` e `screens/quiz/TimeframeScreen.tsx`.
- `screens/WelcomeScreen.tsx` — `container` explícito.
- `screens/readiness/ReadinessQuizScreen.tsx` — `container` explícito.
- `navigation/AppNavigator.tsx` — background dos headers das tabs e placeholder de navegação.

Observação: `PlanGoalsScreen` e `WeekDetailScreen` usavam `ScreenContainer`, mas sobrescreviam a superfície visível com `#0E0E1F`.

### `#0E0E1F` — navy/violeta alternativo

Aplicações como fundo de tela ou shell:

- `screens/LoginScreen.tsx` — `container`.
- `screens/RegisterScreen.tsx` — `container`.
- `screens/NotificationSettingsScreen.tsx` — `container`.
- `screens/quiz/PlanLoadingScreen.tsx` — `container`.
- `screens/readiness/ReadinessResultScreen.tsx` — `container`.
- `screens/running/RunningScreen.tsx` — container e loading.
- `screens/running/ExpandedMetricsOverlay.tsx` — `container`.
- `screens/running/TreadmillRunningView.tsx` — `container`.
- `screens/running/RunSummaryScreen.tsx` — `container`.
- `screens/CoachAnalysisScreen.tsx` — `container`.
- `screens/treadmill/TreadmillSetupScreen.tsx` — `container` e `safeTop`.
- `screens/running/WorkoutProcessingScreen.tsx` — container via `colors.cardDark`.
- `screens/PrePaywallScreen.tsx` — `root` via `colors.backgroundLight`.
- `screens/plan-goals/PlanGoalsScreen.tsx` — `screen`.
- `screens/plan-goals/WeekDetailScreen.tsx` — `screen`.
- `screens/sharing/SharingModal.tsx` — área segura do fluxo de compartilhamento.

### `#0F0F1E` — shell forçado do onboarding/quiz

- `navigation/AppNavigator.tsx` — `contentStyle` e `headerStyle` do fluxo forçado.
- `screens/OnboardingScreen.tsx` — `container` e área fixa dos botões.
- `screens/quiz/BriefingScreen.tsx` — `DS.bg` em container/áreas fixas.
- `screens/quiz/SmartPlanScreen.tsx` — `DS.bg` em container/áreas fixas.
- Diversas telas do quiz declaravam `DS.bg` localmente para preservar a mesma identidade, embora nem todas o aplicassem diretamente a um `backgroundColor` próprio.

### `#0A0A14` — quase preto usado por Evolution e Readiness

- `screens/EvolutionScreen.tsx` — container, safe area, loading e error.
- `screens/readiness/ReadinessResultScreen.tsx` — loading e error.
- `screens/readiness/ReadinessSuccessScreen.tsx` — container.

### `#0F172A` — slate isolado

- `screens/PlanPreviewScreen.tsx` — container e footer.
- `components/QuizLayout.tsx` — container definido, sem consumidor encontrado no snapshot.

Essa era a divergência mais evidente: `#0F172A` é mais azulado e claro que os navies usados no restante do produto.

### `#FFFFFF` — loading global isolado

- `navigation/AppNavigator.tsx#loadingContainer`.

O loading global usava branco puro enquanto os demais shells eram escuros.

## 6. Backgrounds de modais, sheets e popups

### 6.1. Backdrops

| Cor | Aplicação histórica |
| --- | --- |
| `rgba(0,0,0,0.50)` | `WheelPickerModal.overlay`; `SharingModal.captureOverlay` |
| `rgba(0,0,0,0.55)` | `RaceDetailSheet.backdrop`; `RaceDistanceSelectorSheet.backdrop`; `ReliefSheet.overlay`; `WeekReliefSheet.overlay`; `RacePickerScreen.backdrop` |
| `rgba(0,0,0,0.60)` | `LocationDisclosureModal.backdrop`; `RunEnvironmentModal.backdrop`; `InsightCarousel.backdrop`; `FeasibilityModal.overlay`; `ValueInputSheet.overlay`; `TrialModal.backdrop`; `CalendarScreen.modalOverlay`; `WearableSelectionModal.overlay` |
| `rgba(0,0,0,0.65)` | `GoalsModal.overlay` |
| `rgba(0,0,0,0.70)` | `CustomCalendar.overlay`; `WorkoutCreatedPopup.overlay`; `BirthDateScreen.modalOverlay` |
| `rgba(0,0,0,0.75)` | `BadgesScreen.modalOverlay` |
| `rgba(10,10,24,0.92)` | `UpgradeProCard.fullscreenOverlay` |
| `rgba(14,14,31,0.92)` | overlay de finalização em `RunningScreen` e `TreadmillRunningView` |

### 6.2. Superfícies principais

| Cor resolvida | Aplicação histórica |
| --- | --- |
| `#1A1A2E` | `LocationDisclosureModal.dialog`; `ReliefSheet.sheet`; `WeekReliefSheet.sheet` |
| `#1C1C2E` | `CustomCalendar.card`; `GoalsModal.modalContainer`; `RunEnvironmentModal.dialog`; `WheelPickerModal.pickerContainer`; `WorkoutCreatedPopup.card`; `BadgesScreen.modalCard`; `CalendarScreen.modalContainer`; `BirthDateScreen.modalSheet`; `CoachAnalysisScreen.sheetBackground`; `RunSummaryScreen.sheetBackground`; header e action bar de `SharingModal` |
| `#15152A` | container externo de `WheelPickerModal`; `FeasibilityModal.sheet`; `ValueInputSheet.sheet`; `WearableSelectionModal.sheet` |
| `#0E0E1F` | `InsightCarousel.sheet`; `RaceDetailSheet.sheet`; `RaceDistanceSelectorSheet.sheet`; `RacePickerScreen.optionSheet`; backdrop/shell de esteira em `CoachAnalysisScreen` e `RunSummaryScreen`; safe area de `SharingModal` |
| `rgba(14,14,30,0.82)` | véu sólido de `PlanGeneratingOverlay` via `proGlassOverlayStrong` |

`TrialModal` usava backdrop sólido, mas sua superfície visual principal era um gradiente; por isso ela não aparece como surface na tabela.

### 6.3. Superfícies internas dos modais

| Cor | Aplicação histórica |
| --- | --- |
| `#15152A` | `GoalsModal.blockCard` |
| `rgba(21,21,42,0.85)` | opções internas de `RunEnvironmentModal` |
| `#0E0E1F` | tiles de ícone de `RunEnvironmentModal` |
| `#1C1C2E` | tip card/chips de `FeasibilityModal`; input row de `ValueInputSheet` |
| `#1A1A2E` | pills de `RaceDetailSheet` e `RaceDistanceSelectorSheet` |
| `rgba(245,158,11,0.06)` | conflict banner de `ReliefSheet` e `WeekReliefSheet` |
| `rgba(0,212,255,0.06)` | opção selecionada de `ReliefSheet` e `WeekReliefSheet` |
| `rgba(0,212,255,0.08)` | pill selecionada de `RaceDistanceSelectorSheet` |
| `rgba(0,212,255,0.10)` | chip selecionado em `FeasibilityModal` |

## 7. Backgrounds de cards

As listas usam `arquivo#estilo` para indicar precisamente onde a superfície aparecia.

### 7.1. `#1A1A2E` — card principal do tema antigo

Aplicações via `colors.card` ou literal equivalente:

- `components/home/OverviewSection.tsx#largeCard`, `smallCard`, `emptyCard`
- `components/insight/MesoInsightCard.tsx#card`
- `components/insight/WeeklyInsightCard.tsx#card`
- `components/onboarding/RaceCard.tsx#card`
- `components/skeletons/ScreenSkeletons.tsx#card`
- `components/ui/FriendlyEmptyCard.tsx#card`
- `components/wellness/EvolutionChart.tsx#card`
- `components/wellness/HealthSection.tsx#card`, `ctaCard`, `soonCard`
- `components/wellness/PerformanceCard.tsx#card`
- `components/wellness/WellnessSkeleton.tsx#card`
- `components/wellness/ZonesChart.tsx#card`, `emptyCard`
- `screens/CustomizeGoalScreen.tsx#overviewCard`
- `screens/HomeScreen.tsx#recoveryCard`, `workoutCard`, `aiCard`
- `screens/ManualWorkoutConfigScreen.tsx#typeCard`
- `screens/RankingScreen.tsx#userPositionCard`, `achievementsCard`
- `screens/dev/DevMenuScreen.tsx#stateCard`
- `screens/meso-insight/dashboard/MesoDashboard.tsx#qualityCard`
- `screens/meso-insight/dashboard/MesoVolumeArc.tsx#card`
- `screens/quiz/RacePickerScreen.tsx#manualCard`
- `screens/weekly-insight/components/AdjustmentTray.tsx#card`
- `screens/weekly-insight/components/HeroStats.tsx#card`
- `screens/weekly-insight/components/IntensityCard.tsx#card`, `emptyCard`
- `screens/weekly-insight/components/VolumeComparison.tsx#card`
- `screens/weekly-insight/components/WeeklyProgressChart.tsx#card`, `emptyCard`
- `screens/weekly-insight/components/ZonesRadar.tsx#card`, `emptyCard`
- `screens/CalendarScreen.tsx#nextWorkoutCard`
- `screens/readiness/ReadinessResultScreen.tsx#metricCard`

### 7.2. `#1C1C2E` — card elevado/opção

- `components/CustomCalendar.tsx#card`
- `components/WorkoutCreatedPopup.tsx#card`
- `components/WeeklyStreakCard.tsx#dayCard`
- `components/home/results/ResultCardsSkeleton.tsx#card`
- `components/home/results/WorkoutResultCard.tsx#content`
- `components/training/WorkoutDayCard.tsx#cardTopSection`
- `components/onboarding/SelectableOption.tsx#card`
- `components/onboarding/FeasibilityModal.tsx#tipCard`
- `screens/BadgesScreen.tsx#badgeCard`, `modalCard`
- `screens/CalendarScreen.tsx#cardTopSection`
- `screens/HelpScreen.tsx#faqCard`, `legalCard`
- `screens/NotificationSettingsScreen.tsx#settingsCard`
- `screens/NotificationsScreen.tsx#notificationCard`
- `screens/SettingsScreen.tsx#menuCard`
- `screens/SupportScreen.tsx#emailCard`
- `screens/TrainingHistoryScreen.tsx#summaryCard`, `workoutCard`
- `screens/running/RunningScreen.tsx#finishingCard`
- `screens/treadmill/TreadmillSetupScreen.tsx#radarCard`, `emptyCard`, `connectedCard`, `manualCard`
- `screens/quiz/AssessoriaCompareScreen.tsx#card`
- `screens/quiz/BirthDateScreen.tsx#triggerCard`
- `screens/quiz/BriefingScreen.tsx#metricsCard`, `chartCard`, `aiTipCard`
- `screens/quiz/GoalTimeframeScreen.tsx#optionCard`, `tipCard`
- `screens/quiz/IntenseDayScreen.tsx#dayCard`, `tipCard`
- `screens/quiz/SmartPlanScreen.tsx#metricsCard`, `chartCard`, `aiTipCard`
- `screens/quiz/TimeCompareScreen.tsx#card`
- `screens/quiz/FrequencyScreen.tsx#tipCard`
- `screens/quiz/RecentDistanceScreen.tsx#infoCard`
- `screens/quiz/WalkCapacityScreen.tsx#infoCard`
- `screens/quiz/PaceConfirmScreen.tsx#card`
- `screens/quiz/StartDateScreen.tsx#card`
- `screens/quiz/ManualRaceDateScreen.tsx#card`
- `screens/running/TreadmillRunningView.tsx#finishingCard`

### 7.3. `#15152A` — card profundo/aninhado

- `components/WeeklyStreakCard.tsx#card`
- `components/calendar/StatsPeriodCard.tsx#card`
- `components/workout/RpeSelector.tsx#card`
- `components/WorkoutCard.tsx#card`
- `screens/plan-goals/components/WeekRow.tsx#card`
- `screens/plan-goals/WeekDetailScreen.tsx#summaryCard`
- `screens/EvolutionScreen.tsx#optionCard`
- `screens/quiz/PlanPreviewScreen.tsx#optionCard`
- `screens/quiz/TimeframeScreen.tsx#paceCard`
- `screens/quiz/BriefingScreen.tsx#badgeCard`, `workoutCardActive`, `workoutCardLocked`, `paywallCard`
- `screens/quiz/SmartPlanScreen.tsx#badgeCard`, `workoutCardActive`, `workoutCardLocked`, `paywallCard`
- `screens/CoachAnalysisScreen.tsx#treadmillChartCard`, `cardDark`, `tipCard`
- `screens/running/RunSummaryScreen.tsx#treadmillChartCard`, `cardDark`

### 7.4. Outros neutros opacos

| Cor | Aplicação histórica |
| --- | --- |
| `#12121F` | analysis/metric/question cards de `EvolutionScreen`; analysis card de `ReadinessResultScreen` |
| `#13132A` | `WeekRow.cardPast` |
| `#11151B` | `WorkoutResultCard.card` |
| `#0E0E1F` | `ManualWorkoutConfigScreen.summaryCard`; `RunningScreen.telemetryCard` |

### 7.5. Cards claros que quebravam a continuidade do dark mode

| Cor | Aplicação histórica |
| --- | --- |
| `#FFFFFF` | hero, metric, point e impact cards de `FeedbackScreen`; metric card e plan card de `StatsScreen` |
| `#F5F3FF` | `StatsScreen.rewardCardBadge` |
| `#FFF7ED` | `StatsScreen.rewardCardStreak` |

Essas superfícies eram uma das fontes de alternância extrema: cards muito claros apareciam dentro de fluxos cujo canvas era quase preto.

### 7.6. Cards translúcidos e estados sólidos

| Cor | Aplicação histórica |
| --- | --- |
| `rgba(255,255,255,0.05)` | option card de `QuizLayout`; cards de resumo, análise, preview e stat em `PlanPreviewScreen`; coach card de `CustomizeGoalScreen`; empty card de `MesoDashboard` |
| `rgba(235,235,245,0.10)` | `CoachDeepDiveSection.card` |
| `rgba(0,127,153,0.30)` | insight cards de `CalendarScreen` e `WorkoutDetailScreen` |
| `rgba(0,212,255,0.15)` | adjustment subcard de `EvolutionScreen` e `ReadinessResultScreen` |
| `rgba(0,212,255,0.10)` | option selected de `QuizLayout`/onboarding |
| `rgba(0,212,255,0.08)` | option selected de `EvolutionScreen` |
| `rgba(0,212,255,0.06)` | premium card de `TimeCompareScreen` |
| `rgba(0,212,255,0.05)` | insight notification card; selected option de quiz; action card de `AdjustmentTray` |
| `rgba(0,212,255,0.04)` | laurel card de `TestimonialsScreen`; card elevated de esteira |
| `#00D4FF` | estado ativo de `ManualWorkoutConfigScreen.typeCard` |
| `rgba(167,139,250,0.10)` | recovery card de `CalendarScreen` |
| `rgba(255,196,0,0.12)` | warning card de `CoachAudioSettingsScreen` e esteira |
| `rgba(255,196,0,0.10)` | warning card de `AvailableDaysScreen` |
| `rgba(245,158,11,0.05)` | advice card de `AdjustmentTray` |
| `rgba(255,184,0,0.10)` | `RaceCountdownBadge.card` |

## 8. Backgrounds de elementos flutuantes

Bottom tab bar e `HomeFab` foram removidos desta seção. Elementos internos do puck também não foram auditados.

### 8.1. Menus, popovers e balloons

| Cor | Aplicação histórica |
| --- | --- |
| `#1F1F38` | menu flutuante de `StatsPeriodCard` |
| `#1C1C2E` | balloon e tail de `CoachBell` |
| `#0E0E1F` | sheet flutuante de `InsightCarousel`; option sheet de `RacePickerScreen` |
| `rgba(255,255,255,0.06)` | botão de fechar de `InsightCarousel` e `WearableSelectionModal` |

### 8.2. Overlays e controles de mapa/tracking

| Cor | Aplicação histórica |
| --- | --- |
| `#0A0A18` | `RunningScreen.sidePanel` |
| `rgba(14,14,31,0.72)` | container de `GpsSignalBars` |
| `rgba(14,14,31,0.85)` | `mapOverlayPill` de `CoachAnalysisScreen` e `RunSummaryScreen` |
| `rgba(28,28,46,0.92)` | seletor `chip3d` de `CoachAnalysisScreen` e `RunSummaryScreen` |
| `rgba(28,28,46,0.94)` | `LowPowerBanner.container` |
| `rgba(255,196,0,0.08)` | botão de configurações do `LowPowerBanner` |
| `rgba(0,212,255,0.10)` | chip ativo de `StatMapSelector` |
| `#1C1C2E` | workout pill e bottom dock em `ExpandedMetricsOverlay`/`TreadmillRunningView` |
| `rgba(14,14,31,0.92)` | finishing overlay em corrida GPS e esteira |

### 8.3. Contadores, badges e ações flutuantes

| Cor | Aplicação histórica |
| --- | --- |
| `rgba(14,14,31,0.78)` | contador de `StackedResultCards` |
| `#FF3B30` | badge de notificação do `HomeFixedHeader` |
| `#00D4FF` | botões flutuantes de edição de avatar em Profile/Settings |
| `rgba(10,10,24,0.55)` | overlay flutuante de upload do avatar |
| `rgba(10,10,20,0.95)` | locked overlay de `EvolutionScreen` |
| `rgba(10,10,24,0.24)` | botões flutuantes de header em retrospectiva/meso stories |
| `rgba(255,255,255,0.08)` | botão de compartilhar em stories retrospectivos |
| `rgba(0,229,255,0.12)` | indicador de seleção do `DateWheelPicker` |

### 8.4. Áreas fixas elevadas sobre conteúdo

| Cor | Aplicação histórica |
| --- | --- |
| `#0A0A18` | footer de `ManualWorkoutConfigScreen` |
| `#0F172A` | footer de `PlanPreviewScreen` |
| `#0F0F1E` | sticky footer de `BriefingScreen` e `SmartPlanScreen`; área fixa do onboarding |
| `#15152A` | área fixa de ação de `PrePaywallScreen` |
| `#0E0E1F` | footer de `TreadmillSetupScreen` |
| `rgba(255,255,255,0.80)` | bottom action de `StatsScreen` (`colors.white` com alpha `CC`) |

## 9. Síntese das inconsistências encontradas

O antigo sistema não era apenas uma paleta dark com variações intencionais. O código mostrava sobreposição de papéis:

1. **Cinco canvases concorrentes.** `#0A0A18`, `#0E0E1F`, `#0F0F1E`, `#0A0A14` e `#0F172A` atuavam como fundo-base sem uma regra por elevação ou fluxo.
2. **Dois cards principais para a mesma função.** `#1A1A2E` e `#1C1C2E` eram usados alternadamente como card principal, modal e opção.
3. **Elevação cromática inconsistente.** Em alguns fluxos uma sheet era mais escura que o canvas; em outros, mais clara; em outros, igual a um card interno.
4. **Backdrops fragmentados.** A mesma função variava entre 50%, 55%, 60%, 65%, 70% e 75% de preto.
5. **Estados cyan excessivamente variados.** Seleções semelhantes usavam alpha de 4%, 5%, 6%, 8%, 10%, 15% e 30%.
6. **Quebras claras dentro do dark mode.** Feedback e Stats mantinham cards brancos/pastel sobre canvas quase preto.
7. **Aliases duplicados.** `colors.card`, `DS.card`, `QUIZ.color.card`, `T.cardSurface`, `CARD_BG` e literais locais frequentemente descreviam o mesmo papel com valores diferentes.

## 10. Paleta histórica consolidada por função

Esta tabela resume as cores efetivamente encontradas, sem propor substituição.

| Função histórica | Valores encontrados |
| --- | --- |
| Canvas/tela | `#0A0A18`, `#0E0E1F`, `#0F0F1E`, `#0A0A14`, `#0F172A` |
| Card principal/elevado | `#1A1A2E`, `#1C1C2E` |
| Card profundo | `#15152A`, `#12121F`, `#13132A`, `#11151B`, `#0E0E1F` |
| Modal/sheet | `#1A1A2E`, `#1C1C2E`, `#15152A`, `#0E0E1F` |
| Menu/popover | `#1F1F38`, `#1C1C2E`, `#0E0E1F` |
| Backdrop | `rgba(0,0,0,0.50–0.75)` e overlays navy densos |
| Flutuante de tracking | navy com alpha de 72%, 78%, 85%, 92% e 94% |
| Seleção cyan | `rgba(0,212,255,0.04–0.30)` |
| Recuperação | `rgba(167,139,250,0.10)` e variações locais |
| Warning | amarelo/amber com alpha de 5% a 12% |
| Cards claros excepcionais | `#FFFFFF`, `#F5F3FF`, `#FFF7ED` |

## 11. Limitações e rastreabilidade

- O documento descreve o código exatamente no snapshot `1541466`; não descreve o estado atual.
- Linhas podem ter mudado após o snapshot. Para conferir uma aplicação histórica, usar `git show 1541466:<caminho>`.
- Expressões dinâmicas baseadas em dados, como cores de zonas, status ou fase, só entram quando atuavam claramente como background de card/superfície.
- Gradientes foram deliberadamente ignorados, mesmo quando eram a superfície principal de um componente.
- Nenhum arquivo de implementação foi modificado durante esta auditoria.

