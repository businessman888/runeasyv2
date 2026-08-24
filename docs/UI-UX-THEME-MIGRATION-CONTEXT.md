# RunEasy — Contexto da evolução de UI/UX e temas

> Última atualização: 23 de agosto de 2026  
> Status: cobertura de código dark/light concluída; light mode em prévia de desenvolvimento e QA visual  
> Objetivo: registrar decisões, implementações, restrições, validações e próximos passos desta frente para que qualquer continuação preserve o que já foi aprovado.

## 1. Resumo executivo

Esta frente elevou a base visual do aplicativo RunEasy para um design mais clean, minimalista e premium, com foco inicial no dark mode e preparação arquitetural para light mode.

O trabalho incluiu:

- auditoria de componentes, tipografia, cores, ícones, navegação e microinterações;
- consolidação do dark mode em uma paleta próxima ao preto, reduzindo contrastes excessivos entre superfícies;
- remoção de bordas cyan decorativas de cards e tab bar onde não comunicavam estado;
- padronização da tipografia em Plus Jakarta Sans;
- adoção de Ionicons e de uma camada semântica de iconografia;
- criação de contratos, temas e provider para suportar `dark`, `light` e `system`;
- criação de um primeiro light mode coerente e acessível, ainda restrito à prévia de desenvolvimento;
- tematização do Mapbox em tempo de execução usando o mesmo style e alternando o preset do basemap;
- migração integral dos consumidores visuais para responder à alternância em runtime;
- auditoria automática de 107 telas e 113 componentes, sem violações pendentes;
- guardrails para detectar novos literais de cor e regressões do design system;
- restauração de componentes cuja composição havia sido alterada indevidamente durante uma etapa de tokenização.

O dark mode deve continuar sendo a experiência visual de produção. O light mode existe como fundação e prévia interna até que todas as telas sejam migradas e validadas visualmente.

## 2. Objetivos estabelecidos

Os objetivos definidos ao longo da conversa foram:

1. Mapear a componentização, o design system, as fontes e as inconsistências visuais.
2. Auditar oportunidades de melhoria de UI/UX.
3. Padronizar ícones vetoriais com Ionicons nas telas principais, preservando badges e ilustrações com identidade própria.
4. Padronizar a fonte premium em todo o aplicativo.
5. Mapear e tokenizar cores neutras, fundos, superfícies, textos, bordas e estados.
6. Aproximar o dark mode de um preto sofisticado, com menos alternância extrema entre superfícies.
7. Remover bordas cyan meramente decorativas de cards e tab bar.
8. Mapear e aplicar microinterações suaves em botões e navegação.
9. Estender o design system a telas secundárias, modais, tracking, esteira, planejamento e onboarding.
10. Preparar a arquitetura para um light mode futuro sem alterar a aparência aprovada do dark mode.
11. Tornar o mapa compatível com os dois temas por código, sem exigir styles duplicados no painel do Mapbox.

## 3. Restrições e decisões inegociáveis

Estas regras devem ser respeitadas por qualquer implementação futura.

### 3.1. Não alterar a composição dos componentes ao migrar cores

Uma migração cromática pode alterar apenas propriedades visuais relacionadas ao tema, como:

- background;
- border color;
- text color;
- icon color;
- gradient colors;
- tint de blur;
- cores de overlays e estados.

Ela não autoriza alterar:

- árvore JSX;
- wrappers;
- layout;
- dimensões;
- espaçamento estrutural;
- posição de elementos;
- copy;
- fluxo de interação;
- comportamento de botões;
- estados de negócio.

Se uma mudança estrutural for desejável, ela deve ser apresentada e aprovada separadamente.

### 3.2. Puck de localização do usuário é intocável

Não modificar:

- `mobile/src/components/map/MapLocationPuck.tsx`;
- `mobile/src/components/map/UserLocationIndicator.tsx`;
- assets associados ao indicador de posição do usuário;
- aparência, animação, escala, direção, halo ou lógica do puck.

