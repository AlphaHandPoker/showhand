import type { PlayingCard, Rank } from './types';
import { cardLabel } from './deck';

export const HandRank = {
  HighCard: 1,
  Pair: 2,
  TwoPair: 3,
  ThreeOfAKind: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  FourOfAKind: 8,
  StraightFlush: 9,
  RoyalFlush: 10,
} as const;

export type HandRank = typeof HandRank[keyof typeof HandRank];

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.Pair]: 'Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
  [HandRank.RoyalFlush]: 'Royal Flush',
};

export interface EvaluatedHand {
  rank: HandRank;
  tiebreakers: number[];
  name: string;
}

function rankCounts(cards: PlayingCard[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const c of cards) {
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }
  return counts;
}

function isFlush(cards: PlayingCard[]): boolean {
  if (cards.length < 5) return false;
  return cards.every(c => c.suit === cards[0].suit);
}

function sortedRanks(cards: PlayingCard[]): Rank[] {
  return [...cards].map(c => c.rank).sort((a, b) => b - a);
}

function isStraight(ranks: Rank[]): { straight: boolean; high: Rank } {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length !== 5) return { straight: false, high: 0 as Rank };

  // A-2-3-4-5 wheel
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return { straight: true, high: 5 };
  }

  for (let i = 0; i < 4; i++) {
    if (unique[i] - unique[i + 1] !== 1) return { straight: false, high: 0 as Rank };
  }
  return { straight: true, high: unique[0] };
}

