export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type EffectType =
  | 'steal_card'
  | 'send_back'
  | 'protect'
  | 'transform'
  | 'shift_chance'
  | 'freeze'
  | 'spy'
  | 'force_delete'
  | 'cleanse'
  | 'last_draw';

export const ALL_EFFECT_TYPES: EffectType[] = [
  'steal_card', 'send_back', 'protect', 'transform', 'shift_chance',
  'freeze', 'spy', 'force_delete', 'cleanse', 'last_draw',
];

export type SlotIndex = 0 | 1 | 2 | 3 | 4;

export interface PlayingCard {
  id: string;
  suit: Suit;
  rank: Rank;
  slotIndex: number;
  protectedUntilTurn: number;
  frozenUntilTurn: number;
}

export interface EffectCard {
  id: string;
  type: EffectType;
}

export type PlayerId = 'player' | 'bot';

/** draft = 5-card pick; full_deck = all 10 effects, 1 play per round */
export type GameMode = 'draft' | 'full_deck';

export interface Player {
  id: PlayerId;
  pokerHand: PlayingCard[];
  effectHand: EffectCard[];
}

export type GamePhase = 'committing' | 'resolving' | 'finished';

/** One effect + slot targets chosen during blind commit */
export interface CommittedAction {
  effectId: string;
  effectType: EffectType;
  ownSlot?: SlotIndex;
  opponentSlot?: SlotIndex;
  opponentEffectId?: string;
  cleanseOwnerId?: PlayerId;
  cleanseSlot?: SlotIndex;
}

export interface PlayerCommit {
  actions: CommittedAction[];
  locked: boolean;
}

export interface ResolutionItem {
  playerId: PlayerId;
  action: CommittedAction;
}

export type GameLogKind = 'round' | 'effect' | 'result';

export interface GameLogEntry {
  turn: number;
  message: string;
  playerId?: PlayerId;
  kind?: GameLogKind;
  effectName?: string;
  detail?: string;
}

export interface GameState {
  gameMode: GameMode;
  deck: PlayingCard[];
  players: Record<PlayerId, Player>;
  currentRound: number;
  startingPlayer: PlayerId;
  phase: GamePhase;
  roundCommits: Record<PlayerId, PlayerCommit>;
  resolutionQueue: ResolutionItem[];
  resolutionIndex: number;
  resolvingPlayer: PlayerId | null;
  /** Effect card IDs revealed by spy — visible until the card leaves hand or game ends */
  spyRevealedEffectIds: string[];
  spyReveal: { type: EffectType; playerId: PlayerId } | null;
  log: GameLogEntry[];
  winner: PlayerId | 'tie' | null;
}

export const EFFECT_NAMES: Record<EffectType, string> = {
  steal_card: 'Steal Card',
  send_back: 'Send Back',
  protect: 'Protect',
  transform: 'Transform',
  shift_chance: 'Shift Chance',
  freeze: 'Freeze',
  spy: 'Spy',
  force_delete: 'Force Delete',
  cleanse: 'Cleanse',
  last_draw: 'Last Draw',
};

export const EFFECT_DESCRIPTIONS: Record<EffectType, string> = {
  steal_card: 'Swap with an opponent card in an open slot',
  send_back: 'Send opponent card to deck, draw a random replacement',
  protect: 'Protect your card this round and the next',
  transform: 'Randomly change your card\'s suit',
  shift_chance: 'Shift your card\'s rank by ±2 (wraps A↔2)',
  freeze: 'Freeze opponent card for 2 rounds',
  spy: 'Reveal one opponent effect card',
  force_delete: 'Delete one opponent effect card',
  cleanse: 'Remove a negative effect (freeze)',
  last_draw: 'Send your card to deck and draw a new one',
};

export const TOTAL_ROUNDS = 5;
export const HAND_SIZE = 5;
export const DECK_SIZE = 5;
export const MAX_CARDS_PER_ROUND = 2;
export const MAX_PER_EFFECT_TYPE = 2;