A tematização do mapa deve excluir explicitamente esses elementos.

### 3.3. Exceções de iconografia

- Badges, patentes e símbolos de gamificação com identidade própria não devem ser substituídos por Ionicons.
- Ícones ilustrativos do onboarding devem permanecer intactos.
- Cores de dados, rotas, zonas, estados esportivos e elementos cartográficos podem constituir paletas de domínio, não cores genéricas de UI.

### 3.4. Comportamento selecionado do calendário

O comportamento visual aprovado e restaurado é:

- dia comum ou dia de treino selecionado: cyan;
- dia de descanso selecionado: roxo.

Esse comportamento representa semântica de produto e não deve ser neutralizado por uma migração de tema.

### 3.5. Dark mode não pode regredir

A criação do light mode deve ser aditiva. A aparência do dark mode já aprovada deve permanecer visualmente equivalente durante a migração arquitetural.

### 3.6. Figma não é bloqueador

Foi decidido explicitamente não aguardar tokens do Figma. A evolução pode usar o código atual, as referências de produto e os princípios das skills de UI/UX. Uma futura sincronização com Figma deve reconciliar o que existe, não bloquear esta implementação.

## 4. Skills e metodologia utilizadas

A skill `react-native-design` foi instalada e utilizada como referência principal para styling, navegação e animações em React Native.

Também foram usadas, conforme a etapa:

- `frontend-mobile` para arquitetura e implementação React Native/Expo;
- `ux-ui-figma` para consistência de design system, acessibilidade e estados;
- `apple-hig-design` para clareza, hierarquia, tipografia, materiais e motion;
- `clean-code` para organização e manutenção da camada de tema;
- referências de performance e animação React Native quando aplicáveis.

As auditorias e refinamentos iniciais foram executados com subagentes em paralelo, conforme solicitado. As decisões foram consolidadas antes de serem aplicadas.

## 5. Linha do tempo do trabalho realizado

### Fase 1 — Auditoria e fundações visuais

Foi feito um mapeamento inicial de:

- componentes compartilhados;
- estilos duplicados;
- literais de cor;
- fontes inconsistentes;
- SVGs usados como ícones genéricos;
- bordas cyan decorativas;
- superfícies escuras com contraste excessivo;
- pontos de interação candidatos a microanimações.

Resultados principais:

- Plus Jakarta Sans definida como família tipográfica principal;
- introdução de uma API semântica de iconografia;
- adoção de Ionicons em componentes e telas principais;
- preservação de badges, patentes e ilustrações proprietárias;
- dark mode aproximado de uma base quase preta e com superfícies mais próximas entre si;
- redução do uso de cyan como ornamento, reservando-o para marca, ação, foco e estados semânticos;
- fundação de componentes pressionáveis e preferências de motion.

### Fase 2 — Ampliação da tokenização

A aplicação dos tokens foi ampliada para áreas que ainda mantinham cores antigas ou hardcoded, incluindo:

- telas e modais secundários;
- tracking em modo expandido e mapa;
- fluxos relacionados à esteira;
- planejamento;
- onboarding, apenas em cores;
- card de level, com gradiente mais discreto e premium;
- calendário, preservando a semântica cyan/roxo de seleção.

### Incidente de regressão e reparo

Durante uma etapa de tokenização, alguns componentes tiveram composição alterada, apesar de a solicitação ser exclusivamente cromática.

As regressões identificadas foram:

- tab `Meu cohort | Global` da tela de ranking;
- botão/CTA do card de treino;
- card de próximo treino previsto e composição de recuperação no calendário.

Esses elementos foram restaurados ao comportamento e à composição anteriores. A partir desse incidente, foi estabelecida a regra formal de comparar a estrutura JSX antes e depois de migrações de tema.

### Fase 3 — Arquitetura preparada para múltiplos temas

Foi criada uma camada de tema tipada e persistente, com suporte conceitual a:

- `dark`;
- `light`;
- `system`.

