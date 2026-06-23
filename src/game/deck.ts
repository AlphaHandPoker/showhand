import type { PlayingCard, Suit, Rank } from './types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const SUIT_NAMES_TR: Record<Suit, string> = {
  spades: 'Maça',
  hearts: 'Kupa',
  diamonds: 'Karo',
  clubs: 'Sinek',
};

const RANK_NAMES_TR: Partial<Record<Rank, string>> = {
  14: 'As',
  13: 'Papaz',
  12: 'Kız',
  11: 'Vale',
};

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}_${++idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createPlayingDeck(): PlayingCard[] {
  const cards: PlayingCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: uid('card'),
        suit,
        rank,
        slotIndex: 0,
        protectedUntilTurn: 0,
        frozenUntilTurn: 0,
      });
    }
  }
  return shuffle(cards);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drawCards(deck: PlayingCard[], count: number): { drawn: PlayingCard[]; remaining: PlayingCard[] } {
  const drawn = deck.slice(0, count).map((card, i) => ({ ...card, slotIndex: i }));
  const remaining = deck.slice(count);
  return { drawn, remaining };
}

export function cardKey(suit: Suit, rank: Rank): string {
  return `${suit}_${rank}`;
}

export function cardLabel(rank: Rank): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

/** Turkish playing-card name, e.g. "Kupa Papaz", "Sinek 2". */
export function playingCardName(card: Pick<PlayingCard, 'suit' | 'rank'>): string {
  const suit = SUIT_NAMES_TR[card.suit];
  const rank = RANK_NAMES_TR[card.rank as Rank] ?? String(card.rank);
  return `${suit} ${rank}`;
}

export function suitSymbol(suit: Suit): string {
  const map: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
  return map[suit];
}

export function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

const RANK_RING: Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export type RankShiftDelta = -2 | -1 | 1 | 2;

/** Circular rank step: +1 means one step "up" (8→9), -1 means down (8→7) */
export function shiftRankByDelta(rank: Rank, delta: RankShiftDelta): Rank {
  const idx = RANK_RING.indexOf(rank);
  return RANK_RING[(idx - delta + 13) % 13];
}

export function shiftRank(rank: Rank, delta: 2 | -2): Rank {
  return shiftRankByDelta(rank, delta);
}

export function resetIdCounter(): void {
  idCounter = 0;
}
