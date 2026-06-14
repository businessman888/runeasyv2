# TABLET_RESPONSIVENESS_PLAN.md

Plano vivo da adaptação do **RunEasy** para tablets Android e iPad. Atualizado durante a execução.

> **Princípio inviolável:** Phone **nunca** muda. Todo código novo é aditivo e só ativa quando `isTablet === true`. Em phone, todos os branches caem no caminho atual idêntico (pixel-perfect).

---

## 1. Sistema de breakpoints

Hook central `useBreakpoint()` (`src/hooks/useBreakpoint.ts`), baseado em `useWindowDimensions()` (reativo a rotação, split-view Android e Stage Manager iPad — **não** usa `Dimensions.get` estático).

| Flag             | Condição              | Alvo de device                    |
| ---------------- | --------------------- | --------------------------------- |
| `isPhone`        | `width < 600`         | Celulares                         |
| `isTablet`       | `width >= 600`        | Tablet 7"+ / iPad                 |
| `isLargeTablet`  | `width >= 840`        | Tablet 10"+ / iPad 11"+           |
| `isLandscape`    | `width > height`      | Qualquer device deitado           |
| `scale`          | 1 / 1.15 / 1.22       | Multiplicador de tipografia       |

Breakpoints em dp curto seguindo Material Design (phone <600, tablet 7" 600–839, tablet 10" 840+).

---

## 2. Tema responsivo

`src/theme/responsive.ts` (helpers puros — **não** altera `theme/index.ts`):

- `responsiveFont(size, scale)` → `Math.round(size * scale)`.
- `responsiveSpacing(value, isTablet)` → paddings/margins ~1.4x em tablet ("respiro").
- `contentMaxWidth(width, isTablet)` → largura máx. de coluna de leitura (~720) p/ formulários/quiz não esticarem linha.
- `gridColumns(width)` → nº de colunas (1 phone, 2 tablet, 3 largeTablet landscape).
- `useResponsiveTheme()` → combina breakpoint + helpers, devolve `{ font, space, columns, maxWidth, ...flags }`.

---

## 3. Estratégias por tela

| Tela / Componente        | Estratégia em tablet                                                        |
| ------------------------ | -------------------------------------------------------------------------- |
| **CustomTabBar**         | Phone/tablet portrait: pill atual (sem `maxWidth: 360` em tablet). Landscape: **side rail** vertical à esquerda. |
| **HomeScreen**           | Grid 2-col dos cards em landscape; header/FAB escalados.                    |
| **CalendarScreen**       | **Master-detail**: calendário grande + painel do dia lado a lado (landscape). |
| **RankingScreen**        | Pódio centralizado; leaderboard 2-col; carousel com item width derivado.    |
| **WellnessScreen**       | `PerformanceGrid` 2 → 3–4 colunas; charts com largura reativa.              |
| **RunningScreen (GPS)**  | Landscape: mapa ~65% + painel de métricas como coluna lateral fixa.        |
| **RunSummaryScreen**     | **Master-detail**: mapa + stats/splits/chart lado a lado (landscape).      |
| **SettingsScreen**       | Lista centralizada com `maxWidth`; avatar/linhas escalados.                |
| **Onboarding / Quiz**    | Wrapper `QuizLayout`/opções com `centered` + grid 2-col de opções.         |
| **Listas longas**        | FlashList `numColumns` reativo: TrainingHistory, Notifications, PlanGoals.  |

### Listas → FlashList multi-coluna
Migram para `@shopify/flash-list` com `numColumns` reativo (1 phone / 2–3 tablet): `TrainingHistoryScreen`, `NotificationsScreen`, `plan-goals/PlanGoalsScreen`.

> **Ressalva 1 — BadgesScreen NÃO migra.** `BadgesScreen.tsx` permanece em `ScrollView` (catálogo fixo/bounded de ~29 itens — decisão arquitetural registrada). Em tablet, apenas mais colunas no grid via `gridColumns`, sem trocar o container.

---

## 3.1 Desvios registrados durante a execução