O dark continua sendo o padrão e o único modo de produção aprovado neste momento.

Arquivos centrais:

- `mobile/src/theme/contracts.ts`;
- `mobile/src/theme/themes.ts`;
- `mobile/src/theme/ThemeProvider.tsx`;
- `mobile/src/stores/themeStore.ts`;
- `mobile/src/theme/useThemedStyles.ts`;
- `mobile/src/theme/index.ts`;
- `mobile/src/theme/semanticColors.ts`.

Também foram adicionados:

- adaptação do tema para React Navigation;
- persistência da preferência `system | dark | light`;
- fallback seguro para dark;
- status bar e background raiz derivados do tema ativo;
- tokens semânticos de `success`, `warning`, `danger` e `info`;
- scripts para impedir crescimento não controlado de literais de cor.

### Fase 4 — Primeira migração de componentes compartilhados

Os seguintes componentes passaram a consumir o tema ativo:

- `AppIcon`;
- `AppText`;
- `IconButton`;
- `Surface`;
- `ScreenContainer`;
- `DiffuseHeaderSurface`;
- `FriendlyEmptyCard`;
- `SegmentedTabs`.

O resolvedor de tons dos ícones também passou a ser theme-aware.

A estrutura JSX dos oito componentes foi comparada para confirmar que a migração não alterou sua composição.

### Fase 5 — Light mode em prévia de desenvolvimento

Foi criada uma paleta clara e registrado um `lightTheme`. O Dev Menu recebeu controles de prévia para:

- Escuro;
- Claro;
- Sistema.

Essa escolha não foi exposta nas configurações de produção. A configuração nativa continua fixada em dark para impedir uma experiência híbrida antes da conclusão da migração.

### Fase 6 — Tematização do Mapbox

O projeto usa `@rnmapbox/maps` 10.2.10 e um style customizado baseado no Mapbox Standard/imports.

Foi adotado o caminho de um único style com preset dinâmico em runtime:

- dark: `lightPreset: 'night'`;
- light: `lightPreset: 'day'`.

Isso evita manter dois styles equivalentes no painel do Mapbox e mantém a decisão de tema dentro do projeto.

Foram centralizados:

- URL do style;
- import ID do basemap;
- fallback para Mapbox Standard;
- cores temáticas de rota, halo, trilhas e parques.

Os quatro MapViews reais foram cobertos:

- `RunningScreen.tsx`;
- `RunSummaryScreen.tsx`;
- `CoachAnalysisScreen.tsx`;
- `ResultRoutePreview.tsx`.

O puck de localização permaneceu sem qualquer alteração.

## 6. Estado atual do design system

### 6.1. Tipografia

A direção aprovada é usar Plus Jakarta Sans de forma consistente em todo o app.

O sistema deve privilegiar papéis semânticos, como:

- display;
- heading;
- body;
- label;
- caption;
- metric.

Telas que ainda declarem famílias, pesos ou tamanhos diretamente devem ser migradas de forma incremental, sem alterar a hierarquia visual aprovada.

### 6.2. Iconografia

A biblioteca principal para ícones genéricos é Ionicons.

A camada de padronização inclui:

- `mobile/src/theme/iconography.ts`;
- `mobile/src/components/ui/AppIcon.tsx`;
- `mobile/src/components/ui/IconButton.tsx`.

Princípios:

- usar nomes semânticos quando possível;
- centralizar tamanhos, tons e estados;
- evitar SVGs isolados para ações comuns;
- manter assets exclusivos quando carregam identidade do produto;
- garantir área mínima de toque e estados pressed/disabled.

A substituição foi aplicada nas principais áreas, mas uma auditoria final de todas as telas ainda é necessária antes de declarar cobertura total.

### 6.3. Paleta dark

A direção visual do dark mode é:

- canvas próximo ao preto;
- superfícies com variação sutil, não blocos radicalmente diferentes;
- bordas neutras de baixa opacidade;
- cyan reservado para ações, seleção e marca;
- roxo reservado para recuperação/descanso e usos semânticos;
- textos secundários e terciários com hierarquia clara;
- gradientes discretos e derivados das próprias superfícies.

