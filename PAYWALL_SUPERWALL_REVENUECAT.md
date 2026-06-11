# Paywall — Superwall + RevenueCat + Lojas

Como o RunEasy conecta **Superwall** (vitrine/segmentação), **RevenueCat**
(motor de assinatura) e as **lojas** (App Store / Google Play), e como configurar
um produto de ponta a ponta até ele aparecer e ser comprável no paywall.

> Resumo de uma linha: **a loja cria o produto → o RevenueCat importa e amarra ao
> entitlement `pro` → o paywall do Superwall amarra um botão ao product ID → o
> nosso código (modo manual) repassa a compra ao RevenueCat.**

---

## 1. As três camadas

### Camada 1 — App Store Connect + Google Play Console (a verdade do que está à venda)
É **aqui** que o produto realmente existe. Você cria a assinatura, define **preço**,
**teste grátis**, renovação etc. Cada loja é independente e tem **seus próprios
product IDs e preços**:

- **App Store** → product IDs próprios + preços (BRL etc.)
- **Google Play** → product IDs próprios + preços

O texto "7 dias grátis depois R$ 29,90/mês" no paywall é só *cópia*; a oferta de
trial real é configurada no produto da loja (intro offer no App Store / período de
teste no Play).

### Camada 2 — RevenueCat (unifica + valida)
Conecta as duas contas (App Store + Play) e:
- **importa os produtos** das lojas (pelos product IDs);
- define o **entitlement `pro`** (o "o que o usuário ganha", abstrato) e amarra os
  produtos das duas lojas a ele;
- **executa/valida** a compra e mantém o estado da assinatura cross-platform.

É o RevenueCat que o cliente consulta para saber se é Pro e é o **webhook do
RevenueCat** que avisa o backend para virar o usuário para Pro.

### Camada 3 — Superwall (só a vitrine + segmentação)
Cuida **apenas** do paywall: UI, campanhas, placements, A/B test. Cada botão de
compra no paywall é **amarrado a um product ID**. No nosso setup o Superwall
**não processa o pagamento**.

> ⚠️ iOS e Android são **apps separados** no Superwall (chaves de API distintas).
> Cada um tem suas próprias campanhas/paywalls. Ver §6.

---

## 2. Modo manual de compra (o ponto que confunde)

O Superwall tem dois modos:
- **Automático**: o Superwall fala com a loja e gerencia a compra/assinatura sozinho.
- **Manual** (o que usamos): o Superwall **não compra**. Ao tocar em comprar, ele
  chama o **nosso** handler `onPurchase({ productId })`, e nós repassamos ao
  RevenueCat.

