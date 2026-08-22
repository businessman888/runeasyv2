# Arquitetura de temas do RunEasy

## Estado atual

A fundação é dark-first e preserva visualmente o tema aprovado. O registry contém
somente `darkTheme`; preferências `light` e `system` já fazem parte do contrato,
mas resolvem com fallback seguro para dark enquanto a paleta light não existir.

O light mode não deve ser exposto em Configurações antes de:

1. existir um `lightTheme` completo que satisfaça `AppTheme`;
2. a matriz de contraste dos dois temas ser validada;
3. `userInterfaceStyle` mudar de `dark` para `automatic`;
4. os componentes prioritários deixarem de importar o alias estático legado.

## Camadas

- `contracts.ts`: contrato compartilhado de cores e preferências.
- `semanticColors.ts`: valores do dark atual e alias temporário de compatibilidade.
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
3. Criar `lightTheme` com a mesma interface de `darkTheme`.
4. Validar contraste, glass, mapas, gráficos, modais e estados.
5. Alterar a configuração nativa para `automatic`.
6. Expor a preferência na tela de Configurações.

