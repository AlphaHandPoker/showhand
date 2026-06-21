# SHOWHAND — Technical Architecture

This document describes how the codebase implements the game. All core rules live in `src/game/` as **pure TypeScript** with no React dependencies, so logic can be tested and reused independently of the UI.

---

## State model

The single source of truth is `GameState` (`types.ts`):

```typescript
interface GameState {
  deck: PlayingCard[];                    // Shared pool (not on table)
  players: Record<PlayerId, Player>;    // pokerHand + effectHand
  currentRound: number;                   // 1…TOTAL_ROUNDS (5)
  startingPlayer: PlayerId;             // Resolution tie-break seed
  phase: 'committing' | 'resolving' | 'finished';
  roundCommits: Record<PlayerId, PlayerCommit>;
  resolutionQueue: ResolutionItem[];
  resolutionIndex: number;                // Next item to resolve
  resolvingPlayer: PlayerId | null;       // Actor for current animation step
  spyReveal: { type: EffectType; playerId: PlayerId } | null;
  log: GameLogEntry[];
  winner: PlayerId | 'tie' | null;
}
```

Updates are **immutable at boundaries**: engine functions clone hands/deck/log before mutating and return a new `GameState`.

---

## Module map

| Module | Responsibility |
|--------|----------------|
| `types.ts` | Types, `EFFECT_NAMES`, `EFFECT_DESCRIPTIONS`, constants |
| `deck.ts` | Create/shuffle 52-card deck, rank labels, `shiftRankByDelta` (A↔2) |
| `deckBuilder.ts` | Effect card IDs, draft validation, bot deck builder |
| `poker.ts` | `evaluateHand`, `compareHands`, `getHandHighlights` — partial hands safe |
| `effects.ts` | Targeting helpers, transform/shift/swap/deck draw, slot lookup |
| `visibility.ts` | `isSlotVisibleToViewer` — opponent slots visible iff card drawn |
| `gameEngine.ts` | `createGame`, commit validation, `lockPlayerCommit`, `resolveNextInQueue` |
| `bot.ts` | `buildBotCommit` — 0–2 `CommittedAction`s per round |
| `botScoring.ts` | Hand/threat scores, marginal value, spy intel |
| `effectMeta.ts` | UI categories (aggressive/defensive/utility), icons |

---

## Game engine flow

### `createGame(playerEffects, botEffects)`

1. Reset deck/effect ID counters and bot intel.
2. Build empty poker hands, deal effect hands, pick random `startingPlayer`.
3. `drawRoundCards()` — one card per player into next slot.
4. Set `phase: 'committing'`.

### `lockPlayerCommit(state, actions)`

1. Validate player actions (`validateCommittedActions`).
2. Deep-clone state; store player commit.
3. `buildBotCommit(newState)` for bot actions (try/catch → empty on failure).
4. Build `resolutionQueue` from `getResolutionOrder()` × each player's actions.
5. Set `phase: 'resolving'`. If queue empty, skip to `finishResolutionPhase`.

### `resolveNextInQueue(state)`

1. Take item at `resolutionIndex`.
2. Set `resolvingPlayer`; run `resolveCommittedAction` (may fizzle).
3. Increment index; if done, `finishResolutionPhase`.

### `finishResolutionPhase`

- If `currentRound >= TOTAL_ROUNDS` → `finishGame` (compare hands).
- Else → `endRound` (expire statuses, draw cards, reset commits, `phase: 'committing'`).

---

## Resolution order

```typescript
function getResolutionOrder(state): PlayerId[] {
  const starter = state.startingPlayer;
  const other = getOpponent(starter);
  const first = state.currentRound % 2 === 1 ? starter : other;
  return [first, getOpponent(first)];
}
```

Odd rounds: starter's full commit list, then opponent's.  
Even rounds: reversed.

---

## Committed action shape

```typescript
interface CommittedAction {
  effectId: string;
  effectType: EffectType;
  ownSlot?: SlotIndex;           // 0|1|2|3|4
  opponentSlot?: SlotIndex;
  opponentEffectId?: string;     // spy, force_delete
  cleanseOwnerId?: PlayerId;
  cleanseSlot?: SlotIndex;
}
```

Validation and resolution share the same target rules via `getValidOwnSlots`, `getValidOpponentSlots`, `getValidCleanseTargets`, and `canCommitEffectType`.

---

## UI architecture

```
App.tsx
  DraftScreen → player picks 5 effects
  GameBoard   → main match UI

GameBoard
  useAnimatedGame(initialState)
    game / displayGame / visual state
    applyUpdate(nextState) → animation queue

useAnimatedGame
  detectAnimations(prev, next) → AnimationPlan[]
  Sequential: cast overlay → mechanical card anims → commit displayGame

Components
  Cards.tsx          PlayingCardSlot, EffectCardView, OpponentEffectStack
  HandRankLadder     Partial-hand estimated ranks
  HandRankBadge      Current hand tier pill
  ResolutionFeed     Resolution queue UI
  EffectCastOverlay  Center-screen effect/draw animation
```

### Animation pipeline

1. `GameBoard.runResolution` loops `resolveNextInQueue` and calls `applyUpdate` per step.
2. `detectAnimations` compares prev/next state:
   - Removed effect from actor's hand → effect cast plan (+ log message, step index).
   - New poker cards → draw plans.
   - Mechanical type: swap, transform, freeze, protect, etc.
3. `useAnimatedGame` runs plans sequentially with timed delays (`CAST_MS`, `MECH_MS`, `BETWEEN_PLANS_MS`).

Display uses `displayGame` during animations so the board can lag one step behind `game` for smooth visuals.

---

## Key files for common changes

| Change | Primary files |
|--------|----------------|
| New effect type | `types.ts`, `gameEngine.ts` (validate + resolve), `effectMeta.ts`, `GameBoard.tsx` (pick flow), `bot.ts`, `detectAnimations.ts` |
| Round count | `TOTAL_ROUNDS` in `types.ts`, UI strings |
| Bot difficulty | `bot.ts` thresholds, `botScoring.ts` weights |
| Card visuals | `Card.css`, `Cards.tsx` |
| Layout | `GameBoard.tsx`, `GameBoard.css` |

---

## Build & run

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run lint     # ESLint
```

Entry: `src/main.tsx` → `App.tsx`.  
Global styles: `App.css`, `styles/tokens.css`, `index.css`.

---

## Testing notes

There is no automated test suite yet. To sanity-check logic:

- `npm run build` — TypeScript strict compile.
- Play a full match: draft → 5 rounds → showdown.
- Force fizzles: commit freeze on a slot, then protect it before resolution (via simultaneous blind commit scenarios).

For bot stress testing, a standalone simulation script can call `createGame` + `lockPlayerCommit` + `resolveNextInQueue` in a loop without React.
