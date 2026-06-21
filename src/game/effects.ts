import type { PlayingCard, Suit, Rank, PlayerId, GameState } from './types';
import { cardKey, shuffle, cardLabel, shiftRankByDelta } from './deck';

export function getOpponent(id: PlayerId): PlayerId {
  return id === 'player' ? 'bot' : 'player';
}

export function isCardProtected(card: PlayingCard, round: number): boolean {
  return card.protectedUntilTurn >= round;
}

export function isCardFrozen(card: PlayingCard, round: number): boolean {
  return card.frozenUntilTurn >= round;
}

export function canTargetCard(card: PlayingCard, round: number): boolean {
  if (isCardProtected(card, round)) return false;
  if (isCardFrozen(card, round)) return false;
  return true;
}

export function getAvailableInDeck(deck: PlayingCard[]): Set<string> {
  return new Set(deck.map(c => cardKey(c.suit, c.rank)));
}

export function findDeckCard(deck: PlayingCard[], suit: Suit, rank: Rank): PlayingCard | undefined {
  return deck.find(c => c.suit === suit && c.rank === rank);
}

export function getAvailableSuitsForTransform(
  deck: PlayingCard[],
  rank: Rank,
  currentSuit: Suit,
): Suit[] {
  const available = new Set(
    deck.filter(c => c.rank === rank).map(c => c.suit),
  );
  return [...available].filter(s => s !== currentSuit);
}

const SHIFT_CHANCE_DELTAS = [-2, -1, 1, 2] as const;

/** ±1/±2 neighbors on the rank ring that are still in the deck (not on any field) */
export function getShiftChanceTargets(
  deck: PlayingCard[],
  suit: Suit,
  currentRank: Rank,
): Rank[] {
  const available = getAvailableInDeck(deck);
  const seen = new Set<Rank>();
  const results: Rank[] = [];

  for (const delta of SHIFT_CHANCE_DELTAS) {
    const rank = shiftRankByDelta(currentRank, delta);
    if (rank === currentRank || seen.has(rank)) continue;
    if (!available.has(cardKey(suit, rank))) continue;
    seen.add(rank);
    results.push(rank);
  }

  return results;
}

export function applyTransform(
  state: GameState,
  card: PlayingCard,
): { success: boolean; newCard?: PlayingCard; message: string } {
  const suits = getAvailableSuitsForTransform(state.deck, card.rank, card.suit);
  if (suits.length === 0) {
    return { success: false, message: 'Dönüştürülebilecek müsait sembol yok' };
  }
  const newSuit = suits[Math.floor(Math.random() * suits.length)];
  const deckCard = findDeckCard(state.deck, newSuit, card.rank);
  if (!deckCard) return { success: false, message: 'Deste kartı bulunamadı' };

  state.deck = state.deck.filter(c => c.id !== deckCard.id);
  state.deck.push({ ...card, id: card.id + '_old' });

  return {
    success: true,
    newCard: {
      ...deckCard,
      id: card.id,
      slotIndex: card.slotIndex,
      protectedUntilTurn: card.protectedUntilTurn,
      frozenUntilTurn: card.frozenUntilTurn,
    },
    message: `${card.rank} sembolü ${newSuit} olarak değiştirildi`,
  };
}

export function applyShiftChance(
  state: GameState,
  card: PlayingCard,
): { success: boolean; newCard?: PlayingCard; message: string } {
  const targets = getShiftChanceTargets(state.deck, card.suit, card.rank);
  if (targets.length === 0) {
    return { success: false, message: 'Kaydırılabilecek müsait değer yok' };
  }

  const targetRank = targets[Math.floor(Math.random() * targets.length)];
  const deckCard = findDeckCard(state.deck, card.suit, targetRank);
  if (!deckCard) return { success: false, message: 'Deste kartı bulunamadı' };

  state.deck = state.deck.filter(c => c.id !== deckCard.id);
  state.deck.push({ ...card, id: card.id + '_old' });

  return {
    success: true,
    newCard: {
      ...deckCard,
      id: card.id,
      slotIndex: card.slotIndex,
      protectedUntilTurn: card.protectedUntilTurn,
      frozenUntilTurn: card.frozenUntilTurn,
    },
    message: `${cardLabel(card.rank)} → ${cardLabel(targetRank)}`,
  };
}

export function swapCards(
  hand: PlayingCard[],
  cardId: string,
  replacement: PlayingCard,
): PlayingCard[] {
  return hand.map(c => (c.id === cardId ? replacement : c));
}

export function returnCardToDeck(state: GameState, card: PlayingCard): void {
  state.deck.push({
    ...card,
    protectedUntilTurn: 0,
    frozenUntilTurn: 0,
  });
}

export function drawRandomFromDeck(state: GameState, slotIndex: number): PlayingCard | null {
  if (state.deck.length === 0) return null;
  const idx = Math.floor(Math.random() * state.deck.length);
  const [card] = state.deck.splice(idx, 1);
  return { ...card, slotIndex, protectedUntilTurn: 0, frozenUntilTurn: 0 };
}

export function expireStatusesForRound(state: GameState): void {
  const round = state.currentRound;
  for (const player of Object.values(state.players)) {
    for (const card of player.pokerHand) {
      if (card.protectedUntilTurn > 0 && card.protectedUntilTurn < round) {
        card.protectedUntilTurn = 0;
      }
      if (card.frozenUntilTurn > 0 && card.frozenUntilTurn < round) {
        card.frozenUntilTurn = 0;
      }
    }
  }
}

export function getNegativeEffectCards(state: GameState): { card: PlayingCard; ownerId: PlayerId }[] {
  const results: { card: PlayingCard; ownerId: PlayerId }[] = [];
  for (const pid of ['player', 'bot'] as PlayerId[]) {
    for (const card of state.players[pid].pokerHand) {
      if (isCardFrozen(card, state.currentRound)) {
        results.push({ card, ownerId: pid });
      }
    }
  }
  return results;
}

export function sortHandBySlot(hand: PlayingCard[]): PlayingCard[] {
  return [...hand].sort((a, b) => a.slotIndex - b.slotIndex);
}

export function getCardAtSlot(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
): PlayingCard | undefined {
  return state.players[playerId].pokerHand.find(c => c.slotIndex === slotIndex);
}

export function swapPokerCardsWithSlots(
  handA: PlayingCard[],
  cardIdA: string,
  handB: PlayingCard[],
  cardIdB: string,
): { handA: PlayingCard[]; handB: PlayingCard[] } {
  const cardA = handA.find(c => c.id === cardIdA);
  const cardB = handB.find(c => c.id === cardIdB);
  if (!cardA || !cardB) return { handA, handB };

  const slotA = cardA.slotIndex;
  const slotB = cardB.slotIndex;

  const newA = handA.map(c => {
    if (c.id === cardIdA) {
      return { ...cardB, id: cardA.id, slotIndex: slotA };
    }
    return c;
  });

  const newB = handB.map(c => {
    if (c.id === cardIdB) {
      return { ...cardA, id: cardB.id, slotIndex: slotB };
    }
    return c;
  });

  return { handA: newA, handB: newB };
}

export function shuffleArray<T>(arr: T[]): T[] {
  return shuffle(arr);
}