Configurado via `CustomPurchaseControllerProvider` em
[App.tsx:63-85](mobile/App.tsx#L63-L85). O repasse ao RevenueCat está em
[paywall.ts:185-208](mobile/src/services/paywall.ts#L185-L208):

```ts
const products = await Purchases.getProducts([productId]);
const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
```

**Por que manual?** Para o **RevenueCat ser a única fonte de verdade** da
assinatura — usada tanto no cliente (checar Pro) quanto no servidor (webhook).
Como o Superwall não sabe sozinho nesse modo, o app precisa **informar** o status
a ele via `setSubscriptionStatus`:
- no boot/quando muda: [SuperwallBridge.tsx:42-48](mobile/src/components/paywall/SuperwallBridge.tsx#L42-L48)
- logo antes de abrir o paywall: [useProFeature.ts:33-47](mobile/src/hooks/useProFeature.ts#L33-L47)

Se não informarmos, o Superwall fica `UNKNOWN` e **segura todo paywall** (ele não
apresenta). Free → `INACTIVE` (apresenta), Pro → `ACTIVE` (pula).

---

## 3. Onde os product IDs "moram"

O nosso código **não tem product ID hardcoded**. Ele recebe `params.productId` do
que o **paywall do Superwall** mandar e resolve no RevenueCat. O ID percorre:

```
Loja (cria)  →  RevenueCat (importa + amarra ao `pro`)  →  Paywall do Superwall (botão amarrado ao ID)
```

Consequência: no app **iOS** do Superwall os botões têm que apontar para product
IDs da **App Store** (presentes no RevenueCat iOS); no **Android**, para IDs do
**Google Play**. Copiar o paywall do Android para o iOS **com os IDs do Play** faz
o paywall **aparecer** mas a compra **falhar** (`getProducts` não acha o produto).

---

## 4. Fluxo completo, ponta a ponta

1. Usuário toca **"Confirmar e Iniciar"** no `BriefingScreen` →
   `registerPlacement('onboarding_complete')` (ou `referral_activated`).
2. Superwall avalia a campanha (do app da plataforma) → mostra o paywall.
3. Usuário toca num botão amarrado ao product ID *X*.
4. Superwall (manual) → chama nosso `onPurchase({ productId: X })` ([App.tsx:64](mobile/App.tsx#L64)).
5. RevenueCat → abre a folha de pagamento nativa (App Store / Play).
6. Loja cobra → RevenueCat valida o recibo → ativa o entitlement `pro`.
7. **Webhook do RevenueCat** → backend marca `subscription_plan = 'pro'` → dispara
   a geração do plano de IA.
8. Cliente: `fetchSubscription`/`SubscriptionReconciler` vira `isProUser` →
   `setSubscriptionStatus(ACTIVE)` → paywall fecha e o app destrava
   ([App.tsx:173-226](mobile/App.tsx#L173-L226)).

---

## 5. Placements (onde os paywalls disparam)

Centralizados em `PAYWALL_PLACEMENTS`
([paywall.ts:271-290](mobile/src/services/paywall.ts#L271-L290)). Os **nomes
exatos** (strings) precisam existir nas campanhas dos dois apps do Superwall.

| Placement | Onde dispara | Observação |
|---|---|---|
| `onboarding_complete` | `BriefingScreen` ao confirmar | só se `!isPro`; padrão |
| `referral_activated` | `BriefingScreen`/quiz ao confirmar **com código** | envia `params: { influencer_code }` |
| `view_training_plan` | `SmartPlanScreen` → "Desbloquear tudo" | tela diferente do Briefing |
| `upgrade_tapped` | cards de upgrade pelo app | via `useProFeature.presentPaywall` |

**Importante sobre o BriefingScreen** (tela final do onboarding,
[BriefingScreen.tsx:160-197](mobile/src/screens/quiz/BriefingScreen.tsx#L160-L197)):
- Os **dois** botões ("Confirmar e Iniciar" no card e "CONFIRMAR E INICIAR" no
  rodapé) chamam o mesmo `handleConfirmAndStart`.
- Dispara **ao confirmar**, **não** ao abrir a tela.
- Dispara **só se `!isPro`**.
- "Desbloquear tudo" **não** é do Briefing — é o `view_training_plan` no
  `SmartPlanScreen`.

---

## 6. Configuração por plataforma (chaves de API)

Cada plataforma usa um **app separado** no Superwall. Chaves no
[eas.json](mobile/eas.json) (3 profiles), selecionadas por `Platform.OS` em
[paywall.ts](mobile/src/services/paywall.ts) (`getSuperwallApiKey`) e passadas ao
`SuperwallProvider` em [App.tsx:357-361](mobile/App.tsx#L357-L361):

| Variável | Valor |
|---|---|
| `EXPO_PUBLIC_SUPERWALL_API_KEY_ANDROID` | `pk_VhV-_Mt-Em2eqa0gTo6n6` |
| `EXPO_PUBLIC_SUPERWALL_API_KEY_IOS` | `pk_LxD8KQWFHHDthkJYRhbFe` |

O RevenueCat também é por plataforma ([paywall.ts:73-75](mobile/src/services/paywall.ts#L73-L75)):
`appl_...` (iOS) / `goog_...` (Android) em produção; `test_...` em dev/staging.

**O que precisa bater entre os dois apps do Superwall para o comportamento ser
igual:** nomes de placement, regras de audiência/`params`, e os paywalls. **O que
não pode ser igual:** os product IDs dos botões (App Store no iOS, Play no Android).

---

## 7. Checklist — adicionar/configurar um produto novo

1. **App Store Connect**: criar a assinatura (product ID, preço, trial). Estado
   "Ready to Submit"/aprovado conforme o caso.
2. **Google Play Console**: criar a assinatura equivalente (product ID próprio,
   preço, trial).
3. **RevenueCat**: importar os dois produtos; amarrá-los ao entitlement **`pro`**
   (e à Offering, se usar). Confirmar que aparecem nas duas plataformas.
4. **Superwall (app iOS)**: no paywall, amarrar o botão ao product ID da **App Store**.
5. **Superwall (app Android)**: no paywall, amarrar o botão ao product ID do **Play**.
6. **Código**: nada a mudar — o `productId` chega do paywall e é resolvido no
   RevenueCat. (Só edite se mudar nome de placement.)
7. **Testar**: sandbox da App Store / teste interno do Play. Conferir compra,
   ativação do `pro`, webhook no backend (`subscription_plan = 'pro'`) e o destrave
   no app.

---

## 8. Arquivos-chave

| Papel | Arquivo |
|---|---|
| Serviço de paywall (chaves, RevenueCat, placements) | [mobile/src/services/paywall.ts](mobile/src/services/paywall.ts) |
| Provider + modo manual + `onPurchase` | [mobile/App.tsx](mobile/App.tsx) |
| Ponte status ↔ Superwall | [mobile/src/components/paywall/SuperwallBridge.tsx](mobile/src/components/paywall/SuperwallBridge.tsx) |
| Hook de gating + abrir paywall | [mobile/src/hooks/useProFeature.ts](mobile/src/hooks/useProFeature.ts) |
| Disparo no fim do onboarding | [mobile/src/screens/quiz/BriefingScreen.tsx](mobile/src/screens/quiz/BriefingScreen.tsx) |
| Disparos do quiz/"Desbloquear tudo" | [mobile/src/screens/quiz/SmartPlanScreen.tsx](mobile/src/screens/quiz/SmartPlanScreen.tsx) |
| Chaves por ambiente/plataforma | [mobile/eas.json](mobile/eas.json) |
