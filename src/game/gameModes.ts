import type { GameMode, GameState } from './types';
import { MAX_CARDS_PER_ROUND } from './types';

/** Active default for all match flows until draft mode ships. */
export const DEFAULT_GAME_MODE: GameMode = 'full_deck';
export const DRAFT_MODE_ENABLED = false;

export const GAME_MODE_INFO: Record<GameMode, { title: string; subtitle: string }> = {
  full_deck: {
    title: 'Full Deck',
    subtitle: 'One of each effect · 1 play per round',
  },
  draft: {
    title: 'Draft Mode',
    subtitle: '5-card draft · up to 2 effects per round',
  },
};

export function getMaxCardsPerRound(mode: GameMode): number {
  return mode === 'full_deck' ? 1 : MAX_CARDS_PER_ROUND;
}

export function maxCardsForState(state: GameState): number {
  return getMaxCardsPerRound(state.gameMode);
}

export function skipsDraft(mode: GameMode): boolean {
  return mode === 'full_deck';
}
