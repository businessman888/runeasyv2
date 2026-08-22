# Auditoria técnica de UI/UX — RunEasy Mobile

Data: 22 de agosto de 2026  
Escopo: `runeasyv2/mobile`  
Status: diagnóstico e proposta; implementação visual pendente de validação no Figma

## Resumo executivo

O RunEasy já possui uma identidade reconhecível e uma boa base técnica: tema dark-first,
Plus Jakarta Sans carregada no bootstrap, React Navigation Native Stack, Reanimated 4,
Gesture Handler, Blur, Haptics e uma quantidade relevante de acessibilidade já aplicada.

O principal problema não é ausência de design; é a dispersão do design. Telas grandes criam
suas próprias cores, tipografia, ícones, cards e movimentos. Isso gera variações próximas,
mas não idênticas, e torna qualquer refinamento global caro e arriscado.

Nota HIG provisória, baseada no código: **6,0/10**.

| Eixo | Nota | Diagnóstico |
|---|---:|---|
| Clareza | 1,3/2 | Há hierarquia e conteúdo rico, mas muitos estilos locais e telas monolíticas dificultam consistência. |
| Deferência | 0,9/2 | Ciano em bordas, glows e superfícies compete com o conteúdo e reduz a sensação minimalista. |
| Profundidade/consistência | 1,0/2 | Blur e elevação existem, porém convivem com muitas variações de navy, card e glass. |
| Movimento | 1,4/2 | A base é forte, mas `Animated` e Reanimated coexistem sem tokens e o feedback tátil é raro. |
| Acessibilidade | 1,4/2 | Há labels, roles e redução de movimento em partes importantes, mas a aplicação não é sistêmica. |

As três ações de maior impacto são:

1. Criar uma camada real de primitives (`AppText`, `AppIcon`, `IconButton`, `Button`,
   `Surface/Card`, `Screen`, `Stack`) e impedir novos estilos visuais locais.
2. Migrar os neutros navy para uma escala near-black e remover borda/glow ciano de superfícies
   estáticas, reservando o ciano para ação, seleção e feedback.
3. Padronizar toda iconografia de interface em Ionicons por meio de um mapa semântico tipado,
   preservando badges, marcas, mapas, gráficos e ilustrações.

## Limite desta auditoria

As skills de frontend e UX/UI adotadas pelo projeto definem o Figma como fonte de verdade.
Não existe URL, file key ou node id do Figma no repositório ou na solicitação atual. Portanto:

- o inventário do estado atual é factual e baseado no código;
- os tokens abaixo são uma **proposta candidata**, não a fonte oficial;
- nenhuma alteração visual de produção deve ser considerada final antes da validação no Figma;
- a futura implementação deve começar pela extração de variables, text styles, component variants
  e motion do arquivo Figma.

## Inventário técnico

| Métrica | Resultado |
|---|---:|
| Arquivos de telas (`src/screens`) | 128 |
| Arquivos de componentes (`src/components`) | 112 |
| Componentes em `src/components/ui` | 8 |
| Telas que importam `components/ui` | 7 |
| Arquivos TSX totais em `src` | 217 |
| Ocorrências cruas de cor literal | 1.803 |
| Representações/valores literais únicos | 460 |
| Arquivos com cores literais | 180 |
| Telas com cores literais | 87 |
| Componentes com cores literais | 85 |
| Telas com texto | 93 |
| Telas com texto que usam `fonts.*` | 50 |
| Telas com texto sem `fonts.*` | 43 |
| Arquivos com `@expo/vector-icons` | 111 |
| Arquivos com Ionicons | 88 |
| Arquivos com MaterialCommunityIcons | 48 |
| Arquivos com `react-native-svg` inline | 30 |
| Assets `.svg` | 21 |
| Arquivos usando Reanimated | 55 |
| Arquivos usando React Native `Animated` | 66 |
| Arquivos usando Haptics | 2 |
| Arquivos com tratamento de Reduce Motion | 16 |

O typecheck de linha de base passa:

