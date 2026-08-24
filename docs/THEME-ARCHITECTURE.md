# Arquitetura de temas do RunEasy

## Estado atual

A base suporta `dark`, `light` e `system` com alternância em runtime. A cobertura de código foi auditada em 107 telas e 113 componentes, sem migrações pendentes detectáveis. O light mode continua no Dev Menu até a conclusão da matriz visual em iOS e Android.

## Fluxo

```text
themeStore (dark | light | system)
              ↓
        ThemeProvider
              ↓
tema ativo + React Navigation + runtimeVersion
              ↓
useAppTheme / useThemedStyles
              ↓
compatibilidade: createThemeObject + createThemeStyles
```

## Camadas

- `contracts.ts`: contrato tipado de cores e preferências.
- `semanticColors.ts`: paleta dark e alias reativo de compatibilidade.
- `lightColors.ts`: paleta light acessível.
- `themes.ts`: registry e adaptador do React Navigation.
- `ThemeProvider.tsx`: resolução do tema e contexto.
- `themeRuntime.ts`: ponte reativa para consumidores legados, StatusBar, blur e glass.
- `useThemedStyles.ts`: API preferida para código novo.
- `themeStore.ts`: preferência persistida.
- `mapTheme.ts`: paleta e preset do Mapbox.

## Regras de implementação

Código novo deve preferir `useAppTheme()` ou `useThemedStyles()`. `semanticColors`, `colors`, `QUIZ` e `mapViz` são compatíveis com alternância dinâmica, mas existem para migração gradual.

Não usar `StyleSheet.create` no escopo do módulo quando o objeto acessa tokens do tema. Use `createThemeStyles(() => ...)` em código legado ou estilos memoizados a partir de `theme` em código novo.

Migração cromática não autoriza alterar JSX, layout, copy, dimensões, espaçamentos ou comportamento.

## Papéis semânticos

Superfícies e conteúdo:

- `canvas`, `surface1`, `surface2`, `surface3`, `glass`;
- `fillSubtle`, `fillMuted`, `fillStrong`;
- `borderSubtle`, `borderStrong`;
- `textPrimary`, `textSecondary`, `textTertiary`;
- `textOnAccent`, `textOnMedia`, `textOnMediaMuted`;
- `scrim`, overlays, `shadow`, `transparent`.

Cores de mapas, zonas, badges, patentes, marcas e dados permanecem em paletas de domínio.

## Mapbox e puck

`ThemedMapStyle` aplica `lightPreset: day | night` ao import `basemap`. Rotas e overlays consomem `useMapThemePalette()`.

Os arquivos abaixo são invariantes e não podem ser migrados:

- `components/map/MapLocationPuck.tsx`;
- `components/map/UserLocationIndicator.tsx`.

## Guardrails

```bash
npm run typecheck
npm run theme:audit
npm run design:check
```

`theme:audit` verifica assinaturas do provider, StyleSheets estáticos, propriedades nativas fixas e arquivos visuais fora do design system. `design:check` controla neutros legados e a baseline de literais.

## Ativação de produção

1. concluir QA visual dark/light/system em iOS e Android;
2. validar contraste, modais, charts, estados e persistência;
3. confirmar Mapbox e puck em dispositivo real;
4. alterar `userInterfaceStyle` para `automatic`;
5. expor a preferência em Settings em uma mudança separada.