- **Telas de quiz não usam `QuizLayout`.** As 33 telas em `screens/quiz/` montam o próprio layout com `onboarding/QuizHeader` + `onboarding/SelectableOption`. A centralização em tablet foi feita no **`SelectableOption`** (capa/centraliza a coluna de opções em 6+ telas) e no `QuizLayout` (mantido por completude). Centralizar título/header de cada tela individualmente fica como refinamento por tela.
- **TrainingHistory não migrou p/ FlashList.** É `ScrollView` com `.map` agrupado por data (seções). Foi apenas **centralizado** (`ScreenContainer centered`).
- **FlashList revertido p/ FlatList (Notifications + PlanGoals).** O FlashList v2 **não aplica `gap` do `contentContainerStyle`** entre itens reciclados → quebrou o espaçamento dos cards no **phone** (regressão) e não tem `columnWrapperStyle` p/ gap entre colunas. Solução: voltar ao `FlatList` com `numColumns` reativo + `columnWrapperStyle` (gap horizontal no tablet) + item `flex:1`. Phone volta a ser idêntico (gap via `contentContainerStyle`). `@shopify/flash-list` segue instalado mas atualmente sem uso.
- **LandingScreen:** a escala era baseada em `Dimensions` cru (375×812) → em tablet estourava (a imagem `bleed` virava um quadrado do tamanho da tela, escondendo o conteúdo). Corrigido capando a base de escala em ~440×950 (`BASE_W`/`BASE_H`): phone idêntico, tablet em tamanho de phone centralizado.
- **RunningScreen (GPS):** primeira versão deixava o painel flutuando solto sobre o mapa (parecia desconexo). Ajustado p/ split real: mapa ~65% à esquerda + painel sólido ~35% à direita ancorado embaixo.

## 4. Inconsistências encontradas no código atual (a padronizar ao tocar cada tela)

- `Dimensions.get('window')` **estático a nível de módulo** em ~18 arquivos (LoginScreen, LandingScreen, GoalsModal, FixedNavigationButtons, PatentCarousel, SplashScreen, vários quiz). Não reage a rotação/multi-window → trocar por `useWindowDimensions`/`useBreakpoint` **nas telas que forem adaptadas**.
- Grids hardcoded em `'48%'` (ex.: `wellness/PerformanceCard`) → usar `gridColumns`.
- `maxWidth: 360` na `CustomTabBar` → condicional a phone/portrait.
- Várias dimensões fixas (CustomTabBar, CustomCalendar, HomeFab, HomeFixedHeader, QuizLayout, CustomKeypad) → escalar via `scale`/`responsiveSpacing` só em tablet.

---

## 5. Orientação

- `app.config.js`: `ios.supportsTablet: true`, `orientation: "default"`.
- Lock por device em runtime (`App.tsx` + `expo-screen-orientation`): `isPhone` → `lockAsync(PORTRAIT_UP)`; tablet → `unlockAsync()`. Roda **antes** do primeiro render para o phone nunca piscar deitado.

---

## 6. Ordem de implementação

**Fase 1 — Infra (faz primeiro, tudo depende):**
1. `hooks/useBreakpoint.ts`
2. `theme/responsive.ts`
3. `app.config.js` (supportsTablet + orientation)
4. `App.tsx` (lock por device)
5. `ScreenContainer.tsx` (prop `centered`)
6. `CustomTabBar.tsx` + `AppNavigator.tsx` (side rail)
7. Deps: `expo-screen-orientation`, `@shopify/flash-list` + `tsc --noEmit`

**Fase 2 — Telas-chave (impacto nas screenshots), uma a uma:**
1. HomeScreen → 2. CalendarScreen → 3. RankingScreen → 4. WellnessScreen → 5. RunningScreen (GPS) → 6. RunSummaryScreen → 7. SettingsScreen → 8. Onboarding/Quiz.
FlashList migra junto da respectiva tela.

---

## 7. Pré-requisitos de build/submit (Fase 7 — futura)

> **Ressalva 2 — screenshots de iPad.** Ativar `ios.supportsTablet: true` **não bloqueia** a implementação, mas faz a submissão iOS passar a **exigir screenshots de iPad 12.9" (2048×2732px)**. Sem esses assets, o App Store Connect **rejeita o envio**. Gerar os screenshots nas telas-chave já adaptadas **antes** do build de produção + submit.

Assets de screenshot exigidos quando `supportsTablet: true`:
- iPad 12.9" (6th gen): **2048×2732px** (obrigatório).
- (iPhone 6.7"/6.5" continuam exigidos como hoje.)

---

## 8. Verificação

- `npm install` + `npx tsc --noEmit` (TS estrito, sem `any`).
- **Phone não regrediu (crítico):** emulador phone portrait pixel-idêntico ao atual; rotação deve permanecer travada em portrait.
- **Tablet portrait/landscape:** Android tablet (Pixel Tablet/Nexus 10) + iPad simulator: rotação livre, side rail em landscape, grids multi-coluna, master-detail (Calendar/RunSummary), GPS com painel lateral, sem conteúdo esticado.
- Touch targets ≥44px (≥48 em tablet); estados loading/error/empty/success preservados; safe area com notch/Dynamic Island em landscape.
