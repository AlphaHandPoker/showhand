import { CARD_DECK_REVEAL_MS } from '../audio/sounds';
import { prefersReducedMotion } from './motion';

export const SWAP_LIFT_MS = 180;
export const SWAP_CROSS_MS = 320;
export const SWAP_LAND_MS = 150;
export const SWAP_TOTAL_MS = SWAP_LIFT_MS + SWAP_CROSS_MS + SWAP_LAND_MS;

export const RETURN_TO_DECK_MS = 280;
export const DECK_REPLACEMENT_TOTAL_MS = RETURN_TO_DECK_MS + CARD_DECK_REVEAL_MS;

export const SHRED_MS = 450;
export const FREEZE_CRYSTALLIZE_MS = 450;
export const CLEANSE_MS = 450;
export const PROTECT_CAST_MS = 500;
export const SPY_FLIP_MS = 400;
export const SLOT_MACHINE_MS = 1500;
export const SLOT_MACHINE_REDUCED_MS = 200;

export function effectDurationMs(fullMs: number, reducedMs = 120): number {
  return prefersReducedMotion() ? reducedMs : fullMs;
}

export function deckReplacementDurationMs(): number {
  return effectDurationMs(DECK_REPLACEMENT_TOTAL_MS);
}