O objetivo não é remover personalidade, e sim reduzir ruído visual e fazer cor intensa comunicar significado.

### 6.4. Paleta light proposta e implementada

| Papel semântico | Valor |
| --- | --- |
| Canvas | `#F6F7F8` |
| Surface 1 | `#FFFFFF` |
| Surface 2 | `#F1F3F5` |
| Surface 3 | `#E8EBEF` |
| Glass | `rgba(255,255,255,0.78)` |
| Border subtle | `rgba(17,19,24,0.08)` |
| Border strong | `rgba(17,19,24,0.14)` |
| Text primary | `#111318` |
| Text secondary | `#525761` |
| Text tertiary | `#6B717C` |
| Accent adaptativo | `#007C92` |
| Text on accent | `#FFFFFF` |
| Recovery | `#7042C1` |
| Success | `#087A55` |
| Warning | `#8A5A00` |
| Danger | `#C73737` |
| Info | `#1D64C8` |

O cyan de marca brilhante não foi usado como cor principal sobre branco porque não oferece contraste suficiente para texto e controles pequenos. No light mode, o accent adaptativo mais escuro preserva a identidade sem prejudicar a legibilidade.

Contrastes verificados:

| Combinação | Razão aproximada |
| --- | ---: |
| Text primary / canvas | 17.32:1 |
| Text secondary / canvas | 6.76:1 |
| Text tertiary / canvas | 4.58:1 |
| Accent / canvas | 4.56:1 |
| Text on accent / accent | 4.89:1 |
| Recovery / branco | 6.48:1 |

Arquivo da paleta:

- `mobile/src/theme/lightColors.ts`.

### 6.5. Tokens semânticos

Os contratos de tema devem representar intenção, e não cor física. Exemplos:

- `canvas`;
- `surface1`, `surface2`, `surface3`;
- `borderSubtle`, `borderStrong`;
- `textPrimary`, `textSecondary`, `textTertiary`;
- `accent`, `textOnAccent`;
- `recovery`;
- `success`, `warning`, `danger`, `info`.

Evitar nomes como `gray900` dentro de componentes de produto. Primitivos podem existir internamente, mas componentes devem consumir papéis semânticos.

## 7. Arquitetura de tema

Fluxo esperado:

```text
Preferência persistida (dark | light | system)
                    ↓
             ThemeProvider
                    ↓
        resolução do color scheme ativo
                    ↓
       tema tipado + tema de navegação
                    ↓
componentes compartilhados e telas migradas
```

Responsabilidades:

- `contracts.ts`: contrato tipado das cores e do tema;
- `themes.ts`: registro de temas e integração com navegação;
- `ThemeProvider.tsx`: resolução do tema ativo e entrega via contexto;
- `themeStore.ts`: persistência da preferência;
- `useThemedStyles.ts`: criação/memoização de estilos derivados do tema;
- `semanticColors.ts`: compatibilidade temporária com consumidores estáticos;
- `lightColors.ts`: paleta clara;
- `mapTheme.ts`: paleta cartográfica derivada do tema.

`semanticColors` é uma ponte reativa de compatibilidade. Ela acompanha o tema ativo junto com `createThemeStyles`, mas novos componentes devem preferir `useAppTheme()` ou `useThemedStyles()`.

## 8. Microinterações e motion

Foram mapeadas e introduzidas fundações para motion suave em:

- estado pressed de botões;
- feedback tátil/visual de ações;
- componentes pressionáveis compartilhados;
- transições de navegação;
- preferência de redução de movimento.

Direção aprovada:

- duração curta e discreta;
- easing natural;
- escala sutil, sem efeito de brinquedo;
- nenhuma animação deve atrasar uma ação;
- respeitar `reduce motion`;
- priorizar feedback de estado e continuidade espacial.

Ainda é necessária uma auditoria final tela a tela para confirmar cobertura, consistência e ausência de animações duplicadas.

