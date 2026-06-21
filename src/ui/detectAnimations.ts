import type { GameState, PlayerId, EffectType, EffectCard, PlayingCard, CommittedAction } from '../game/types';
import { getOpponent } from '../game/gameEngine';

export type MechanicalAnimType =
  | 'swap'
  | 'transform'
  | 'shift'
  | 'freeze'
  | 'send_back'
  | 'protect'
  | 'cleanse'
  | 'draw'
  | 'reveal'
  | 'spy'
  | 'force_delete'
  | 'instant'
  | 'none';

export interface CastAnimation {
  kind: 'effect' | 'draw';
  playerId: PlayerId;
  effect?: EffectCard;
  mechanical: MechanicalAnimType;
  targetCardIds: string[];
  cardBefore?: PlayingCard;
  cardAfter?: PlayingCard;
  swapCardIds?: [string, string];
  opponentEffectId?: string;
  committedAction?: CommittedAction;
  logMessage?: string;
  stepIndex?: number;
  stepTotal?: number;
}

export type AnimationPlan = CastAnimation;

function findRemovedEffect(prev: EffectCard[], next: EffectCard[]): EffectCard | null {
  const nextIds = new Set(next.map(e => e.id));
  const removed = prev.filter(e => !nextIds.has(e.id));
  return removed.length === 1 ? removed[0] : null;
}

function findChangedPokerCard(
  prevHand: PlayingCard[],
  nextHand: PlayingCard[],
): { before: PlayingCard; after: PlayingCard } | null {
  for (const p of prevHand) {
    const n = nextHand.find(c => c.id === p.id);
    if (n && (n.suit !== p.suit || n.rank !== p.rank)) {
      return { before: p, after: n };
    }
  }
  return null;
}

function findNewPokerCard(prevHand: PlayingCard[], nextHand: PlayingCard[]): PlayingCard | null {
  const prevIds = new Set(prevHand.map(c => c.id));
  return nextHand.find(c => !prevIds.has(c.id)) ?? null;
}

function findRemovedPokerCard(prevHand: PlayingCard[], nextHand: PlayingCard[]): PlayingCard | null {
  const nextIds = new Set(nextHand.map(c => c.id));
  return prevHand.find(c => !nextIds.has(c.id)) ?? null;
}

function getResolvingItem(prev: GameState) {
  return prev.resolutionQueue[prev.resolutionIndex] ?? null;
}

function detectMechanical(
  prev: GameState,
  next: GameState,
  actorId: PlayerId,
  effectType: EffectType,
  action = getResolvingItem(prev)?.action,
): Pick<CastAnimation, 'mechanical' | 'targetCardIds' | 'cardBefore' | 'cardAfter' | 'swapCardIds' | 'opponentEffectId'> {
  const opponentId = getOpponent(actorId);

  if (effectType === 'steal_card') {
    const changedIds: string[] = [];
    for (const pid of [actorId, opponentId] as PlayerId[]) {
      const change = findChangedPokerCard(prev.players[pid].pokerHand, next.players[pid].pokerHand);
      if (change) changedIds.push(change.before.id);
    }
    return {
      mechanical: 'swap',
      targetCardIds: changedIds,
      swapCardIds: changedIds.length >= 2 ? [changedIds[0], changedIds[1]] as [string, string] : undefined,
    };
  }

  if (effectType === 'transform' || effectType === 'shift_chance') {
    const hand = next.players[actorId].pokerHand;
    const prevHand = prev.players[actorId].pokerHand;
    const change = findChangedPokerCard(prevHand, hand);
    if (change) {
      return {
        mechanical: effectType === 'transform' ? 'transform' : 'shift',
        targetCardIds: [change.after.id],
        cardBefore: change.before,
        cardAfter: change.after,
      };
    }
  }

  if (effectType === 'freeze') {
    const oppHand = next.players[opponentId].pokerHand;
    const prevOpp = prev.players[opponentId].pokerHand;
    for (const c of oppHand) {
      const p = prevOpp.find(x => x.id === c.id);
      if (p && c.frozenUntilTurn > p.frozenUntilTurn) {
        return { mechanical: 'freeze', targetCardIds: [c.id] };
      }
    }
  }

  if (effectType === 'protect') {
    const hand = next.players[actorId].pokerHand;
    const prevHand = prev.players[actorId].pokerHand;
    for (const c of hand) {
      const p = prevHand.find(x => x.id === c.id);
      if (p && c.protectedUntilTurn > p.protectedUntilTurn) {
        return { mechanical: 'protect', targetCardIds: [c.id] };
      }
    }
  }

  if (effectType === 'last_draw') {
    const hand = next.players[actorId].pokerHand;
    const prevHand = prev.players[actorId].pokerHand;
    const newCard = findNewPokerCard(prevHand, hand);
    const oldCard = findRemovedPokerCard(prevHand, hand);
    if (newCard) {
      return {
        mechanical: 'send_back',
        targetCardIds: [newCard.id],
        cardBefore: oldCard ?? undefined,
        cardAfter: newCard,
      };
    }
  }

  if (effectType === 'send_back') {
    const prevOpp = prev.players[opponentId].pokerHand;
    const nextOpp = next.players[opponentId].pokerHand;
    const newCard = findNewPokerCard(prevOpp, nextOpp);
    const oldCard = findRemovedPokerCard(prevOpp, nextOpp);
    if (newCard) {
      return {
        mechanical: 'send_back',
        targetCardIds: [newCard.id],
        cardBefore: oldCard ?? undefined,
        cardAfter: newCard,
      };
    }
  }

  if (effectType === 'cleanse') {
    for (const pid of ['player', 'bot'] as PlayerId[]) {
      const hand = next.players[pid].pokerHand;
      const prevHand = prev.players[pid].pokerHand;
      for (const c of hand) {
        const p = prevHand.find(x => x.id === c.id);
        if (p && p.frozenUntilTurn > 0 && c.frozenUntilTurn === 0) {
          return { mechanical: 'cleanse', targetCardIds: [c.id] };
        }
      }
    }
  }

  if (effectType === 'spy') {
    return {
      mechanical: 'spy',
      targetCardIds: [],
      opponentEffectId: action?.opponentEffectId,
    };
  }

  if (effectType === 'force_delete') {
    return {
      mechanical: 'force_delete',
      targetCardIds: [],
      opponentEffectId: action?.opponentEffectId,
    };
  }

  return { mechanical: 'none', targetCardIds: [] };
}

