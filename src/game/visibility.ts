import type { GameState, PlayerId } from './types';
import { getCardAtSlot } from './effects';

/** Çekilmiş kartlar herkese görünür; boş slot hedeflenemez */
export function isSlotVisibleToViewer(
  state: GameState,
  ownerId: PlayerId,
  slotIndex: number,
  viewerId: PlayerId,
): boolean {
  if (ownerId === viewerId) return true;
  return getCardAtSlot(state, ownerId, slotIndex) !== undefined;
}
