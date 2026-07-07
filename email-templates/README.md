# Templates de Email — Auth Supabase (RunEasy)

Templates HTML dos emails transacionais de autenticação do RunEasy (tema escuro,
destaque cyan `#00D4FF`), com a identidade visual do app.

## ⚠️ A fonte de verdade é o painel do Supabase — NÃO este repo

> **Editar um arquivo `.html` aqui NÃO altera o email em produção.**
> O Supabase renderiza e envia o email a partir do HTML colado no painel
> (**Authentication → Emails → Templates**). Os arquivos deste diretório são
> uma **cópia versionada** (histórico / rede de segurança / facilidade de
> edição) — depois de editar qualquer um, **cole o HTML novamente no painel**
> para a mudança valer.

Esta pasta fica **fora de `mobile/`** de propósito: template de email é
conteúdo server-side (config do Supabase), **não** é código do app — não é
importado pelo bundler nem entra no binário. Nenhum destes arquivos exige build.

## Ambiente: SOMENTE produção

- Aplicar **apenas** no projeto de **produção** (`ndlsxgsccyjspbhzccyp`).
- **Staging (`gcaozgnevvmnlxnkfthh`) permanece intocado**, no template padrão do
  Supabase (é ambiente de teste; manter no padrão evita sincronizar dois lugares).

Infra de envio (já configurada, fora do escopo destes arquivos): Resend como
Custom SMTP, domínio `mail.runeasy.com.br`, remetente
`nao-responda@mail.runeasy.com.br` ("RunEasy").

## Arquivos → onde colar → placeholder

| Arquivo | Template no painel (Authentication → Emails) | CTA | Placeholders |
|---|---|---|---|
| `confirmation.html` | **Confirm signup** (prioritário — disparado pelo `signUp`) | "Confirmar meu email" | `{{ .ConfirmationURL }}` |
| `recovery.html` | **Reset password** | "Redefinir minha senha" | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | "Entrar no RunEasy" | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | "Confirmar novo email" | `{{ .ConfirmationURL }}` + `{{ .Email }}` (atual) + `{{ .NewEmail }}` (novo) |

> **Nota sobre o Magic Link:** o app **não** usa magic link hoje (só
> `signUp` + `signInWithPassword`). O `magic-link.html` está aqui por
> consistência visual e para uso futuro — não é obrigatório colar agora.
> O `recovery.html` também só é disparado se/quando o app chamar
> `resetPasswordForEmail` (ainda não chamado), mas fica pronto.

Todos os CTAs (e o link de fallback em texto) usam **`{{ .ConfirmationURL }}`**:
é o Supabase que monta essa URL com o token de verificação **+ o `redirect_to`**
configurado no painel. O template só **referencia** o placeholder — não constrói
a URL à mão. (Placeholders são estáveis, mas a
[doc oficial](https://supabase.com/docs/guides/auth/auth-email-templates) é a
referência final; outros disponíveis: `{{ .Token }}`, `{{ .SiteURL }}`,
`{{ .Email }}`.)

## Redirect / página de sucesso (passo manual no painel)

Ao clicar no CTA, o usuário é levado à **página de sucesso web**
`https://runeasy.com.br/email-confirmado` (criada em tarefa separada na landing).
**Não há deep link** de volta ao app neste fluxo — logo, nada disso toca no
mobile nem exige build/revisão de loja.

Configurar no painel de **produção** → **Authentication → URL Configuration**:
- **Site URL:** `https://runeasy.com.br/email-confirmado`
- **Redirect URLs:** adicionar `https://runeasy.com.br/email-confirmado`

> Domínio `.com.br` escolhido para casar com o remetente
> `nao-responda@mail.runeasy.com.br`. (`runeasy.app` aponta para a mesma landing,
> mas **não** é o usado aqui.)

**Casos de borda** (link expirado / já usado / token inválido) são tratados pela
**própria página de sucesso** (ela lê os parâmetros de erro que o Supabase
manda na URL). O template de email **não** trata erro — só leva ao clique.

## Passos manuais do João (checklist)

1. Colar cada HTML no painel do Supabase de **produção** → Authentication →
   Emails → Templates (conforme a tabela acima). **Não aplicar em staging.**
2. Configurar Site URL / Redirect URLs (seção acima) em produção.
3. Com o app em mãos: fazer um cadastro de teste real e confirmar que o email
   chega com o template novo (de `nao-responda@mail.runeasy.com.br`), que o CTA
   confirma a conta e leva a `/email-confirmado`, e que SPF/DKIM/DMARC dão
   **PASS** no "Mostrar original" do Gmail.

## Compatibilidade de email (por que o HTML é "antigo")

Clientes de email (Gmail, Outlook, Apple Mail) têm suporte limitadíssimo a CSS
moderno. Por isso os templates usam, de propósito:
- Layout em `<table>` (não flexbox/grid); CSS **inline** em cada elemento.
- Fundo escuro em dupla trava (`bgcolor` **+** `style`) por causa do Outlook.
- Botão "bulletproof" (`<a>` estilizado em `<td>` colorida) com fallback **VML**
  para Outlook — nunca `<button>`.
- Largura máx. ~600px, centralizado; sem JS; sem web fonts obrigatórias
  (font-stack seguro — a fonte do app não carrega em cliente de email).
- **Sem imagens obrigatórias:** a marca é um wordmark em texto ("Run" + "Easy"
  cyan), então o email faz sentido mesmo com imagens bloqueadas (comum no 1º
  email de um remetente novo). Se um dia quiser um logo em imagem, hospede-o em
  **URL absoluta** e adicione um `<img>` com `alt="RunEasy"` — nunca base64/anexo.

## Pré-visualização rápida (`preview/`)

A subpasta [`preview/`](./preview) tem uma cópia de cada template com os
placeholders (`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`) já
trocados por `#`, para você **abrir direto no navegador** e conferir o visual.

> ⚠️ Os arquivos em `preview/` são **descartáveis, só para visualização, e NÃO
> são a fonte de verdade.** Não edite o preview achando que altera o template
> real — edite o `.html` **desta** pasta e, no fim, cole no painel do Supabase.

## Editar os templates

Ao ajustar qualquer `.html`: para pré-visualizar localmente, use a cópia
correspondente em `preview/` (placeholders já trocados por `#`) e abra no
navegador. Idealmente, valide num testador de email (Gmail web+app, Apple Mail,
Outlook) e **com imagens bloqueadas** antes de colar no painel. Não esqueça: **a
mudança só vale depois de colar no painel do Supabase de produção** (e a cópia
em `preview/` precisa ser regerada manualmente se quiser mantê-la em dia).