```text
npm run typecheck
tsc --noEmit -p tsconfig.json
exit code 0
```

## 1. Componentização e design system

### Estado atual

O tema central já define cores, fonte, escala de tamanhos, spacing, radius e sombras em
`src/theme/index.ts`. A adoção, porém, é parcial. Não foram encontrados primitives genéricos
de `Text`, `Button`, `Input` e `Card` que concentrem variantes, acessibilidade e motion.

Isso aparece na proporção entre 112 componentes especializados e apenas 8 componentes em
`components/ui`. Entre 93 telas com texto, só 50 aplicam os tokens de família da fonte.

Também há telas com responsabilidades excessivas:

| Arquivo | Linhas |
|---|---:|
| `CoachAnalysisScreen.tsx` | 2.084 |
| `running/RunSummaryScreen.tsx` | 2.067 |
| `HomeScreen.tsx` | 1.554 |
| `CalendarScreen.tsx` | 1.469 |
| `quiz/BriefingScreen.tsx` | 1.210 |
| `running/RunningScreen.tsx` | 1.107 |
| `treadmill/TreadmillSetupScreen.tsx` | 1.105 |

### Arquitetura-alvo

```text
src/design-system/
  tokens/
    colors.ts
    typography.ts
    spacing.ts
    radius.ts
    elevation.ts
    motion.ts
    iconography.ts
  primitives/
    AppText.tsx
    AppIcon.tsx
    IconButton.tsx
    PressableScale.tsx
    Button.tsx
    Surface.tsx
    Input.tsx
    Divider.tsx
  layout/
    Screen.tsx
    Stack.tsx
    Inline.tsx
  feedback/
    Skeleton.tsx
    EmptyState.tsx
    ErrorState.tsx
    Toast.tsx
```

Regras de governança:

- telas não criam novas cores, famílias, sombras ou springs;
- primitives concentram estados default, pressed, focused, loading, disabled e error;
- todo elemento tocável tem área mínima de 44×44 pt;
- `StyleSheet.create` e tokens centralizados substituem valores ad hoc;
- PRs novos não podem aumentar a contagem de cores literais fora de visualizações de dados,
  marcas ou assets aprovados.

## 2. Tipografia

### Estado atual

Plus Jakarta Sans já é carregada corretamente em cinco pesos em `App.tsx`, e os nomes são
centralizados em `src/theme/index.ts`. Entretanto, React Native exige `fontFamily` explícita
por peso para custom fonts; usar apenas `fontWeight` faz parte das telas cair na fonte do
sistema.

As 43 telas/partes de tela com texto sem `fonts.*` incluem:

```text
CoachAnalysis, Notifications, NotificationSettings, PersonalInfo,
PlanPreview, Ranking, Badges, Feedback, Evolution, Help,
CoachAudioSettings, ManualWorkoutConfig, WeekRow, WeekDetail,
PlanGoals, Running, RunSummary, Support, TrainingHistory, Stats,
Wellness, MesoStoryCards, WorkoutDetail, SharingModal,
ReadinessSuccess, ReadinessQuiz, ReadinessResult, Briefing,
RouteNoData, Frequency, Card01–04 de sharing, CountUp,
Limitations, quiz/PlanPreview, RecentDistance, SmartPlan,
Timeframe, WalkCapacity, Weight e DevMenu.
```

### Escala candidata

| Token | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| `display` | 36/42 | ExtraBold | Métrica principal e hero |
| `titleLarge` | 28/34 | Bold | Título de tela |
| `title` | 24/30 | SemiBold | Título de seção |
| `headline` | 18/24 | SemiBold | Card/list item |
| `body` | 16/24 | Regular | Corpo principal |
| `callout` | 15/22 | Medium | Informação compacta |
| `caption` | 13/18 | Regular | Metadados |
| `label` | 12/16 | SemiBold | Tabs, tags e labels |
| `data` | 32/38 | Bold + tabular nums | Pace, tempo, distância |

