# Conta de teste — Apple App Store Review (login e-mail/senha)

O app usa **Sign in with Apple** e **Sign in with Google**. A Apple exige uma
conta de teste em que o revisor consiga logar sem depender do 2FA de contas
sociais. Por isso foi adicionado um fluxo de **e-mail/senha** (via Supabase Auth)
na `LoginScreen`, com tela de cadastro (`RegisterScreen`).

> O login social **não foi alterado** — o e-mail/senha foi adicionado abaixo dele.

## Credenciais a inserir no App Store Connect

App Store Connect → App → **App Review Information** → *Sign-In required*:

| Campo | Valor |
|---|---|
| User name (e-mail) | `apple.review@runeasy.com.br`  *(a definir)* |
| Password | `__________`  *(a definir após criar a conta)* |

> Preencha os valores reais após criar a conta (passo abaixo) e **não** comite a
> senha real neste arquivo — deixe o placeholder.

### Notes for the App Reviewer (campo "Notes")

```
This app supports Sign in with Apple and Google. For your convenience we also
added an email/password login (button "Entrar com e-mail" on the login screen),
created specifically for the App Review so you can sign in without social 2FA.

Steps:
1. Open the app → tap "Voltar" if on the landing screen to reach Login.
2. Under the social buttons, enter the email and password provided above.
3. Tap "Entrar com e-mail". You will be taken through the onboarding flow.

The email/password path uses the same Supabase Auth backend as social login.
```

## Pré-requisitos no Supabase (produção `ndlsxgsccyjspbhzccyp`) — AÇÃO MANUAL

Hoje **não existe nenhum usuário de e-mail/senha** em produção (apenas Google e
Apple), então não é possível confirmar pelo banco se o provider está ligado.
Verificar/garantir no Dashboard antes do build:

1. **Authentication → Providers → Email**: provider **Enabled** (habilitado).
2. **Criar a conta de teste**, de uma destas formas:
   - **Dashboard → Authentication → Users → Add user**, marcando **Auto Confirm User**
     (garante `email_confirmed_at` preenchido), **ou**
   - usar a própria `RegisterScreen` num build de produção/TestFlight.
3. **Confirmação de e-mail**: o login (`signInWithPassword`) exige a conta
   **confirmada**. Se *Authentication → Providers → Email → Confirm email* estiver
   **ligado**, garanta que a conta de teste foi criada com Auto Confirm (ou
   confirme o e-mail). Caso contrário o revisor verá "Confirme seu e-mail antes
   de entrar".

> Observação técnica: ao criar a conta, um trigger `AFTER INSERT` em `auth.users`
> já cria a linha correspondente em `public.users`, então o fluxo
> `login(userId)` → `GET /users/{id}` funciona igual ao login social, e o usuário
> novo cai no onboarding (estado 2 do `AppNavigator`).

## O que foi implementado (código)

- `mobile/src/screens/LoginScreen.tsx` — separador "ou", campos e-mail/senha
  (com toggle de visibilidade), botão **"Entrar com e-mail"**
  (`supabase.auth.signInWithPassword`) e link **"Criar conta"**. Social intacto.
- `mobile/src/screens/RegisterScreen.tsx` — nome, e-mail, senha, confirmar senha,
  botão **"Criar conta"** (`supabase.auth.signUp`) + **"Voltar"**. Após cadastro
  com sessão ativa, reusa o mesmo `login()` do social → onboarding.
- `mobile/src/navigation/AppNavigator.tsx` — rota `Register` registrada no
  estado "não autenticado".

Nenhum endpoint novo no NestJS foi necessário — o SDK do Supabase
(`signInWithPassword` / `signUp`) é usado direto, igual ao restante do auth.