function detectDrawPlans(prev: GameState, next: GameState): AnimationPlan[] {
  const plans: AnimationPlan[] = [];
  for (const pid of ['player', 'bot'] as PlayerId[]) {
    const newCard = findNewPokerCard(prev.players[pid].pokerHand, next.players[pid].pokerHand);
    if (newCard) {
      plans.push({
        kind: 'draw',
        playerId: pid,
        mechanical: 'reveal',
        targetCardIds: [newCard.id],
        logMessage: pid === 'player' ? 'Sen desteden kart çektin' : 'Bot desteden kart çekti',
      });
    }
  }
  return plans;
}

export function detectAnimations(prev: GameState, next: GameState): AnimationPlan[] {
  const plans: AnimationPlan[] = [];
  const resolvingItem = getResolvingItem(prev);
  const actorId = resolvingItem?.playerId ?? next.resolvingPlayer ?? prev.resolvingPlayer ?? null;
  const action = resolvingItem?.action;
  const newLog = next.log.length > prev.log.length ? next.log[next.log.length - 1] : null;
  const stepTotal = prev.resolutionQueue.length || next.resolutionQueue.length;
  const stepIndex = prev.resolutionIndex >= 0 ? prev.resolutionIndex + 1 : undefined;

  if (actorId && newLog) {
    const removed = findRemovedEffect(prev.players[actorId].effectHand, next.players[actorId].effectHand);
    if (removed) {
      const mech = detectMechanical(prev, next, actorId, removed.type, action);
      const isFizzle = newLog.message.includes('etkisiz');
      plans.push({
        kind: 'effect',
        playerId: actorId,
        effect: removed,
        mechanical: isFizzle ? 'instant' : mech.mechanical,
        targetCardIds: isFizzle ? [] : mech.targetCardIds,
        cardBefore: mech.cardBefore,
        cardAfter: mech.cardAfter,
        swapCardIds: mech.swapCardIds,
        opponentEffectId: mech.opponentEffectId,
        committedAction: action,
        logMessage: newLog.message,
        stepIndex,
        stepTotal: stepTotal || undefined,
      });
    }
  }

  const drawPlans = detectDrawPlans(prev, next);
  for (const draw of drawPlans) {
    const cardId = draw.targetCardIds[0];
    const coveredByDeckEffect = plans.some(
      p => p.kind === 'effect'
        && cardId
        && p.targetCardIds.includes(cardId)
        && (p.mechanical === 'send_back' || p.effect?.type === 'last_draw'),
    );
    if (coveredByDeckEffect) continue;
    const alreadyDrawAnim = plans.some(p => p.kind === 'draw' && p.targetCardIds[0] === cardId);
    if (!alreadyDrawAnim) plans.push(draw);
  }

  return plans;
}

export function getCardAnimationClass(
  cardId: string,
  mechanical: MechanicalAnimType | null,
  targetCardIds: string[],
): string | null {
  if (!mechanical || !targetCardIds.includes(cardId)) return null;
  switch (mechanical) {
    case 'swap': return 'anim-swap-airborne';
    case 'freeze': return 'anim-freeze-crystallize';
    case 'protect': return 'anim-protect-cast';
    case 'cleanse': return 'anim-cleanse-break';
    default: return null;
  }
}

export function getEffectDrawClass(_effectId: string, _drawingIds: string[]): string | null {
  return null;
}

export function findCardOwner(state: GameState, cardId: string): PlayerId | null {
  if (state.players.player.pokerHand.some(c => c.id === cardId)) return 'player';
  if (state.players.bot.pokerHand.some(c => c.id === cardId)) return 'bot';
  return null;
}
