# Deploy — Vercel + Railway

SHOWHAND runs as two services:

| Service | Platform | What it runs |
|---------|----------|--------------|
| Frontend | [Vercel](https://vercel.com) | Vite static build (`dist/`) |
| Game server | [Railway](https://railway.app) | Socket.io API (`server/index.ts`) |

## 1. Deploy the server (Railway)

1. Push this repo to GitHub (or connect Railway to your git provider).
2. In [Railway](https://railway.app/new): **New Project → Deploy from GitHub repo**.
3. Select this repository. Railway reads `railway.toml` automatically.
4. **Settings → Networking → Generate Domain** (e.g. `showhand-production.up.railway.app`).
5. **Variables** tab — add:

   | Variable | Value |
   |----------|--------|
   | `CLIENT_ORIGIN` | Your Vercel URL (set after step 2), e.g. `https://showhand.vercel.app` |

   You can temporarily use `*` is not supported — use `http://localhost:5173` until Vercel is live, then update.

6. Deploy. Verify: open `https://YOUR-RAILWAY-DOMAIN/health` → `{"ok":true,"service":"showhand-server"}`.

### CLI alternative

```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway domain
```

Set `CLIENT_ORIGIN` in the Railway dashboard under Variables.

---

## 2. Deploy the frontend (Vercel)

1. In [Vercel](https://vercel.com/new): **Import Git Repository**.
2. Framework preset: **Vite** (or use included `vercel.json`).
3. **Environment Variables** (required at build time):

   | Name | Value |
   |------|--------|
   | `VITE_SERVER_URL` | `https://YOUR-RAILWAY-DOMAIN` (no trailing slash) |

4. Deploy.

### CLI alternative

```bash
npm i -g vercel
vercel login
vercel --prod
# When prompted, add VITE_SERVER_URL=https://YOUR-RAILWAY-DOMAIN
```

---

## 3. Connect the two

After Vercel gives you a URL (e.g. `https://showhand.vercel.app`):

1. Railway → **Variables** → set `CLIENT_ORIGIN=https://showhand.vercel.app`
2. Redeploy Railway (or wait for auto-redeploy).
3. Hard-refresh the Vercel site and test **Arkadaşınla oyna**.

Preview deployments on Vercel get unique URLs — add them to `CLIENT_ORIGIN` comma-separated:

```
CLIENT_ORIGIN=https://showhand.vercel.app,https://showhand-git-main-you.vercel.app
```

---

## Local development

```bash
npm run dev:all
```

Vite proxies `/socket.io` to `localhost:3001` — no `VITE_SERVER_URL` needed locally.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Sunucuya bağlanılıyor…" forever | Check `VITE_SERVER_URL` on Vercel matches Railway domain |
| CORS / WebSocket blocked | Set `CLIENT_ORIGIN` on Railway to exact Vercel URL (https, no path) |
| Railway health 404 | Ensure `npm start` runs; check deploy logs |
| Works locally, not online | Test Railway `/health` from phone/different network first |