`AppText` deve escolher simultaneamente `fontFamily`, `fontSize`, `lineHeight`,
`letterSpacing`, `allowFontScaling` e `maxFontSizeMultiplier`. A fonte permanece Plus Jakarta
Sans; não há benefício em introduzir uma segunda família.

## 3. Cores e superfícies

### Problemas comprovados

- O tema se descreve e se comporta como dark navy (`#0A0A18`, `#1A1A2E`, `#15152A`).
- A navegação ainda força outro fundo (`#0F0F1E`).
- Existem pelo menos três grafias para o mesmo alpha de texto e dezenas de variações próximas.
- `textMuted #6B6B7B` tem contraste aproximado de 3,75:1 sobre `#0A0A18` e 3,26:1
  sobre `#1A1A2E`; não atende 4,5:1 para texto normal.
- O token `proGlassBorderCyan` é usado na tabbar e em várias superfícies.
- Bordas e sombras ciano aparecem em Calendar, Notifications, PersonalInfo, Running,
  TrainingHistory, cards de sharing, cards de treino e outros componentes.

### Paleta near-black candidata

Os valores precisam ser confirmados no Figma, mas a relação semântica deve ser preservada:

| Token candidato | Valor | Papel |
|---|---|---|
| `canvas` | `#050506` | Fundo raiz |
| `surface1` | `#0D0D0F` | Cards base |
| `surface2` | `#141416` | Card elevado/controle |
| `surface3` | `#1B1B1E` | Hover/pressed/selected sem accent |
| `surfaceGlass` | `rgba(255,255,255,0.055)` | Tint de glass |
| `borderSubtle` | `rgba(255,255,255,0.08)` | Hairline padrão |
| `borderStrong` | `rgba(255,255,255,0.13)` | Separação reforçada |
| `textPrimary` | `#F7F7F8` | Contraste 19,03:1 no canvas |
| `textSecondary` | `#A7A7AE` | Contraste 8,52:1 no canvas |
| `textTertiary` | `#7F7F88` | Metadados; 4,64:1 sobre `surface2` |
| `accent` | `#00D4FF` | Ações/seleção, não decoração |

Regras:

- remover borda ciano de cards e tabbar em repouso;
- usar `borderSubtle` nas superfícies que realmente precisam de contorno;
- preferir spacing a divisores quando a separação já é óbvia;
- reservar accent para ação, item selecionado, progresso ou feedback;
- não comunicar sucesso/erro/seleção apenas por cor;
- glass apenas na camada de navegação/controle, com no máximo 1–2 blurs simultâneos.

### Tabbar candidata

- fundo `surfaceGlass` sobre `canvas`, blur moderado e fallback sólido no Android;
- contorno neutro de 1 px ou apenas sombra neutra; nenhum contorno ciano;
- remover glow das linhas ativas e do botão central;
- ícone outline inativo e filled ativo;
- ciano apenas no ícone ativo ou em um tint de fundo de baixa opacidade;
- todos os itens com alvo 44×44, label de acessibilidade e haptic de seleção;
- avaliar retirar a elevação especial de Ranking para que as cinco tabs tenham o mesmo peso.

## 4. Iconografia

### Decisão recomendada

Usar **Ionicons como única gramática visual de interface**, por meio do pacote atual e
escopado `@react-native-vector-icons/ionicons` e de um wrapper semântico `AppIcon`.

Motivos:

- é o estilo explicitamente desejado;
- 88 arquivos já usam Ionicons, reduzindo custo e risco de migração;
- oferece pares outline/filled apropriados para estados inativo/ativo;
- o pacote escopado possui tipos TypeScript e plugin Expo;
- a documentação atual do Expo marca `@expo/vector-icons` como deprecated e recomenda
  a migração para `@react-native-vector-icons`.

O projeto usa dev client. A opção-alvo é import estático e plugin Expo, evitando duplicar a
fonte no bundle JS e no binário nativo.

### Comparação

