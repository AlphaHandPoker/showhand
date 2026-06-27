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
  steal_card: 'Kart Çal',
  send_back: 'Geri Yolla',
  protect: 'Koru',
  transform: 'Dönüştür',
  shift_chance: 'Şans Kaydır',
  freeze: 'Dondur',
  spy: 'Casus',
  force_delete: 'Zorla Sil',
  cleanse: 'Temizle',
  last_draw: 'Son Çekiliş',
};

export const EFFECT_DESCRIPTIONS: Record<EffectType, string> = {
  steal_card: 'Rakibin açık pozisyonundaki kartla kendi kartını takas et',
  send_back: 'Rakibin açık kartını desteye gönder, yerine rastgele yeni kart',
  protect: 'Kendi kartını bu round ve sonraki round boyunca koru',
  transform: 'Kendi kartının sembolünü rastgele değiştir',
  shift_chance: 'Kendi kartının sayısını sarmal ±2 komşulardan rastgele değiştir',
  freeze: 'Rakibin açık kartını 2 round boyunca dondur',
  spy: 'Rakibin bir efekt kartını gör',
  force_delete: 'Rakibin bir efekt kartını sil',
  cleanse: 'Olumsuz bir efekti (dondurma) kaldır',
  last_draw: 'Seçtiğin kartı desteye gönder, yeni kart çek',
};

export const TOTAL_ROUNDS = 5;
export const HAND_SIZE = 5;
export const DECK_SIZE = 5;
export const MAX_CARDS_PER_ROUND = 2;
export const MAX_PER_EFFECT_TYPE = 2;
