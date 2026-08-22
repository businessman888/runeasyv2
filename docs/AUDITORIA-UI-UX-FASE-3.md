# Auditoria UI/UX — Fase 3

_Data: 22/08/2026_

## Resultado

A migração dark premium foi ampliada para tracking, esteira, planejamento,
onboarding, modais, cards e telas secundárias. O recorte alterou 136 arquivos
sem modificar o puck de localização.

O código agora usa uma hierarquia curta:

- `semanticColors.canvas`
- `semanticColors.surface1`
- `semanticColors.surface2`
- `semanticColors.surface3`
- `semanticColors.borderSubtle` / `borderStrong`
- `semanticColors.textPrimary` / `textSecondary` / `textTertiary`

Cyan permanece somente em ação, seleção, progresso, rota e estado ao vivo.
Shadows e bordas cyan decorativos foram removidos.

## Áreas migradas

- Tracking em mapa e métricas expandidas.
- Corrida, resumo, processamento e esteira.
- Planejamento, metas, detalhe semanal e configuração manual.
- Onboarding, quiz, pré-paywall, pickers, sheets e modais.
- Readiness, evolução, stats, histórico, notificações, suporte e perfil.
- Cards Home, resultados, insights, upgrade, dispositivos e coach.
- Sharing, retrospectiva, stories e overlays legados.

## Calendário

O estado selecionado foi restaurado conforme o comportamento anterior:

- dia comum, planejado, concluído ou perdido: cyan;
- descanso/recuperação: roxo;
- ícone, forma e accessibility label mantêm o estado independente da cor.

## LevelCard

O gradiente agora usa `surface1 → surface2 → surface3`, com borda neutra e
sombra curta. Não há navy, roxo decorativo ou glow cyan.

## Motion

- 38 rotas do Native Stack usam transição de 220 ms.
- Rotas modais usam 320 ms e entrada inferior.
- Reduce Motion troca as transições por `none`.
- `AppPressable` usa scale + opacity em 160 ms.
- 25 instâncias de `AppPressable` cobrem tabbar, navegação do onboarding,
  botões das telas principais, FAB, cards e controles de ícone.
- 42 arquivos usam motion Reanimated para transições, feedback ou visualização.
- Backdrops invisíveis e gestos especiais permanecem sem escala.

## Exceções legítimas

Continuam fora da migração automática:

- puck, indicador de localização e seus assets;
- ícones e SVGs do onboarding;
- badges, patentes e assets de marca;
- gráficos, rotas, zonas, métricas e paletas de dados;
- cores semânticas de sucesso, alerta, erro, descanso e recompensas;
- sombras pretas/neutras necessárias para profundidade.

## Proteções automatizadas

`npm run design:check` bloqueia a reintrodução dos neutros dark legados.
A checagem exclui somente os arquivos protegidos do puck e fills/strokes SVG
do onboarding.

## Validação

- `npm run design:check`: aprovado.
- `npm run typecheck`: aprovado.
- `git diff --check`: aprovado.
- Shadows cyan decorativos: zero.
- Diff em arquivos/assets do puck: zero.
- Diff em linhas de ícone/SVG do onboarding: zero.
