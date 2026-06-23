import type { CommittedAction, EffectCard, EffectType, PlayerId } from '../game/types';
import { getOpponent } from '../game/gameEngine';
import { getActionTargetSlots, type TargetSlot } from './resolutionTargets';

export interface EffectToken {
  id: string;
  effect: EffectCard;
  roundsLeft?: number;
  entering?: boolean;
  leaving?: boolean;
}

export const TOKEN_ROUNDS: Partial<Record<EffectType, number>> = {
  freeze: 2,
  protect: 3,
};

export function shouldAddToken(effectType: EffectType): boolean {
  return effectType !== 'spy' && effectType !== 'force_delete';
}

/** Slot üzerinde tur sayacıyla kalıcı token (freeze, protect). */
export function shouldPersistToken(effectType: EffectType): boolean {
  return TOKEN_ROUNDS[effectType] !== undefined;
}

export function getTokenTargetSlots(
  action: CommittedAction,
  actorId: PlayerId,
): TargetSlot[] {
  if (!shouldAddToken(action.effectType)) return [];
  if (action.effectType === 'steal_card') {
    if (action.opponentSlot === undefined) return [];
    return [{ ownerId: getOpponent(actorId), slotIndex: action.opponentSlot }];
  }
  return getActionTargetSlots(action, actorId);
}

export function slotKey(ownerId: PlayerId, slotIndex: number): string {
  return `${ownerId}-${slotIndex}`;
}

let tokenCounter = 0;
export function nextTokenId(): string {
  return `tok-${++tokenCounter}`;
}

export function addTokenToSlot(
  tokens: Map<string, EffectToken[]>,
  slotKeyStr: string,
  token: EffectToken,
): Map<string, EffectToken[]> {
  const next = new Map(tokens);
  const existing = next.get(slotKeyStr) ?? [];
  next.set(slotKeyStr, [...existing, token]);
  return next;
}

export function removeTokenFromSlot(
  tokens: Map<string, EffectToken[]>,
  slotKeyStr: string,
  tokenId: string,
): Map<string, EffectToken[]> {
  const next = new Map(tokens);
  const existing = next.get(slotKeyStr) ?? [];
  const filtered = existing.filter(t => t.id !== tokenId);
  if (filtered.length > 0) {
    next.set(slotKeyStr, filtered);
  } else {
    next.delete(slotKeyStr);
  }
  return next;
}

export function decrementAllTokens(
  tokens: Map<string, EffectToken[]>,
): { updated: Map<string, EffectToken[]>; expired: Array<{ slotKey: string; token: EffectToken }> } {
  const updated = new Map<string, EffectToken[]>();
  const expired: Array<{ slotKey: string; token: EffectToken }> = [];
  for (const [key, arr] of tokens) {
    const kept: EffectToken[] = [];
    for (const t of arr) {
      if (t.roundsLeft !== undefined) {
        const next = t.roundsLeft - 1;
        if (next <= 0) {
          expired.push({ slotKey: key, token: { ...t, leaving: true } });
        } else {
          kept.push({ ...t, roundsLeft: next });
        }
      } else {
        kept.push(t);
      }
    }
    if (kept.length > 0) updated.set(key, kept);
  }
  return { updated, expired };
}
