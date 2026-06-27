import type { GameMode, GameState } from './types';
import { MAX_CARDS_PER_ROUND } from './types';

export const GAME_MODE_INFO: Record<GameMode, { title: string; subtitle: string }> = {
  draft: {
    title: 'Klasik',
    subtitle: '5 kartlı draft · round başına en fazla 2 efekt',
  },
  full_deck: {
    title: 'Tam Deste',
    subtitle: 'Her efektten 1 kart · round başına 1 efekt',
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
