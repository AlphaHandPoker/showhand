import type { PlayingCard, Rank, Suit, EffectType } from './types';
import { evaluateHand, HandRank } from './poker';
import {
  getAvailableSuitsForTransform, getShiftChanceTargets,
} from './effects';

const RANK_BASE: Record<HandRank, number> = {
  [HandRank.HighCard]: 0,
  [HandRank.Pair]: 100,
  [HandRank.TwoPair]: 200,
  [HandRank.ThreeOfAKind]: 300,
  [HandRank.Straight]: 400,
  [HandRank.Flush]: 500,
  [HandRank.FullHouse]: 600,
  [HandRank.FourOfAKind]: 700,
  [HandRank.StraightFlush]: 800,
  [HandRank.RoyalFlush]: 900,
};

function rankCounts(cards: PlayingCard[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const c of cards) {
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }
  return counts;
}

function suitCounts(cards: PlayingCard[]): Map<Suit, number> {
  const counts = new Map<Suit, number>();
  for (const c of cards) {
    counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  }
  return counts;
}

/** 4 same suit + 1 off → flush draw */
function flushDrawBonus(cards: PlayingCard[]): number {
  if (cards.length < 4) return 0;
  const max = Math.max(...suitCounts(cards).values(), 0);
  if (max >= 4) return 40;
  if (cards.length >= 3 && max >= 3) return 18;
  return 0;
}

const RANK_RING: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

/** 4 consecutive ranks (one card away from straight) */
function straightDrawBonus(cards: PlayingCard[]): number {
  if (cards.length < 4) return 0;
  const indices = [...new Set(cards.map(c => RANK_RING.indexOf(c.rank)))].sort((a, b) => a - b);
  if (indices.length < 4) return 0;

  for (let i = 0; i <= indices.length - 4; i++) {
    const slice = indices.slice(i, i + 4);
    const span = slice[3] - slice[0];
    if (span <= 4) return 35;
  }
  return 0;
}

/** Pair exists — third matching rank reachable via shift */
function tripsDrawBonus(cards: PlayingCard[], deck: PlayingCard[]): number {
  const counts = rankCounts(cards);
  for (const [rank, count] of counts) {
    if (count !== 2) continue;
    const card = cards.find(c => c.rank === rank);
    if (!card) continue;
    if (getShiftChanceTargets(deck, card.suit, card.rank).length > 0) return 30;
  }
  return 0;
}

function partialScale(cardCount: number): number {
  if (cardCount >= 5) return 1;
  return 0.55 + cardCount * 0.09;
}

export function computeHandScore(cards: PlayingCard[], deck: PlayingCard[] = []): number {
  if (cards.length === 0) return 0;

  const ev = evaluateHand(cards);
  let score = RANK_BASE[ev.rank] + (ev.tiebreakers[0] ?? 0) * 0.5;
  score += flushDrawBonus(cards);
  score += straightDrawBonus(cards);
  score += tripsDrawBonus(cards, deck);
  const scale = cards.length >= 5 ? 1 : partialScale(cards.length);
  return score * scale;
}

/** Bot eli — her zaman 5 kart, tam bilgi */
export function computeBotHandScore(cards: PlayingCard[], deck: PlayingCard[] = []): number {
  return computeHandScore(cards, deck);
}

/** Rakibin yalnızca açılmış kartları — gizli slotlar hesaba katılmaz */
export function computeThreatScore(revealedCards: PlayingCard[], deck: PlayingCard[] = []): number {
  return computeHandScore(revealedCards, deck);
}

export function cardMarginalValue(card: PlayingCard, hand: PlayingCard[], deck: PlayingCard[]): number {
  const full = computeHandScore(hand, deck);
  const without = computeHandScore(hand.filter(c => c.id !== card.id), deck);
  return full - without;
}

export function estimateTransformGain(
  hand: PlayingCard[],
  card: PlayingCard,
  deck: PlayingCard[],
): number {
  const suits = getAvailableSuitsForTransform(deck, card.rank, card.suit);
  if (suits.length === 0) return 0;

  let best = 0;
  for (const suit of suits) {
    const next = hand.map(c => (c.id === card.id ? { ...c, suit } : c));
    best = Math.max(best, computeHandScore(next, deck) - computeHandScore(hand, deck));
  }
  return best;
}

export function estimateShiftGain(
  hand: PlayingCard[],
  card: PlayingCard,
  deck: PlayingCard[],
): number {
  const targets = getShiftChanceTargets(deck, card.suit, card.rank);
  if (targets.length === 0) return 0;

  let total = 0;
  for (const rank of targets) {
    const next = hand.map(c => (c.id === card.id ? { ...c, rank } : c));
    total += computeHandScore(next, deck) - computeHandScore(hand, deck);
  }
  return total / targets.length;
}

export function pickBestOwnTarget(
  hand: PlayingCard[],
  deck: PlayingCard[],
  mode: 'buff' | 'discard',
): PlayingCard | null {
  if (hand.length === 0) return null;

  if (mode === 'discard') {
    let worst = hand[0];
    let worstVal = Infinity;
    for (const c of hand) {
      const v = cardMarginalValue(c, hand, deck);
      if (v < worstVal) {
        worstVal = v;
        worst = c;
      }
    }
    return worst;
  }

  let best = hand[0];
  let bestVal = -Infinity;
  for (const c of hand) {
    const v = Math.max(
      estimateTransformGain(hand, c, deck),
      estimateShiftGain(hand, c, deck),
      cardMarginalValue(c, hand, deck),
    );
    if (v > bestVal) {
      bestVal = v;
      best = c;
    }
  }
  return best;
}

export function pickBestOpponentTarget(
  opponentHand: PlayingCard[],
  deck: PlayingCard[],
): PlayingCard | null {
  if (opponentHand.length === 0) return null;

  let best = opponentHand[0];
  let bestVal = -Infinity;
  for (const c of opponentHand) {
    const v = cardMarginalValue(c, opponentHand, deck);
    if (v > bestVal) {
      bestVal = v;
      best = c;
    }
  }
  return best;
}

const botIntel: { playerEffects: EffectType[] } = { playerEffects: [] };

export function resetBotIntel(): void {
  botIntel.playerEffects = [];
}

export function recordSpyIntel(type: EffectType): void {
  if (!botIntel.playerEffects.includes(type)) {
    botIntel.playerEffects.push(type);
  }
}

export function playerHasKnownEffect(type: EffectType): boolean {
  return botIntel.playerEffects.includes(type);
}
