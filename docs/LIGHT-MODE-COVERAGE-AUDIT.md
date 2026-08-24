# Auditoria de cobertura do light mode — RunEasy

> Data: 23 de agosto de 2026  
> Status: cobertura de código concluída; validação visual final em dispositivos pendente  
> Escopo: telas, componentes, modais, charts, onboarding, tracking, esteira e infraestrutura de tema.

## Resultado executivo

A alternância light/dark deixou de depender apenas do background raiz. A camada de compatibilidade agora acompanha o tema ativo em runtime, os estilos de módulo são reconstruídos quando a preferência muda e os componentes consumidores assinam o `ThemeProvider`.

Cobertura auditada:

| Indicador | Resultado |
| --- | ---: |
| Telas TSX auditadas | 107 |
| Componentes TSX auditados | 113 |
| Consumidores de tokens semânticos | 191 |
| Assinantes do runtime de tema | 201 |
| Migrações pendentes detectadas | 0 |
| Violações de cobertura | 0 |
| Arquivos TSX comparados estruturalmente | 192 |
| Divergências de composição JSX | 0 |
| Arquivos protegidos do puck | 2, sem diff |

Esses números são produzidos por `npm run theme:audit`, não por uma lista manual.

## Causas encontradas

| Problema | Sintoma | Causa | Resolução |
| --- | --- | --- | --- |
| Alias estático de cores | canvas claro e cards escuros | `semanticColors` e `colors` eram avaliados no carregamento do módulo | proxies reativos ligados ao tema ativo |
| `StyleSheet.create` no escopo do módulo | estilos permaneciam dark após alternar | o objeto nativo capturava o dark uma única vez | `createThemeStyles(() => ...)` recria o sheet por versão de tema |
| Componentes memoizados | ícones/cards não atualizavam | não consumiam o contexto e podiam manter o render anterior | `useThemeSubscription()` nos consumidores de compatibilidade |
| Mini-paletas locais | onboarding, quiz, charts e modais híbridos | objetos locais continham neutros dark hardcoded | papéis migrados para tokens semânticos e getters locais reativos |
| Blur fixo | glass escuro no tema claro | `tint="dark"` e sheen fixo | tint e gradiente de vidro derivados do tema |
| Status bar fixa | chrome ilegível no light | `light-content`/estilo `light` hardcoded | helpers dinâmicos para React Native e Expo StatusBar |
| Gráficos fixos | grids e trilhas quase invisíveis | branco translúcido pensado apenas para dark | `borderSubtle`, `fillSubtle`, `fillStrong` e textos semânticos |
| Overlays e sheets | modal permanecia escuro | scrim, surface e divider locais | `scrim`, surfaces e borders do tema |
| Paletas expandidas pelo codemod | arquivos grandes e difíceis de manter | aliases locais foram inlined para evitar snapshots | getters semânticos locais compactos, sem alterar renderização |
| Mapa | precisava alternar basemap | style único sem preset ligado ao tema | Mapbox Standard com `day/night` em runtime; já validado pelo usuário |

## Áreas mapeadas

A varredura inclui:

- shell do app, React Navigation, tab bar, headers e status bar;
- Home, cards, skeletons, insights, level e resultados;
- Perfil, informações pessoais, configurações, notificações, ajuda e suporte;
- Calendário, agenda, seleção de dias, recuperação e próximo treino;
- Ranking, badges e gamificação;
- planejamento, detalhes do plano, cards e histórico de treino;
- tracking no mapa, métricas expandidas e resumo de corrida;
- configuração e execução em esteira;
- wellness, readiness, evolução, zonas, charts e sparklines;
- análise do coach e visualizações de progresso;
- onboarding e todo o quiz, somente no comportamento cromático;
- autenticação, login e registro;
- modais, sheets, backdrops, glass, paywall, loaders e estados de processamento;
- retrospectiva, insights semanais/mesociclo e superfícies de compartilhamento.

## Fundação implementada

### Runtime

- `ThemeProvider` resolve `dark | light | system` e atualiza o runtime antes de renderizar consumidores.
- `createThemeObject` mantém aliases legados compatíveis com o tema ativo.
- `createThemeStyles` recompila estilos nativos quando a versão do tema muda.
- `useThemeSubscription` força atualização de consumidores legados, inclusive componentes memoizados.
- helpers dinâmicos controlam StatusBar, BlurView e sheen de glass.

### Tokens adicionados ou consolidados

Além de canvas, surfaces, textos, borders, accent e estados, foram formalizados:

- `fillSubtle`;
- `fillMuted`;
- `fillStrong`;
- `textOnMedia`;
- `textOnMediaMuted`;
- `shadow`;
- overlays e scrims por intensidade.

Esses papéis evitam usar branco translúcido como solução universal em charts, tracks e controles.

## Exceções intencionais

As exceções são pequenas, documentadas e auditadas:

| Arquivo/área | Motivo |
| --- | --- |
| `AppPressable.tsx` | primitivo apenas de movimento e área de toque, sem cor |
| `StoryProgressBars.tsx` | overlay branco sobre mídia |
| `CardBrand.tsx` | assinatura visual exportável |
| `CardBase.tsx` | canvas de compartilhamento exportável |
| `StoryProgressBar.tsx` | overlay imersivo sobre mídia |
| `CountUp.tsx` | helper de animação sem propriedades visuais |
| botões Apple/Google | cores oficiais da marca |
| badges e patentes | paletas de domínio protegidas |

Novos hardcodes ainda são bloqueados pela baseline de cores.

## Invariantes preservadas

- Nenhum wrapper, dimensão, espaçamento, texto ou fluxo foi alterado pela migração cromática.
- Ranking mantém o tab `Meu cohort | Global`.
- Card de treino mantém o CTA e sua composição.
- Calendário mantém próximo treino/recuperação e seleção cyan para treino/comum e roxa para descanso.
- Ícones ilustrativos do onboarding permanecem intactos.
- Badges e patentes permanecem intactos.
- `MapLocationPuck.tsx` e `UserLocationIndicator.tsx` permanecem sem alterações.

## Guardrails

Comandos obrigatórios:

```bash
cd mobile
npm run typecheck
npm run theme:audit
npm run design:check
```

`theme:audit` falha quando encontra:

- consumidor sem assinatura do provider;
- `StyleSheet.create` capturando tokens dinâmicos;
- BlurView com tint dark fixo;
- StatusBar clara fixa;
- arquivo visual sem vínculo com o design system, salvo exceção explícita;
- snapshot de tema que o codemod ainda consiga migrar.

`design:check` também executa a auditoria de tema e controla literais de cor por baseline.

## QA visual final recomendada

O código não substitui a inspeção em dispositivo. Antes de expor o seletor em produção, validar em iOS e Android:

1. alternar Dark → Light → Dark sem reiniciar o app;
2. repetir após cold start com preferência persistida;
3. percorrer Home, Perfil, Calendário, Ranking e Settings;
4. abrir todos os modais e sheets desses fluxos;
5. percorrer planejamento, treino, tracking, esteira e resumo;
6. validar onboarding completo sem mudanças nos ícones;
7. verificar charts, skeletons, loading, empty e error states;
8. confirmar Mapbox day/night e puck idêntico;
9. testar `system` enquanto o sistema troca de aparência;
10. conferir contraste, teclado, safe areas, Dynamic Type e reduce motion.

A configuração nativa pode permanecer dark enquanto a prévia está restrita ao Dev Menu. Após essa matriz passar, a mudança para `userInterfaceStyle: automatic` e o seletor em Settings deve ser feita em uma alteração separada e revisável.
