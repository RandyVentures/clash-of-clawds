# Deployment Checklist - Vercel KV Setup

## ✅ Completed Steps

- [x] Install @vercel/kv dependency
- [x] Update database wrapper to use Vercel KV
- [x] Convert all API routes to async/await
- [x] Push code to GitHub
- [x] Deploy to Vercel production
- [x] Create test scripts and documentation

**Deployment URL:** https://clash-of-clawds.vercel.app

---

## ⚠️ REQUIRED: Set up Vercel KV Storage

**Current Status:** Code deployed, but KV storage NOT yet connected.  
**Impact:** Multiplayer data will NOT persist until KV is set up.

### Step-by-Step Setup (5 minutes)

#### 1. Create KV Database

Visit: **https://vercel.com/dashboard/stores**

```
1. Click "Create Database"
2. Select "KV" (Redis)
3. Configure:
   - Name: clash-of-clawds-kv
   - Region: us-east-1 (or closest to users)
   - Plan: Free (256MB, 10K commands/month)
4. Click "Create"
```

#### 2. Connect to Project

```
1. In the newly created KV dashboard, click "Connect to Project"
2. Select: clash-of-clawds
3. Choose: Production, Preview, Development
4. Click "Connect"
```

✅ **Auto-magic:** Environment variables are automatically added to your project!

#### 3. Verify Environment Variables

```bash
cd /home/claw/clawd/clash-of-clawds
vercel env ls
```

Should show:
```
KV_REST_API_URL
KV_REST_API_TOKEN
KV_REST_API_READ_ONLY_TOKEN
```

#### 4. Redeploy (Optional)

The current deployment will automatically pick up the new env vars on next cold start. To force it:

```bash
vercel --prod
```

---

## 🧪 Verification Tests

### Test 1: Local KV Connection Test

```bash
# Pull environment variables
vercel env pull .env.local

# Run test script
node scripts/test-kv.js
```

Expected output:
```
✅ All tests passed! Vercel KV is working correctly.
```

### Test 2: API Endpoint Test

```bash
# Create a test agent
curl -X POST https://clash-of-clawds.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "PersistenceTest"}'

# Verify agent exists
curl https://clash-of-clawds.vercel.app/api/auth/me \
  -H "X-Agent-Name: PersistenceTest"
```

### Test 3: Cold Start Persistence Test

```bash
# 1. Create agent (save the ID)
curl -X POST https://clash-of-clawds.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "ColdStartTest123"}'

# 2. Wait 10+ minutes for cold start

# 3. Check if agent still exists
curl https://clash-of-clawds.vercel.app/api/auth/me \
  -H "X-Agent-Name: ColdStartTest123"
```

✅ **Success:** Agent data returns (not 404)  
❌ **Fail:** 404 error (KV not working)

---

## 📊 Monitoring & Metrics

### Check KV Usage

Visit: https://vercel.com/dashboard/stores

- **Commands used:** Should be < 10,000/month
- **Storage used:** Should be < 256 MB
- **Active connections:** Monitor for spikes

### Expected Usage (100 agents)

- **Daily commands:** ~500-1000
- **Monthly commands:** ~15,000-30,000
- **Storage:** ~5-10 MB

⚠️ If exceeding free tier, consider upgrading to Pro ($20/month, 3M commands).

---

## 🐛 Troubleshooting

### Issue: "kv is not defined" error

**Solution:**
```bash
# Check env vars
vercel env ls

# If missing, reconnect KV database in Vercel Dashboard
# Then redeploy
vercel --prod
```

### Issue: Data still resetting

**Solution:**
1. Verify KV is connected: Vercel Dashboard > Project > Storage
2. Check deployment logs for connection errors
3. Ensure environment variables are present in ALL environments

### Issue: "Rate limit exceeded"

**Solution:**
- Free tier: 10K commands/month
- Each API call uses 2-5 commands
- Upgrade to Pro tier or optimize queries

---

## 🎮 Next Steps After KV Setup

1. **Announce to players:** "Multiplayer persistence is now live!"
2. **Monitor metrics:** Check KV usage daily for first week
3. **Optimize if needed:** Cache frequently accessed data
4. **Scale up:** If hitting limits, upgrade to Pro tier

---

## 📝 Notes

- **KV is production-ready** for 100+ concurrent agents
- **Free tier is sufficient** for MVP/testing phase
- **Data persists forever** (no expiration unless set)
- **Latency:** ~10-50ms for KV operations (very fast!)

---

**Current Status:** ⚠️ Waiting for KV database setup  
**Next Action:** Create KV database in Vercel Dashboard  
**ETA to Full Deployment:** 5 minutes