export function evaluateHand(cards: PlayingCard[]): EvaluatedHand {
  if (cards.length === 0) {
    return { rank: HandRank.HighCard, tiebreakers: [0], name: HAND_RANK_NAMES[HandRank.HighCard] };
  }

  const ranks = sortedRanks(cards);
  const counts = rankCounts(cards);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (cards.length === 5) {
    const flush = isFlush(cards);
    const { straight, high: straightHigh } = isStraight(ranks);

    if (flush && straight) {
      const isRoyal = straightHigh === 14;
      return {
        rank: isRoyal ? HandRank.RoyalFlush : HandRank.StraightFlush,
        tiebreakers: [straightHigh],
        name: isRoyal ? HAND_RANK_NAMES[HandRank.RoyalFlush] : HAND_RANK_NAMES[HandRank.StraightFlush],
      };
    }

    if (entries[0][1] === 4) {
      const quad = entries[0][0];
      const kicker = entries[1]?.[0] ?? 0;
      return { rank: HandRank.FourOfAKind, tiebreakers: [quad, kicker], name: HAND_RANK_NAMES[HandRank.FourOfAKind] };
    }

    if (entries[0][1] === 3 && entries[1]?.[1] === 2) {
      return {
        rank: HandRank.FullHouse,
        tiebreakers: [entries[0][0], entries[1][0]],
        name: HAND_RANK_NAMES[HandRank.FullHouse],
      };
    }

    if (flush) {
      return { rank: HandRank.Flush, tiebreakers: ranks, name: HAND_RANK_NAMES[HandRank.Flush] };
    }

    if (straight) {
      return { rank: HandRank.Straight, tiebreakers: [straightHigh], name: HAND_RANK_NAMES[HandRank.Straight] };
    }
  }

  if (entries[0][1] === 4) {
    const kickers = entries.slice(1).map(e => e[0]).sort((a, b) => b - a);
    return {
      rank: HandRank.FourOfAKind,
      tiebreakers: [entries[0][0], ...kickers],
      name: HAND_RANK_NAMES[HandRank.FourOfAKind],
    };
  }

  if (entries[0][1] === 3) {
    const kickers = entries.slice(1).map(e => e[0]).sort((a, b) => b - a);
    return {
      rank: HandRank.ThreeOfAKind,
      tiebreakers: [entries[0][0], ...kickers],
      name: HAND_RANK_NAMES[HandRank.ThreeOfAKind],
    };
  }

  if (entries[0][1] === 2 && entries[1]?.[1] === 2) {
    const pairs = [entries[0][0], entries[1][0]].sort((a, b) => b - a);
    const kicker = entries[2]?.[0] ?? ranks.find(r => r !== pairs[0] && r !== pairs[1]) ?? 0;
    return {
      rank: HandRank.TwoPair,
      tiebreakers: [...pairs, kicker],
      name: HAND_RANK_NAMES[HandRank.TwoPair],
    };
  }

  if (entries[0][1] === 2) {
    const kickers = entries.slice(1).map(e => e[0]).sort((a, b) => b - a);
    return {
      rank: HandRank.Pair,
      tiebreakers: [entries[0][0], ...kickers],
      name: HAND_RANK_NAMES[HandRank.Pair],
    };
  }

  return { rank: HandRank.HighCard, tiebreakers: ranks, name: HAND_RANK_NAMES[HandRank.HighCard] };
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function describeHand(cards: PlayingCard[]): string {
  const ev = evaluateHand(cards);
  const detail = ev.tiebreakers.slice(0, 3).map(r => cardLabel(r as Rank)).join(', ');
  return `${ev.name} (${detail})`;
}

/** Weakest card by contribution to hand strength (for bot / last draw) */
export function weakestCardIndex(cards: PlayingCard[]): number {
  const counts = rankCounts(cards);

  let worstIdx = 0;
  let worstScore = Infinity;

  for (let i = 0; i < cards.length; i++) {
    const without = cards.filter((_, j) => j !== i);
    const ev = evaluateHand(without.length === 4 ? [...without, { ...cards[i], rank: 2 as Rank }] : without);
    const score = ev.rank * 1000 + (ev.tiebreakers[0] ?? 0);
    const count = counts.get(cards[i].rank) ?? 1;
    const adjusted = score - count * 50;
    if (adjusted < worstScore) {
      worstScore = adjusted;
      worstIdx = i;
    }
  }
  return worstIdx;
}

export type HighlightGroup = 'primary' | 'secondary' | 'premium';

function cardsOfRank(cards: PlayingCard[], rank: Rank): PlayingCard[] {
  return cards.filter(c => c.rank === rank);
}

function getStraightCards(cards: PlayingCard[]): PlayingCard[] {
  const ranks = sortedRanks(cards);
  const { straight, high } = isStraight(ranks);
  if (!straight) return [];

  if (high === 5 && ranks.includes(14)) {
    const wheel = new Set<Rank>([14, 2, 3, 4, 5]);
    return cards.filter(c => wheel.has(c.rank));
  }

  const needed = new Set<Rank>();
  for (let r = high; r > high - 5; r--) {
    needed.add(r as Rank);
  }
  return cards.filter(c => needed.has(c.rank));
}

/** Maps card id → highlight group for the cards that form the current best hand */
export function getHandHighlights(cards: PlayingCard[]): Map<string, HighlightGroup> {
  const result = new Map<string, HighlightGroup>();
  if (cards.length === 0) return result;

  const ev = evaluateHand(cards);
  const ranks = sortedRanks(cards);

  const mark = (list: PlayingCard[], group: HighlightGroup) => {
    for (const c of list) result.set(c.id, group);
  };

  switch (ev.rank) {
    case HandRank.RoyalFlush:
    case HandRank.StraightFlush:
      mark(cards, 'premium');
      break;

    case HandRank.FourOfAKind:
      mark(cardsOfRank(cards, ev.tiebreakers[0] as Rank), 'primary');
      break;

    case HandRank.FullHouse:
      mark(cardsOfRank(cards, ev.tiebreakers[0] as Rank), 'primary');
      mark(cardsOfRank(cards, ev.tiebreakers[1] as Rank), 'secondary');
      break;

    case HandRank.Flush:
      mark(cards, 'primary');
      break;

    case HandRank.Straight:
      mark(getStraightCards(cards), 'primary');
      break;

    case HandRank.ThreeOfAKind:
      mark(cardsOfRank(cards, ev.tiebreakers[0] as Rank), 'primary');
      break;

    case HandRank.TwoPair: {
      const [highPair, lowPair] = ev.tiebreakers;
      mark(cardsOfRank(cards, highPair as Rank), 'primary');
      mark(cardsOfRank(cards, lowPair as Rank), 'secondary');
      break;
    }

    case HandRank.Pair:
      mark(cardsOfRank(cards, ev.tiebreakers[0] as Rank), 'primary');
      break;

    case HandRank.HighCard:
      mark(cards.filter(c => c.rank === ranks[0]).slice(0, 1), 'primary');
      break;
  }

  return result;
}
