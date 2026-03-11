# Railway Environment Variables for RunEasy Backend

## Required Variables
Configure these in Railway Dashboard > Variables:

### Supabase
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...your_anon_key
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...your_service_role_key
```

### Anthropic (Claude AI)
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Application
```
NODE_ENV=production
PORT=3000
FRONTEND_URL=runeasy://callback
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
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configured (not just anon key)
- [ ] Supabase RLS policies configured
- [ ] Health endpoint tested locally: GET /api/health
