# SHOWHAND — Game Design Document

SHOWHAND is a two-player poker duel where **open poker hands** meet **hidden effect cards**. Information is partial, commitments are simultaneous, and resolution is sequential. The goal is the best 5-card poker hand after 5 rounds — but effect cards can steal, freeze, transform, and otherwise rewrite the board along the way.

---

## Core loop

```
Draft (5 effects) → Round 1…5:
  1. Draw 1 poker card each (into next slot)
  2. Commit phase — pick 0–2 effects + targets, lock (blind)
  3. Resolution — all committed effects resolve in order
  4. Status expiry, next round
→ Showdown — compare poker hands
```

There is **no mid-game effect draw**. Each player starts with exactly 5 effect cards and uses them over the match.

---

## Setup

### Poker deck

- One shared **52-card** standard deck (4 suits × 13 ranks).
- Each physical card exists **once** in the game. Cards on the table or in a hand are removed from the deck; returned cards go back to the deck.
- Ranks: 2–10, J(11), Q(12), K(13), A(14). Ace-high straight; wheel (A-2-3-4-5) supported at showdown.

### Effect deck (draft)

Before the match, each player selects **5 effect cards**:

- Choose from **10 effect types** (see below).
- **At most 2** copies of the same type.
- The bot auto-builds a deck with at least one card from each category (self-buff, disrupt, info).

### Starting player

A random player is designated `startingPlayer`. This affects **resolution order** in odd rounds.

### Initial draw

Round 1 begins in the **committing** phase. Each player immediately receives **1 poker card** in slot 0 (first position). By round 5, both players have 5 cards in slots 0–4.

---

## Slot-based hands

Poker cards sit in **fixed slots** 0–4 (displayed left to right as positions 1–5).

- Effects target **slots**, not card IDs. If a card in a slot changes during resolution, later effects still refer to that slot index.
- Empty slots (not yet drawn) cannot be targeted.
- Your own slots are always visible to you. Opponent slots are visible only **after** a card has been drawn there.

---

## Round structure

### 1. Commit phase (`phase: 'committing'`)

Both players secretly choose actions:

- **0 to 2** effect cards per round (`MAX_CARDS_PER_ROUND = 2`).
- Each action includes the effect type, the effect card ID, and required targets (slots and/or opponent effect ID).
- Player clicks **Kilitle** (Lock) or **Pas Geç** (Pass = lock with 0 actions).
- When the player locks, the **bot commits** in the same moment (not visible to the player).
- Neither side sees the other's commit until resolution.

**Multi-step targeting (player UI):**

1. Click an effect card in your hand.
2. Click valid poker slots and/or opponent effect backs as prompted.
3. Repeat for a second effect if desired.
4. Lock when ready.

### 2. Resolution phase (`phase: 'resolving'`)

All committed actions form a **resolution queue**:

1. Determine order: `getResolutionOrder()` — in **odd** rounds, `startingPlayer` resolves first; in **even** rounds, the other player first. Within each player, actions resolve in commit order.
2. Queue is built as: `[first player's actions…, second player's actions…]`.
3. Each action resolves one at a time with animations.
4. At resolution time, targets are **re-validated**. If invalid (card protected, frozen, slot empty, effect gone, etc.), the action **fizzles**: the effect card is still **consumed**, but nothing happens.

### 3. End of round

- Round counter increments.
- **Protect** and **freeze** durations tick (checked against `currentRound`).
- Each player draws **one** new poker card into the next empty slot (if hand &lt; 5).
- Commits reset; phase returns to **committing**.

After round 5 resolves, the game moves to **finished** and hands are compared.

---

## Card statuses

| Status | Field | Meaning |
|--------|--------|---------|
| **Protected** | `protectedUntilTurn` | Cannot be targeted by opponent effects until this round (inclusive). |
| **Frozen** | `frozenUntilTurn` | Cannot be targeted (by anyone) until this round ends. |

A card is targetable when `canTargetCard()` is true: not protected and not frozen for the current round.

Status icons appear under cards in the UI (🛡 protect, ❄ freeze) with turns remaining.

---

## Effect cards

### Aggressive (red)

