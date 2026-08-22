# RunEasy Dark UI Guidelines

_Atualizado em 22/08/2026 — baseline de produto para a Fase 2._

## Direção visual

Minimalismo atlético premium: canvas near-black contínuo, profundidade por pequenas
variações tonais, tipografia forte e dados como protagonistas. Cyan comunica ação,
seleção, progresso ou atividade ao vivo; nunca funciona como borda ou glow decorativo.

Esta guideline substitui a espera por tokens do Figma. O código em
`mobile/src/theme` é a fonte de verdade até uma futura reconciliação com o design.

## Referências de mercado

- Runna: canvas quase preto, cards discretos e accent reservado a treino/progresso.
  https://apps.apple.com/us/app/runna-running-plans-coach/id1594204443
- Strava: charcoal próximo, ícones outline inativos, orange só em seleção, rota e CTA.
  https://apps.apple.com/us/app/strava-run-bike-walk/id426826309
- Strava Dark Mode: comportamento acompanha o sistema.
  https://support.strava.com/en-us/articles/15401628-dark-mode-on-strava
- Apple HIG: dark mode, cor, ícones e acessibilidade.
  https://developer.apple.com/design/human-interface-guidelines/dark-mode
  https://developer.apple.com/design/human-interface-guidelines/color
  https://developer.apple.com/design/human-interface-guidelines/icons
  https://developer.apple.com/design/human-interface-guidelines/accessibility

## Paleta semântica

### Neutros

- Canvas: `#050506` — fundo contínuo de telas.
- Surface 1: `#0D0D0F` — navegação e blocos discretos.
- Surface 2: `#141416` — cards e modais.
- Surface 3: `#1B1B1E` — controles elevados, seleção neutra e estados locais.
- Glass: `rgba(255,255,255,0.055)` — apenas navegação/overlay.
- Border subtle: `rgba(255,255,255,0.08)`.
- Border strong: `rgba(255,255,255,0.13)`.

A diferença entre canvas e surface deve ser curta. Não alternar navy, roxo e cinza
entre cards vizinhos. Cards são borderless por padrão; borda só quando delimitação é
necessária.

### Conteúdo

- Texto primário: `#F7F7F8`.
- Texto secundário: `#A7A7AE`.
- Texto terciário: `#7F7F88`.
- Accent: `#00D4FF`.
- Texto sobre accent: `#050506`.

Cyan é permitido em CTA, link, item selecionado, progresso e atividade ao vivo.
Seleções suaves usam `accentSubtle`; nada de shadow/glow cyan.

## Tipografia

Uma única família: Plus Jakarta Sans.

- Display: 36/42 ExtraBold.
- Title Large: 28/34 Bold.
- Title: 24/30 Semibold.
- Headline: 18/24 Semibold.
- Body: 16/24 Regular.
- Callout: 15/22 Medium.
- Caption: 13/18 Regular.
- Label: 12/16 Semibold.
- Data: 32/38 Bold com números tabulares.

Toda UI nova usa `AppText`. Textos críticos mantêm font scaling e evitam pesos Light.

## Layout

- Grid base de 8 pt.
- Margem horizontal de tela: 16–20 pt.
- Card padding: 16 pt.
- Gap entre cards: 16–24 pt.
- Seções: 32 pt ou mais.
- Touch target mínimo: 44×44 pt.
- Raio padrão: 16 pt; controles compactos: 8–12 pt; pill somente quando semântico.

Whitespace separa conteúdo antes de bordas. Evitar card colorido dentro de card colorido.

## Componentes

### Cards

Surface 2, raio 16, padding 16 e sem sombra visível. Use border subtle apenas em
modais, inputs ou quando duas superfícies adjacentes realmente precisarem de contorno.

### Botões

- Primary: accent, texto `textOnAccent`, sem glow.
- Secondary: Surface 3, texto primário.
- Ghost: transparente, texto/accent.
- Press: scale tokenizado via `AppPressable`.
- Disabled: sem haptic, sem scale e opacidade reduzida.

### Navegação

Glass limitado à tabbar, rail e controles flutuantes. Ícone outline quando inativo e
filled quando selecionado. Haptic `selection` somente quando o estado muda.

### Ícones

Ionicons modular exclusivamente através de `AppIcon`/`IconButton`.

- 20 pt em linhas densas.
- 24 pt padrão.
- 28 pt na navegação.
- 32/48 pt apenas em estados vazios e hero.
- Controles icon-only têm 44×44 pt e accessibilityLabel.
- Badges, gráficos, rotas, mapas, assets de marca e o puck de localização são exceções.

## Motion

- Instant 100 ms; fast 160 ms; standard 220 ms; deliberate 320 ms; modal 420 ms.
- Springs apenas para interação direta.
- Transform/opacity no UI thread; evitar height/top/left em listas.
- Respeitar Reduce Motion; nada funcional depende da animação.
- Haptics são semânticos e opt-in, nunca em todo toque.

## Acessibilidade

- Texto normal: contraste mínimo 4.5:1.
- Texto grande: mínimo 3:1.
- Estados nunca dependem apenas de cor.
- Icon-only sempre recebe label.
- Touch target mínimo 44×44 pt.
- Verificar contraste depois de blur/glass.

## Performance

No máximo uma camada principal de blur por tela e nunca glass aninhado em listas.
Testar tabbar e modais em Android intermediário. Novas animações usam Reanimated e
não atualizam estado React por frame.

## Proteção explícita

O puck de localização da tela de tracking, seus assets, geometria, cores, animações e
comportamento ficam fora de qualquer migração visual sem solicitação explícita.