| Biblioteca | Avaliação | Decisão |
|---|---|---|
| Ionicons/RNVI | Maior aderência ao app e pares outline/filled | **Escolhida** |
| Lucide React Native | Muito clean, SVG e stroke configurável, mas outline-first e mudança visual ampla | Boa alternativa, não misturar como fallback casual |
| Phosphor React Native | Pesos flexíveis, porém adiciona outra gramática e maior custo de migração | Não adotar neste ciclo |
| Material Symbols | Forte no Android, mas não atende a consistência cross-platform desejada no SDK atual | Reavaliar após upgrade de Expo |

### Padrão semântico

```ts
type AppIconName =
  | 'home'
  | 'calendar'
  | 'ranking'
  | 'wellness'
  | 'profile'
  | 'back'
  | 'close'
  | 'info'
  | 'settings'
  | 'sleep'
  | 'energy'
  | 'stress'
  | 'trainingLoad'
  | 'run'
  | 'walk'
  | 'trophy'
  | 'lock';

type AppIconState = 'default' | 'active' | 'disabled' | 'success' | 'warning' | 'danger';
```

O mapa central associa cada nome semântico a uma variante outline e filled. Telas não importam
o pacote de ícones diretamente.

Tamanhos permitidos: 16 (compact), 20 (inline), 24 (default), 32 (hero) e 48
(empty state). Ícone visual menor que 44 continua dentro de touch target 44×44.

### O que migrar

- todos os imports diretos de Ionicons, MaterialCommunityIcons e FontAwesome;
- SVGs inline que representam Calendar, Adjustment, Heart Rate, Sleep, Training Load,
  Energy, Stress, Walking, Running, Trophy, Lock/Unlock, Info, Backspace e Check;
- os ícones duplicados de `EvolutionScreen` e `ReadinessResultScreen` devem desaparecer em
  favor do mapa semântico.

### Exceções que permanecem SVG/imagem

- badges e shields;
- logotipos de Google, Apple, Strava e wearables;
- rotas de mapa, sparklines, radar, charts, progress rings e ruler;
- **puck indicador da posição do usuário na tela de tracking** - componente protegido fora
  do escopo de migração visual; não alterar asset, geometria, cor, animação, comportamento
  ou implementação sem solicitação explícita do responsável pelo produto;
- fundos decorativos, gradientes, patterns e ilustrações;
- assets de compartilhamento quando fazem parte do conteúdo exportado.

Os 21 assets `.svg` devem passar por uma checagem de uso. A busca estática não encontrou
imports de `src/assets/icons` ou `src/assets/quiz-icons`; eles são candidatos a assets mortos,
mas só podem ser removidos após confirmar `require()` dinâmico e fluxos de build.

## 5. Motion e microinterações

### Estado atual

O stack correto já existe, mas está fragmentado: 55 arquivos usam Reanimated e 66 usam o
`Animated` do React Native. Apenas DateWheelPicker e StepSlider usam Haptics. O tratamento
de redução de movimento existe em 16 arquivos, com várias implementações duplicadas.

React Navigation já usa Native Stack, que deve continuar responsável por transições de tela.
Shared Element Transitions permanecem experimentais e não devem entrar no caminho crítico.

### Motion tokens candidatos

```ts
export const motion = {
  duration: {
    instant: 100,
    fast: 160,
    normal: 220,
    slow: 320,
    story: 420,
  },
  spring: {
    press: { damping: 20, stiffness: 260, mass: 0.7, overshootClamping: true },
    layout: { damping: 20, stiffness: 180, mass: 0.9 },
    celebrate: { damping: 14, stiffness: 210, mass: 0.8 },
  },
  scale: {
    buttonPressed: 0.98,
    cardPressed: 0.985,
    iconPressed: 0.94,
  },
};
```

### Mapa de interação

| Interação | Resposta |
|---|---|
| Botão primário | scale 0,98 imediato, opacity/tint sutil, haptic light no commit |
| Card navegável | scale 0,985, surface sobe um nível, sem glow |
| Tab | filled icon + tint/posição curta, haptic selection |
| Toggle/segmented | indicador com spring layout + haptic selection |
| Sucesso | layout/fade curto + notification success, sem animação longa |
| Erro | tint/ícone/texto + notification error; shake apenas em validação local |
| Lista | layout animation apenas quando item entra/sai, sem stagger em listas longas |
| Modal/sheet | slide_from_bottom nativo e saída na direção inversa |
| Loading | skeleton; movimento desativado em Reduce Motion |

