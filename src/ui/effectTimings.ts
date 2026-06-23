import { CARD_DECK_REVEAL_MS } from '../audio/sounds';
import { prefersReducedMotion } from './motion';

/** Smooth deceleration — reads well at 60fps without feeling sluggish. */
export const FLIGHT_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';

export const HAND_TO_CENTER_MS = 780;
export const EFFECT_TO_SLOT_MS = 620;

export const SPY_FLIP_MS = 720;
export const SPY_REVEAL_HOLD_MS = 900;

export const FORCE_SHRED_HOLD_MS = 280;
export const FORCE_SHRED_MS = 1100;

export const SWAP_LIFT_MS = 220;
export const SWAP_CROSS_MS = 420;
export const SWAP_LAND_MS = 200;
export const SWAP_TOTAL_MS = SWAP_LIFT_MS + SWAP_CROSS_MS + SWAP_LAND_MS;

export const RETURN_TO_DECK_MS = 340;
export const DECK_REPLACEMENT_TOTAL_MS = RETURN_TO_DECK_MS + CARD_DECK_REVEAL_MS;

export const SHRED_MS = FORCE_SHRED_MS;
export const FREEZE_CRYSTALLIZE_MS = 520;
export const CLEANSE_MS = 520;
export const PROTECT_CAST_MS = 580;
export const SLOT_MACHINE_MS = 1500;
export const SLOT_MACHINE_REDUCED_MS = 200;

export function effectDurationMs(fullMs: number, reducedMs = 120): number {
  return prefersReducedMotion() ? reducedMs : fullMs;
}

export function deckReplacementDurationMs(): number {
  return effectDurationMs(DECK_REPLACEMENT_TOTAL_MS);
}