## 9. Mapbox: implementação e decisões

### 9.1. Solução adotada

Foi criado:

- `mobile/src/components/map/ThemedMapStyle.tsx`;
- `mobile/src/theme/mapTheme.ts`.

`ThemedMapStyle` centraliza:

- `EXPO_PUBLIC_MAPBOX_STYLE_URL`;
- fallback `mapbox://styles/mapbox/standard`;
- import ID padrão `basemap`;
- override opcional `EXPO_PUBLIC_MAPBOX_BASEMAP_IMPORT_ID`;
- alternância `day/night` conforme o tema.

### 9.2. Camadas customizadas

As cores de rota e halo foram conectadas ao tema nos quatro mapas. Trilhas e parques de `OSMOverlayLayers.tsx` também receberam paleta temática.

No dark mode, a rota mantém o cyan já aprovado. No light mode, usa o accent `#007C92` para manter contraste adequado.

### 9.3. O que não foi alterado

- câmera;
- enquadramento;
- gestos;
- composição das camadas;
- lógica de tracking;
- puck/indicador de usuário;
- assets do puck.

### 9.4. Ponto de configuração a validar

O import ID padrão `basemap` segue o padrão do Mapbox Standard. Se o style customizado usar outro ID, definir:

```env
EXPO_PUBLIC_MAPBOX_BASEMAP_IMPORT_ID=identificador_do_import
```

Não foi possível confirmar o JSON remoto do style porque o ambiente local disponível continha token de download, mas não um `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` apropriado para essa consulta.

### 9.5. Compliance pendente

Foi identificado `attributionEnabled={false}` nos mapas. Antes da publicação, é necessário confirmar se atribuição e acesso à telemetria estão disponíveis em outro local da UI, de acordo com os requisitos do Mapbox/RNMapbox.

## 10. Guardrails e validações

Foram criados:

- `mobile/scripts/check-design-tokens.js`;
- `mobile/scripts/check-color-literal-baseline.js`;
- `mobile/scripts/design-color-baseline.json`;
- `mobile/scripts/migrate-theme-runtime.js`;
- `mobile/scripts/audit-theme-coverage.js`.

Comandos:

```bash
cd mobile
npm run design:check
npm run design:update-baseline
npm run theme:audit
npm run typecheck
```

O baseline serve para impedir o crescimento de cores hardcoded enquanto a migração incremental elimina o estoque existente. Atualizá-lo não deve ser usado para simplesmente aceitar novos literais sem justificativa.

Validações executadas com sucesso no ponto atual:

- TypeScript/typecheck;
- `design:check`;
- `git diff --check`;
- comparação estrutural de 192 arquivos TSX, com zero divergências de composição;
- comparação estrutural dos quatro MapViews e das camadas OSM;
- confirmação de ausência de diff nos arquivos protegidos do puck;
- confirmação de correspondência entre os quatro MapViews reais e as quatro inserções de `ThemedMapStyle`.

## 11. Estado de conclusão por área

| Área | Estado | Observação |
| --- | --- | --- |
| Direção visual dark | Concluída como base | Deve permanecer sem regressão |
| Tipografia premium | Fundação aplicada | Auditoria final de telas ainda necessária |
| Iconografia Ionicons | Fundação + telas principais | Não declarar 100% até auditoria final |
| Tokens semânticos | Cobertura concluída | Compatibilidade reativa + API moderna |
| Componentes compartilhados | Cobertura concluída | Auditoria automática ativa |
| Light theme | Cobertura de código concluída | QA visual antes de produção |
| Seletor de tema | Apenas Dev Menu | Não exposto nas configurações do usuário |
| Configuração nativa | Dark | Manter até conclusão do light |
| Mapbox day/night | Implementado | Validar style import em dispositivo real |
| Puck de usuário | Preservado | Não tocar |
| Microinterações | Fundação parcial | Auditoria final necessária |
| Onboarding | Cores integradas | Ícones ilustrativos preservados |
| Regressões de composição | Restauradas | Guardrail obrigatório daqui em diante |

