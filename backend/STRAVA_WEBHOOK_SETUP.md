# Strava Webhook Setup Guide

## Webhook Verification

O endpoint de verificação já está configurado e pronto para receber o handshake do Strava.

### Endpoint
```
GET https://your-backend-url.com/api/webhooks/strava
```

### Parâmetros esperados
- `hub.mode` = 'subscribe'
- `hub.verify_token` = 'RUNEASY_2025_TOKEN'
- `hub.challenge` = valor enviado pelo Strava

### Resposta
- ✅ **200 OK** se validação bem-sucedida:
  ```json
  {
    "hub.challenge": "valor_recebido"
  }
  ```
- ❌ **403 Forbidden** se token ou mode inválidos

---

## Registrar Webhook no Strava

### Comando cURL

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=SEU_CLIENT_ID \
  -F client_secret=SEU_CLIENT_SECRET \
  -F callback_url=https://your-backend-url.com/api/webhooks/strava \
  -F verify_token=RUNEASY_2025_TOKEN
```

**Substitua:**
- `SEU_CLIENT_ID` - Client ID do seu app Strava
- `SEU_CLIENT_SECRET` - Client Secret do seu app Strava
- `your-backend-url.com` - URL do seu backend (ex: runeasy-backend.herokuapp.com)

### Resposta esperada

Se bem-sucedido, o Strava retornará:
```json
{
  "id": 123456,
  "resource_state": 2,
  "application_id": YOUR_APP_ID,
  "callback_url": "https://your-backend-url.com/api/webhooks/strava",
  "created_at": "2025-12-27T20:00:00Z",
  "updated_at": "2025-12-27T20:00:00Z"
}
```

---

## Verificar Webhook Registrado

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=SEU_CLIENT_ID \
  -d client_secret=SEU_CLIENT_SECRET
```

---

## Deletar Webhook (se necessário)

```bash
curl -X DELETE https://www.strava.com/api/v3/push_subscriptions/SUBSCRIPTION_ID \
  -F client_id=SEU_CLIENT_ID \
  -F client_secret=SEU_CLIENT_SECRET
```

---

## Testar Localmente com ngrok

Se estiver desenvolvendo localmente:

1. **Instalar ngrok:**
   ```bash
   npm install -g ngrok
   ```

2. **Expor porta local:**
   ```bash
   ngrok http 3000
   ```

3. **Usar URL do ngrok:**
   ```
   https://abc123.ngrok.io/api/webhooks/strava
   ```

---

## Logs de Verificação

O backend logará:
- ✅ `Webhook verification successful` - Validação OK
- ❌ `Webhook verification failed` - Token ou mode inválido
- 📥 `Received Strava webhook: {event}` - Evento recebido
- ✅ `Successfully processed activity {id}` - Atividade processada

---

## Troubleshooting

### Erro: 403 Forbidden
**Causa:** Token não coincide
**Solução:** Verificar se está usando `RUNEASY_2025_TOKEN` exatamente

### Erro: Timeout
**Causa:** Backend não acessível publicamente
**Solução:** Usar ngrok ou verificar firewall/deploy

### Webhook não recebe eventos
**Causa:** Subscription não registrada ou inativa
**Solução:** Verificar com comando de listagem