| ID | Name | Target | Effect |
|----|------|--------|--------|
| `steal_card` | Kart Çal | Opponent slot + your slot | Swap the two cards (positions exchange). Both must be targetable. |
| `send_back` | Geri Yolla | Opponent slot | Opponent's card returns to deck; random new card drawn into that slot. |
| `freeze` | Dondur | Opponent slot | Card frozen for **2 rounds** (including current). |
| `force_delete` | Zorla Sil | Opponent effect (face-down) | Remove one effect card from opponent's hand permanently. |

### Defensive (green)

| ID | Name | Target | Effect |
|----|------|--------|--------|
| `protect` | Koru | Your slot | Card protected for **3 rounds**. |
| `cleanse` | Temizle | Any frozen slot (yours or opponent's) | Removes freeze from that card. |
| `last_draw` | Son Çekiliş | Your slot | Send card to deck; draw random replacement. New card gets **2 rounds** protection. |

### Utility (purple)

| ID | Name | Target | Effect |
|----|------|--------|--------|
| `transform` | Dönüştür | Your slot | Change suit to a random **available** suit of the same rank from the deck. |
| `shift_chance` | Şans Kaydır | Your slot | Change rank by ±1 or ±2 on the rank ring (A↔2 wrap), same suit, to an **available** deck rank. |
| `spy` | Casus | Opponent effect | Reveals one opponent effect type (shown in UI this round). Does not remove it. |

**Transform / shift chance:** Only ranks/suits still present in the deck can be chosen. The old card returns to the deck; the new card takes the same slot and keeps status timers.

---

## Fizzling

Blind commit is risky. On resolution, an action fizzles if:

- Required target slot is empty or not visible (for opponent targets).
- Target card is protected or frozen.
- Opponent effect was already deleted.
- No valid transform/shift outcomes exist in the deck.
- Cleanse target is not frozen.

Fizzled actions log: `"<Effect>: etkisiz kaldı (<reason>)"`. The effect card is still discarded.

---

## Showdown

When round 5 completes:

- Both hands must have 5 cards.
- Standard poker ranking (high to low): Royal Flush → Straight Flush → Four of a Kind → Full House → Flush → Straight → Three of a Kind → Two Pair → Pair → High Card.
- Tiebreakers use kickers per `compareHands()` in `poker.ts`.
- Partial hands during rounds 1–4 show an **estimated** rank in the side ladder (marked `~N` for N cards).

---

## Bot AI

The bot (`bot.ts` + `botScoring.ts`):

1. **Deck:** `buildBotDeckSelection()` — at least one self-buff, disrupt, and info card; weighted fill to 5 cards.
2. **Each round:** Scores every playable effect; picks up to 2 above threshold (`PLAY_THRESHOLD` / `SECOND_PLAY_THRESHOLD`).
3. **Scoring inputs:**
   - `computeBotHandScore` — bot's full visible hand + draw potential.
   - `computeThreatScore` — player's **drawn** cards only.
4. **Targeting:** `pickBestOwnTarget` / `pickBestOpponentTarget` using marginal card value.
5. **Timing:** `roundModifier()` — e.g. spy strong early, shift_chance strong late, transform strong early.
6. **Spy memory:** Records spied player effects for future decisions.

If bot logic throws, it commits **0 actions** so the game never soft-locks.

---

## UI overview

| Area | Purpose |
|------|---------|
| **Left** | Hand rank ladder — player (green) vs bot (red) on poker hierarchy |
| **Center top** | Bot poker hand + hand rank + hidden effect backs |
| **Center** | Round indicator, deck pile, action hints, resolution feed, lock button |
| **Center bottom** | Player poker hand (larger cards) + effect tray |
| **Right** | Scrollable event log (newest on top) |

**Resolution feed:** During `resolving`, shows queued actions step-by-step with active/done states.  
**Cast overlay:** Full-screen animation for each resolving effect or draw.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Commit** | Lock in chosen effects before resolution |
| **Resolve** | Apply committed effects in queue order |
| **Slot** | Fixed position 0–4 in a poker hand |
| **Fizzle** | Effect consumed with no result |
| **Partial hand** | Fewer than 5 cards; estimated rank only |