## 12. Limitações conhecidas

A cobertura de código do light mode foi concluída: 107 telas e 113 componentes são auditados, com zero violações e zero migrações automáticas pendentes. A alternância dinâmica cobre surfaces, cards, modais, onboarding, tracking, esteira, planejamento, charts, blur e status bar.

Permanecem como trabalho de liberação:

- validação visual completa em iOS e Android;
- cold start e persistência em `dark | light | system`;
- contraste, Dynamic Type, teclado, safe areas e reduce motion;
- compliance de atribuição do Mapbox;
- ativação nativa `automatic` e seletor em Settings em mudança separada.

## 13. Próximas fases recomendadas

### Lote 1 — Infraestrutura visual compartilhada

- navegação e tab bar;
- headers;
- modais, sheets e backdrops;
- blur/glass;
- botões, inputs, separators e feedback states;
- skeletons e estados vazios.

### Lote 2 — Fluxos principais

- Home;
- Calendário;
- Ranking;
- Wellness/readiness;
- Perfil e configurações.

### Lote 3 — Corrida e treino

- tracking;
- resumo da corrida;
- análise do coach;
- esteira;
- planejamento;
- detalhes e cards de treino.

### Lote 4 — Fluxos secundários

- onboarding, somente cromático;
- modais de suporte;
- notificações;
- gamificação;
- charts e relatórios.

### Lote 5 — QA e ativação

- matriz de screenshots dark/light em iOS e Android;
- contraste WCAG de textos e controles;
- Dynamic Type e acessibilidade;
- reduce motion;
- teclado e safe areas;
- validação do Mapbox em dispositivo real;
- verificação dos componentes restaurados;
- somente depois, alterar `userInterfaceStyle` para `automatic` e expor o seletor em Settings.

## 14. Critérios para liberar light mode em produção

O light mode só deve ser considerado pronto quando:

- não houver telas híbridas dark/light nos fluxos suportados;
- componentes compartilhados consumirem o tema ativo;
- textos, ícones, borders e actions passarem em contraste;
- mapas alternarem day/night em iOS e Android;
- o import ID do style customizado estiver validado;
- onboarding preservar suas ilustrações;
- calendário preservar cyan/roxo na seleção;
- ranking, cards de treino e próximo treino manterem composição restaurada;
- puck permanecer idêntico;
- testes visuais e de interação passarem;
- configuração nativa e preferência persistida forem ativadas em uma mudança específica e revisável.

## 15. Como testar o estado atual

### Prévia do tema

Usar o Dev Menu para alternar entre:

- Escuro;
- Claro;
- Sistema.

O modo Claro é uma ferramenta de inspeção; telas ainda não migradas podem ficar inconsistentes.

### Verificações obrigatórias

1. Abrir ranking e confirmar `Meu cohort | Global` na composição original.
2. Abrir cards de treino e confirmar CTA, alinhamento e hierarquia originais.
3. Abrir calendário e confirmar:
   - treino/comum selecionado em cyan;
   - descanso selecionado em roxo;
   - próximo treino e recuperação com composição original.
4. Abrir onboarding e confirmar ilustrações intactas.
5. Abrir tracking, resumo, análise e preview de rota em dark e light.
6. Confirmar que o basemap alterna entre night/day.
7. Confirmar que rota, trilhas e parques mantêm contraste.
8. Comparar o puck em ambos os temas e confirmar que está idêntico.

### Prebuild/dev build

Quando uma alteração nativa realmente exigir novo prebuild:

```bash
cd mobile
npm run prebuild:clean
```

Equivalente:

```bash
cd mobile
npx expo prebuild --clean
```

As alterações atuais de tema e Mapbox são majoritariamente JavaScript/TypeScript e não exigem novo prebuild se o dev build já contém a versão instalada de `@rnmapbox/maps`.

## 16. Arquivos-chave

### Tema

