# Railway Environment Variables for RunEasy Backend

## Required Variables
Configure these in Railway Dashboard > Variables:

### Supabase
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...your_anon_key
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your_service_role_key
```

### Strava OAuth
```
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_VERIFY_TOKEN=your_webhook_verify_token
STRAVA_REDIRECT_URI=https://runeasy-api.up.railway.app/api/auth/strava/callback
```

### Anthropic (Claude AI)
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Application
```
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://runeasy.app
```

## Railway Configuration

### Build Command
```
npm run railway:build
```

### Start Command
```
npm run railway:start
```

### Root Directory
Set to `/` (project root) since package.json is at root level.

## Checklist Before Deploy
- [ ] All environment variables set in Railway Dashboard
- [ ] STRAVA_REDIRECT_URI updated to production URL
- [ ] Supabase RLS policies configured
- [ ] Health endpoint tested locally: GET /api/health
