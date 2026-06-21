import type { CommittedAction, PlayerId, SlotIndex } from '../game/types';
import { getOpponent } from '../game/gameEngine';

export interface TargetSlot {
  ownerId: PlayerId;
  slotIndex: SlotIndex;
}

export function getActionTargetSlots(
  action: CommittedAction,
  actorId: PlayerId,
): TargetSlot[] {
  switch (action.effectType) {
    case 'steal_card':
      if (action.opponentSlot === undefined || action.ownSlot === undefined) return [];
      return [
        { ownerId: getOpponent(actorId), slotIndex: action.opponentSlot },
        { ownerId: actorId, slotIndex: action.ownSlot },
      ];
    case 'send_back':
    case 'freeze':
      if (action.opponentSlot === undefined) return [];
      return [{ ownerId: getOpponent(actorId), slotIndex: action.opponentSlot }];
    case 'protect':
    case 'transform':
    case 'shift_chance':
    case 'last_draw':
      if (action.ownSlot === undefined) return [];
      return [{ ownerId: actorId, slotIndex: action.ownSlot }];
    case 'cleanse':
      if (action.cleanseOwnerId === undefined || action.cleanseSlot === undefined) return [];
      return [{ ownerId: action.cleanseOwnerId, slotIndex: action.cleanseSlot }];
    default:
      return [];
  }
}

export function getActionTargetEffectId(action: CommittedAction): string | null {
  if (action.effectType === 'spy' || action.effectType === 'force_delete') {
    return action.opponentEffectId ?? null;
  }
  return null;
}

export function playerLabel(playerId: PlayerId): string {
  return playerId === 'player' ? 'Senin' : 'Rakibin';
}

export function playerShortLabel(playerId: PlayerId): string {
  return playerId === 'player' ? 'Sen' : 'Bot';
}
