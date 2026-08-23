# Arquitetura de temas do RunEasy

## Estado atual

A fundação continua dark-first e preserva visualmente o tema aprovado. O registry
contém `darkTheme` e `lightTheme`; a preferência persistida continua `dark` e o
tema claro fica disponível inicialmente apenas no Dev Menu para validação.

O light mode não deve ser exposto em Configurações de produção antes de:

1. a matriz de contraste dos dois temas ser validada em dispositivos reais;
2. `userInterfaceStyle` mudar de `dark` para `automatic`;
3. os componentes prioritários deixarem de importar o alias estático legado;
4. mapas, gráficos, modais, glass e estados especiais passarem pela QA visual.

## Camadas

- `contracts.ts`: contrato compartilhado de cores e preferências.
- `semanticColors.ts`: valores do dark atual e alias temporário de compatibilidade.
- `lightColors.ts`: paleta light candidata, validada incrementalmente no Dev Menu.
- `themes.ts`: registry de temas e adaptador para React Navigation.
- `ThemeProvider.tsx`: resolução da preferência do usuário e do sistema.
- `themeStore.ts`: preferência persistida `system | dark | light`.

## Regra para componentes

Código novo ou migrado deve consumir `useAppTheme()`. O alias
`semanticColors` existe apenas para permitir migração incremental sem mudanças
visuais em massa.

A migração cromática não autoriza trocar wrappers, JSX, dimensões, espaçamentos,
tipografia ou comportamento interativo. Os estilos devem ser criados a partir do
tema mantendo todas as propriedades não cromáticas intactas.

## Cores de domínio e exceções

Cores de mapas, zonas, gráficos, badges, patentes e marcas devem permanecer em
paletas próprias e documentadas. Elas não substituem cores de superfície ou
texto do tema.

O puck e o indicador de posição do usuário são invariantes e ficam fora de
qualquer migração de tema. Ícones ilustrativos do onboarding também preservam
sua composição e paleta interna; somente as superfícies ao redor deles podem
responder ao tema.

## Mapbox

`ThemedMapStyle` centraliza o Style URL e aplica `lightPreset: day | night`
ao import `basemap` do Mapbox Standard. O ID pode ser sobrescrito por
`EXPO_PUBLIC_MAPBOX_BASEMAP_IMPORT_ID` sem alterar os componentes.

`useMapThemePalette()` controla somente rotas, halo, trilhas e parques. Os
valores do dark preservam a aparência anterior; o light usa o accent com
contraste adequado ao basemap claro.

O puck e o indicador de localização não consomem essa paleta.


## Proteção contra novos hardcodes

`npm run design:check` valida tanto os neutros legados quanto a baseline de
literais existente. Qualquer cor nova, removida ou cuja contagem mude exige
decisão explícita.

Ao migrar um grupo de arquivos:

1. substituir os literais por tokens;
2. executar `npm run design:update-baseline`;
3. revisar a redução registrada em `scripts/design-color-baseline.json`;
4. executar novamente `npm run design:check`.

A baseline não transforma hardcodes em tokens; ela é um mecanismo temporário
para impedir que a dívida aumente durante a migração.
## Sequência para habilitar light mode

1. Consolidar os hardcodes residuais em tokens ou paletas de domínio.
2. Migrar componentes compartilhados para `useAppTheme()`.
3. Validar `lightTheme` em Dev Menu com a mesma interface de `darkTheme`.
4. Validar contraste, glass, mapas, gráficos, modais e estados.
5. Alterar a configuração nativa para `automatic`.
6. Expor a preferência na tela de Configurações.