Implementar um único `useReducedMotion`/provider. Em Reanimated, usar
`ReduceMotion.System`; para Lottie, typing effects e outros sistemas, usar o mesmo estado
central. Animar preferencialmente `transform` e `opacity`, não width/height/top/left.

## 6. Backlog priorizado

### P0 — Fundação e segurança de migração

1. Receber o link do Figma e extrair tokens/variants reais.
2. Congelar introdução de novas cores, fontes e imports diretos de icon packs.
3. Criar tokens semânticos e primitives `AppText`, `AppIcon`, `IconButton`, `Button`,
   `Surface` e `PressableScale`.
4. Adicionar testes unitários/visuais de variants e acessibilidade dos primitives.
5. Manter `npm run typecheck` verde.

Critério de saída: toda UI nova usa somente primitives e tokens.

### P1 — Migração visível

1. Migrar tabbar e headers.
2. Remover bordas/glows ciano de cards em repouso.
3. Migrar as 43 telas sem fonte premium explícita via `AppText`.
4. Migrar imports diretos de ícones e SVGs de interface para `AppIcon`.
5. Centralizar Haptics e Reduce Motion.

Critério de saída: zero import direto de icon pack em screens; zero card/tabbar estático com
borda ciano; zero tela textual fora de `AppText` salvo exceção documentada.

### P2 — Refino estrutural

1. Decompor as telas acima de 1.000 linhas em presentation components e hooks.
2. Normalizar loading/error/empty/success.
3. Auditar contraste e touch targets em device real.
4. Testar blur/motion em Android intermediário e iPhone com 120 Hz.
5. Criar catálogo Storybook ou tela interna de design system.

Critério de saída: auditoria HIG ≥8/10 e regressão visual aprovada no Figma.

## 7. Gates de validação

- Figma: tokens e componentes conferidos pixel a pixel.
- TypeScript: `npm run typecheck`.
- Acessibilidade: VoiceOver/TalkBack, font scale 1,3×, Reduce Motion e contraste WCAG AA.
- Devices: iPhone SE, iPhone Pro Max e Android intermediário.
- Performance: 60 fps nas interações usuais, sem mais de 1–2 blurs simultâneos.
- Visual regression: screenshots das telas Home, Calendar, Ranking, Wellness, Settings,
  onboarding, running e summary.

## Referências técnicas

- Expo Icons: https://docs.expo.dev/guides/icons/
- RN Vector Icons migration: https://github.com/oblador/react-native-vector-icons/blob/master/MIGRATION.md
- RN Vector Icons Expo setup: https://github.com/oblador/react-native-vector-icons/blob/master/docs/SETUP-EXPO.md
- Lucide React Native: https://lucide.dev/guide/packages/lucide-react-native
- Reanimated accessibility: https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/
- Reanimated performance: https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/
- React Navigation Native Stack: https://reactnavigation.org/docs/native-stack-navigator/
- Expo Haptics: https://docs.expo.dev/versions/latest/sdk/haptics/


## 8. Status de implementação

Primeiro lote P0/P1 iniciado em 22/08/2026:

- adicionados tokens semânticos de cores, tipografia, iconografia e motion;
- adicionadas as primitives `AppText`, `Surface`, `AppIcon`, `IconButton` e
  `AppPressable`;
- centralizados Reduce Motion e haptics opt-in;
- instalado `@react-native-vector-icons/ionicons` e configurado seu plugin Expo;
- migradas a tabbar inferior e o side rail para borda neutra, sem glow ciano,
  com ícones outline/filled e haptic apenas na mudança efetiva de aba;
- `@expo/vector-icons` mantido temporariamente somente para a migração gradual;
- typecheck e Expo config validados;
- puck de localização e respectivos assets permanecem intocados e fora do escopo.