- `mobile/src/theme/contracts.ts`
- `mobile/src/theme/themes.ts`
- `mobile/src/theme/ThemeProvider.tsx`
- `mobile/src/theme/lightColors.ts`
- `mobile/src/theme/semanticColors.ts`
- `mobile/src/theme/useThemedStyles.ts`
- `mobile/src/theme/iconography.ts`
- `mobile/src/theme/mapTheme.ts`
- `mobile/src/stores/themeStore.ts`

### Componentes compartilhados migrados

- `mobile/src/components/ScreenContainer.tsx`
- `mobile/src/components/ui/AppIcon.tsx`
- `mobile/src/components/ui/AppText.tsx`
- `mobile/src/components/ui/IconButton.tsx`
- `mobile/src/components/ui/Surface.tsx`
- `mobile/src/components/ui/DiffuseHeaderSurface.tsx`
- `mobile/src/components/ui/FriendlyEmptyCard.tsx`
- `mobile/src/components/ui/SegmentedTabs.tsx`

### Mapas

- `mobile/src/components/map/ThemedMapStyle.tsx`
- `mobile/src/components/map/OSMOverlayLayers.tsx`
- `mobile/src/components/home/results/ResultRoutePreview.tsx`
- `mobile/src/screens/running/RunningScreen.tsx`
- `mobile/src/screens/running/RunSummaryScreen.tsx`
- `mobile/src/screens/CoachAnalysisScreen.tsx`

### Arquivos protegidos do puck

- `mobile/src/components/map/MapLocationPuck.tsx`
- `mobile/src/components/map/UserLocationIndicator.tsx`

### Documentação e validação

- `docs/THEME-ARCHITECTURE.md`
- `mobile/scripts/check-design-tokens.js`
- `mobile/scripts/check-color-literal-baseline.js`
- `mobile/scripts/design-color-baseline.json`

## 17. Estado do working tree

Esta frente possui alterações ainda não consolidadas em commit no working tree. Elas incluem a arquitetura de tema, a prévia do light mode, a migração inicial de componentes compartilhados e a tematização do Mapbox.

Regras para continuação:

- não descartar o working tree;
- não usar `git reset --hard` ou checkout destrutivo;
- revisar diffs antes de qualquer commit;
- separar futuras mudanças em lotes pequenos e verificáveis;
- preservar alterações do usuário que não pertençam a esta frente.

## 18. Checklist obrigatório para qualquer continuação

Antes de editar:

- [ ] Confirmar se a tarefa é apenas cromática ou também estrutural.
- [ ] Identificar se o componente possui comportamento aprovado a preservar.
- [ ] Verificar se há cores de domínio que não devem virar tokens genéricos.
- [ ] Confirmar que o puck e seus assets estão fora do escopo.

Durante a edição:

- [ ] Consumir tema ativo em vez de adicionar novos literais.
- [ ] Preservar a árvore JSX em migrações cromáticas.
- [ ] Manter badges e ícones ilustrativos protegidos.
- [ ] Respeitar reduce motion e áreas mínimas de toque.
- [ ] Evitar ampliar o baseline de hardcodes sem justificativa.

Antes de entregar:

- [ ] Rodar typecheck.
- [ ] Rodar `design:check`.
- [ ] Rodar `git diff --check`.
- [ ] Comparar estrutura JSX quando a tarefa for de tema.
- [ ] Verificar dark mode visualmente.
- [ ] Verificar light mode nas telas migradas.
- [ ] Confirmar calendário, ranking, cards de treino e próximo treino.
- [ ] Confirmar ausência de diff no puck.

## 19. Decisão atual de produto

O caminho aprovado é continuar a migração incremental para light mode usando a arquitetura existente e o Mapbox Standard com preset dinâmico. O app permanece dark por padrão e em produção até que os critérios de liberação acima sejam atendidos.

O princípio central desta frente é simples: evoluir o sistema visual sem descaracterizar os componentes nem quebrar comportamentos aprovados.
