# Vercel KV Setup Guide

## Quick Setup (5 minutes)

### Option 1: Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Select project: `clash-of-clawds`

2. **Create KV Database**
   - Click "Storage" tab
   - Click "Create Database"
   - Select "KV" (Redis)
   - Name it: `clash-of-clawds-kv`
   - Region: Choose closest to users (e.g., `us-east-1`)
   - Click "Create"

3. **Connect to Project**
   - Click "Connect to Project"
   - Select `clash-of-clawds`
   - Click "Connect"

4. **Environment Variables Auto-Added**
   The following variables are automatically added:
   ```
   KV_REST_API_URL
   KV_REST_API_TOKEN
   KV_REST_API_READ_ONLY_TOKEN
   ```

5. **Redeploy**
   ```bash
   vercel --prod
   ```

### Option 2: Vercel CLI

```bash
# From project directory
cd /home/claw/clawd/clash-of-clawds

# Install storage (if available via CLI)
vercel storage create kv clash-of-clawds-kv

# Deploy with new config
vercel --prod
```

## Verify Setup

After deployment, test that data persists:

1. **Create an agent:**
   ```bash
   curl -X POST https://clash-of-clawds.vercel.app/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name": "TestAgent123"}'
   ```

2. **Wait 5+ minutes** (for potential cold start)

3. **Check agent still exists:**
   ```bash
   curl -X GET https://clash-of-clawds.vercel.app/api/auth/me \
     -H "X-Agent-Name: TestAgent123"
   ```

If the agent data persists, KV is working! 🎉

## Free Tier Limits

- **Storage:** 256 MB
- **Commands:** 10,000 per month
- **Connections:** 1,000 daily
- **Perfect for:** 100+ concurrent agents, millions of requests

## Troubleshooting

### Error: "kv is not defined"
- Make sure environment variables are set in Vercel
- Check `.env.local` has KV credentials (for local dev)
- Redeploy after adding env vars

### Error: "Connection failed"
- Verify KV database region matches project region
- Check Vercel dashboard for database status
- Ensure project is connected to database

### Data still resetting
- Confirm environment variables are present: `vercel env ls`
- Check Vercel logs for KV connection errors
- Verify @vercel/kv package is installed: `npm list @vercel/kv`

## Local Development

For local testing with real KV:

1. Get KV credentials from Vercel Dashboard
2. Copy to `.env.local`:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your actual credentials
   ```

3. Install vercel dev:
   ```bash
   npm i -g vercel
   vercel dev
   ```

This connects local dev to production KV storage.
