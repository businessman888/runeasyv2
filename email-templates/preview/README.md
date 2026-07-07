# preview/ — só para visualização (NÃO é a fonte de verdade)

Estes arquivos são **cópias descartáveis** dos templates da pasta acima, com os
placeholders do Supabase (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}`) já **trocados por `#`**, para você abrir direto no navegador
e conferir o visual sem precisar do painel.

## ⚠️ Não edite nada aqui achando que altera o email real

- **A fonte de verdade é o painel do Supabase** (Authentication → Emails →
  Templates), em produção.
- Os templates versionados de verdade estão na **pasta acima**
  (`email-templates/*.html`).
- Editar um arquivo desta pasta `preview/` **não muda nada** — nem o email real,
  nem o template versionado. É throwaway.
- Se mudar um template real, estes previews **não** se atualizam sozinhos —
  precisam ser regerados à mão (é só copiar o `.html` e trocar os placeholders
  por `#`).

Cada arquivo aqui também tem, no topo, um comentário HTML avisando o mesmo.
