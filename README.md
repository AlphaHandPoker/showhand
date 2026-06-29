# SHOWHAND

Premium poker-strategy card game. Build a 5-card poker hand over 5 rounds while secretly committing effect cards that disrupt your opponent or buff your own hand. Best hand at the end wins.

**Live:** [showhand-alpha.vercel.app](https://showhand-alpha.vercel.app)

**Stack:** React 19 · TypeScript · Vite · Socket.io  
**Platforms:** Desktop and mobile (portrait-friendly)

---

## Quick start

```bash
npm install
npm run dev          # frontend only
npm run dev:all      # frontend + online server
```

Open `http://localhost:5173`.

```bash
npm run build        # production build
npm run preview      # preview production build
```

---

## How to play

1. **Full Deck mode (default)** — You get one of each effect type; play 1 per round.
2. **5 rounds** — Each round, both players draw 1 poker card into the next slot.
3. **Blind commit** — Choose 0–1 effect (Full Deck) and targets, then **Lock In** or **Pass**. Opponent commits at the same time.
4. **Resolution** — Effects resolve in turn order. Invalid targets **fizzle** but still consume the card.
5. **Showdown** — After round 5, standard poker ranking decides the winner.

**Play vs Computer** — instant bot match.  
**Find Player** — 8s matchmaking; falls back to a disguised bot if no one joins.

Full rules: **[docs/GAME.md](docs/GAME.md)**  
Architecture: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Deploy

**Frontend (Vercel):** push to `main` — auto-deploys via `vercel.json`.

**Online server (Railway):**

```bash
npm run deploy:railway
```

Set env vars:
- **Vercel:** `VITE_SERVER_URL=https://your-server.up.railway.app`
- **Railway:** `CLIENT_ORIGIN=https://showhand-alpha.vercel.app`

Redeploy Vercel after setting `VITE_SERVER_URL` (build-time variable).

---

## License

Public release — play and share freely.
