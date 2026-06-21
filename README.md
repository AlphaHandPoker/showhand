# SHOWHAND

Premium poker-strategy card game prototype. Build a 5-card poker hand over 5 rounds while secretly committing effect cards that disrupt your opponent or buff your own hand. Best hand at the end wins.

**Stack:** React 19 · TypeScript · Vite  
**Target display:** Desktop 1920×1080 @ 100% zoom (Chrome)

---

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

```bash
npm run build   # production build
npm run preview # preview production build
```

---

## How to play (summary)

1. **Draft** — Pick 5 effect cards (max 2 of the same type).
2. **5 rounds** — Each round, both players draw 1 poker card from a shared 52-card deck into the next slot (positions 1–5).
3. **Blind commit** — Choose 0–2 effect cards and their targets, then **Lock** (or **Pass**). The bot commits at the same time; neither sees the other's choices.
4. **Resolution** — Committed effects resolve in order (alternating starter each round). Invalid targets **fizzle** but still consume the effect card.
5. **Showdown** — After round 5, standard poker hand ranking decides the winner.

Full rules, effect list, and targeting: **[docs/GAME.md](docs/GAME.md)**  
Architecture and code map: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Project layout

```
src/
  game/           Core rules (pure TypeScript, no React)
    types.ts      Types, constants, effect names/descriptions
    gameEngine.ts Match flow: commit, resolve, rounds, win
    poker.ts      Hand evaluation and comparison
    effects.ts    Effect helpers, deck/slot operations
    bot.ts        Bot commit AI
    botScoring.ts Hand/threat scoring for bot decisions
    deckBuilder.ts Draft validation, bot deck generation
    deck.ts       52-card deck, rank wrap (A↔2)
    visibility.ts Opponent slot visibility rules
  components/     UI (GameBoard, Cards, DraftScreen, …)
  hooks/          useAnimatedGame — state + animation queue
  ui/             detectAnimations — state diff → animation plans
  styles/         Design tokens (tokens.css)
```

---

## Game constants

| Constant | Value |
|----------|-------|
| Rounds | 5 |
| Poker hand size | 5 (slot-based positions 0–4) |
| Effect deck size | 5 per player |
| Max effects per round | 2 |
| Max copies per effect type (draft) | 2 |
| Shared deck | Standard 52-card deck |

---

## Bot

The bot builds a balanced 5-card effect deck and each round commits 0–2 actions using hand/threat scoring, marginal card value, and round timing (early vs late game). See [docs/GAME.md](docs/GAME.md#bot-ai).

---

## License

Private prototype — see repository owner for usage terms.
