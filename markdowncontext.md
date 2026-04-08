| Arquétipo | Critérios de Mapeamento (Filtros) | Foco do Plano (Briefing Estático) |
| --- | --- | --- |
| O Recomeço | experience_level == 'beginner' OU recentDistance <= 5 | Base aeróbica e fortalecimento articular progressivo. |
| Aspirante a Performance | goal em (21k, 42k) OU experience_level == 'advanced' | Treinos intervalados, limiar de lactato e volume semanal alto. |
| Foco em Saúde | goal == 'general_fitness' OU (experience_level == 'beginner' E goal == '5k') | Zonas de frequência cardíaca baixa (Z2) e queima calórica. |
| Reabilitação e Segurança | limitations.hasLimitation == true | Baixo impacto, foco em biomecânica e prevenção de dor. |

**2\. Implementação da "Labor Illusion" (Briefing Screen)**

A tela SmartPlanScreen deixará de ser o destino final da IA e passará a ser uma tela de **Briefing de Arquétipo**.

*   **Elementos Visualmente Personalizados:**
    *   **Título:** "Coach RunEasy: Plano \[Nome do Arquétipo\] detectado."
    *   **Variáveis Dinâmicas:** "Olá, \[Nome\], com base no seu pace de **\[calculatedPace\] min/km** e sua meta de **\[goal\]**, estruturamos sua jornada de **\[goalTimeframe\] meses**.".
    *   **Gráfico Estático:** Exibir um gráfico de barras simulando a progressão de volume (Ex: Semana 1: 15km, Semana 4: 25km) que mude apenas o multiplicador com base no arquétipo.
*   **O Gatilho (Trigger):** O botão "Confirmar e Iniciar" disparará o evento onboarding\_complete para o **Superwall**.

**3\. Fluxo Pós-Assinatura (Delayed AI Generation)**

Assim que o Superwall confirmar o is\_premium = true, o app deve navegar para a PlanLoadingScreen definitiva.

1.  **Status do Banco:** O App envia o user\_id para o backend NestJS.
2.  **Mensagem de Espera:** "Aguarde enquanto seu coach prepara o ambiente para os seus treinos."
3.  **Processamento Background (Job):**
    *   O Backend inicia a chamada ao AIRouterService usando o **Claude Sonnet 4.6**.
    *   Como o usuário já pagou, o custo de ~US$ 0,022 por plano é totalmente absorvido pela margem bruta de ~70%.
4.  **Persistência:** O plano gerado é salvo na tabela training\_plans (Supabase). O campo generation\_status muda de partial para complete.

**4\. Análise de Unit Economics (CFO View)**

*   **Economia Imediata:** Redução de 100% no custo de IA para usuários "curiosos" (não-pagantes).
*   **Aumento de Valor Percebido:** A "Labor Illusion" faz o usuário sentir que a IA está trabalhando especificamente para ele _após_ ele ter investido dinheiro, o que reduz o Churn inicial e pedidos de reembolso.
*   **Margem de Segurança:** Com o faturamento garantido pela Apple/Google, o custo dos tokens da Anthropic deixa de ser um risco de "burn rate" descontrolado.

**Próximo passo recomendado:** Comandar o Claude Code para alterar a navegação da OnboardingScreen.tsx. O fim do quiz deve levar para a nova BriefingScreen (estática) e somente após a confirmação do paywall seguir para a geração real no backend.

**🗺️ Novo Fluxo Logístico: Do Onboarding ao Plano Real**

A mudança fundamental é a substituição do modelo de geração em duas etapas (Semana 1 + Background) por um modelo de **Geração Única e Integral Pós-Pagamento**.

**1\. Pré-Paywall: O "Briefing" de Arquétipo**

Ao finalizar o Step 14, o usuário será direcionado para a SmartPlanScreen, que agora funcionará como uma interface de vendas baseada em **Arquétipos Estáticos**.

*   **Visual:** Esta tela apresentará um resumo visual do "plano detectado".
*   **Personalização (Sem IA):** Usaremos variáveis locais para preencher a tela: "Olá, **\[Name\]**, detectamos que você é um **\[Arquétipo\]**. Seu ritmo atual de **\[calculatedPace\]** e sua meta de **\[goal\]** exigem uma abordagem de **\[goalTimeframe\] meses**.".
*   **Gatilho:** O botão de ação dispara o evento onboarding\_complete para o **Superwall**.

**2\. Pós-Paywall: Geração Completa via IA**

Assim que o pagamento é confirmado, o app entra na PlanLoadingScreen definitiva. Neste momento, o backend dispara a chamada para a Anthropic Claude.

*   **Input Total:** A IA não receberá apenas o "arquétipo", mas os **15 campos do onboarding**.
    *   **Biometria:** Idade, Peso, Altura.
    *   **Logística:** Frequência semanal e dias específicos de treino.
    *   **Performance:** Distância recente, tempo e pace confirmado.
    *   **Saúde:** Limitações físicas e lesões detalhadas.
*   **Output:** O modelo **Claude Sonnet 4.6** gera o plano de treinamento **completo** (do primeiro ao último dia) em uma única transação de tokens.