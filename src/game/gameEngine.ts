import type {
  GameState, PlayerId, EffectType, CommittedAction,
  ResolutionItem, SlotIndex, GameLogKind, GameMode,
} from './types';
import {
  TOTAL_ROUNDS, EFFECT_NAMES, HAND_SIZE,
} from './types';
import { maxCardsForState } from './gameModes';
import { createPlayingDeck, resetIdCounter, playingCardName, shuffle } from './deck';
import { createEffectCards, resetEffectIdCounter } from './deckBuilder';
import {
  getOpponent, canTargetCard, getTargetBlockReason, applyTransform, applyShiftChance,
  returnCardToDeck, drawRandomFromDeck, swapCards, expireStatusesForRound,
  swapPokerCardsWithSlots, sortHandBySlot, getShiftChanceTargets,
  getAvailableSuitsForTransform, getCardAtSlot,
} from './effects';
import { isSlotVisibleToViewer } from './visibility';
import { evaluateHand, compareHands, describeHand } from './poker';
import { resetBotIntel } from './botScoring';
import { buildBotCommit } from './bot';

function addLog(
  state: GameState,
  message: string,
  playerId?: PlayerId,
  kind?: GameLogKind,
  structured?: { effectName?: string; detail?: string },
): void {
  state.log.push({
    turn: state.currentRound,
    message,
    playerId,
    kind,
    effectName: structured?.effectName,
    detail: structured?.detail,
  });
}

function logEffect(
  state: GameState,
  actorId: PlayerId,
  effectName: string,
  detail: string,
): void {
  addLog(state, `${effectName}: ${detail}`, actorId, 'effect', { effectName, detail });
}

const FIZZLE_DETAIL: Record<string, string> = {
  'already played': 'Target card was already played',
  'target frozen': 'Target is frozen — cannot apply',
  'target protected': 'Target is protected — cannot apply',
  'target invalid': 'Target is no longer valid',
  'missing target': 'No target selected',
  'no freeze to remove': 'Nothing to cleanse',
  'empty slot': 'Target slot is empty',
};

function fizzleDetail(reason: string): string {
  return FIZZLE_DETAIL[reason] ?? reason;
}

function emptyCommits(): GameState['roundCommits'] {
  return {
    player: { actions: [], locked: false },
    bot: { actions: [], locked: false },
  };
}

function removeEffectFromHand(state: GameState, playerId: PlayerId, effectId: string): EffectType | null {
  const hand = state.players[playerId].effectHand;
  const idx = hand.findIndex(e => e.id === effectId);
  if (idx === -1) return null;
  const [removed] = hand.splice(idx, 1);
  state.spyRevealedEffectIds = state.spyRevealedEffectIds.filter(id => id !== effectId);
  return removed.type;
}

function drawRoundCards(state: GameState): void {
  for (const pid of ['player', 'bot'] as PlayerId[]) {
    const hand = state.players[pid].pokerHand;
    const slotIndex = hand.length;
    if (slotIndex >= HAND_SIZE) continue;

    const card = drawRandomFromDeck(state, slotIndex);
    if (card) {
      hand.push(card);
      addLog(state, 'Drew a card from the deck', pid);
    }
  }
}

function getResolutionOrder(state: GameState): PlayerId[] {
  const starter = state.startingPlayer;
  const other = getOpponent(starter);
  const first = state.currentRound % 2 === 1 ? starter : other;
  return [first, getOpponent(first)];
}

export { getResolutionOrder };

function finishGame(state: GameState): void {
  state.phase = 'finished';
  state.resolutionQueue = [];
  state.resolutionIndex = 0;
  state.resolvingPlayer = null;
  const pHand = evaluateHand(state.players.player.pokerHand);
  const bHand = evaluateHand(state.players.bot.pokerHand);
  const cmp = compareHands(pHand, bHand);
  if (cmp > 0) {
    state.winner = 'player';
  addLog(state, `Game over! You win: ${describeHand(state.players.player.pokerHand)} vs ${describeHand(state.players.bot.pokerHand)}`, undefined, 'result');
  } else if (cmp < 0) {
    state.winner = 'bot';
    addLog(state, `Game over! Bot wins: ${describeHand(state.players.bot.pokerHand)} vs ${describeHand(state.players.player.pokerHand)}`, undefined, 'result');
  } else {
    state.winner = 'tie';
    addLog(state, 'Game over! Tie!', undefined, 'result');
  }
}

function endRound(state: GameState): void {
  state.currentRound++;
  expireStatusesForRound(state);
  drawRoundCards(state);
  state.roundCommits = emptyCommits();
  state.phase = 'committing';
  addLog(state, `Round ${state.currentRound} started`, undefined, 'round');
}

function finishResolutionPhase(state: GameState): GameState {
  state.resolutionQueue = [];
  state.resolutionIndex = 0;
  state.resolvingPlayer = null;
  state.roundCommits = emptyCommits();
  state.spyReveal = null;

  if (state.currentRound >= TOTAL_ROUNDS) {
    finishGame(state);
    return { ...state };
  }

  endRound(state);
  return { ...state };
}

function fizzleAction(state: GameState, actorId: PlayerId, action: CommittedAction, reason: string): void {
  if (!state.players[actorId].effectHand.some(e => e.id === action.effectId)) return;
  removeEffectFromHand(state, actorId, action.effectId);
  const effectName = EFFECT_NAMES[action.effectType];
  const detail = `fizzled — ${fizzleDetail(reason)}`;
  logEffect(state, actorId, effectName, detail);
}

function wasEffectAlreadyResolvedInQueue(state: GameState, effectId: string): boolean {
  for (let i = 0; i < state.resolutionIndex; i++) {
    if (state.resolutionQueue[i]?.action.effectId === effectId) return true;
  }
  return false;
}

function resolveCommittedAction(state: GameState, actorId: PlayerId, action: CommittedAction): void {
  const opponentId = getOpponent(actorId);
  const round = state.currentRound;
  if (!state.players[actorId].effectHand.some(e => e.id === action.effectId)) return;

  switch (action.effectType) {
    case 'steal_card': {
      if (action.opponentSlot === undefined || action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const oppCard = getCardAtSlot(state, opponentId, action.opponentSlot);
      const ownCard = getCardAtSlot(state, actorId, action.ownSlot);
      if (!oppCard || !ownCard) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      const block = getTargetBlockReason(oppCard, round) ?? getTargetBlockReason(ownCard, round);
      if (block) {
        fizzleAction(state, actorId, action, block);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const swapped = swapPokerCardsWithSlots(
        state.players[actorId].pokerHand, ownCard.id,
        state.players[opponentId].pokerHand, oppCard.id,
      );
      state.players[actorId].pokerHand = sortHandBySlot(swapped.handA);
      state.players[opponentId].pokerHand = sortHandBySlot(swapped.handB);
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.steal_card,
        `${playingCardName(oppCard)} ↔ ${playingCardName(ownCard)}`,
      );
      break;
    }
    case 'send_back': {
      if (action.opponentSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, opponentId, action.opponentSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      const block = getTargetBlockReason(card, round);
      if (block) {
        fizzleAction(state, actorId, action, block);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const slotIndex = card.slotIndex;
      state.players[opponentId].pokerHand = state.players[opponentId].pokerHand.filter(c => c.id !== card.id);
      returnCardToDeck(state, card);
      const newCard = drawRandomFromDeck(state, slotIndex);
      if (newCard) state.players[opponentId].pokerHand.push(newCard);
      state.players[opponentId].pokerHand = sortHandBySlot(state.players[opponentId].pokerHand);
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.send_back,
        `${playingCardName(card)} sent to deck, new card drawn`,
      );
      break;
    }
    case 'protect': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'empty slot');
        break;
      }
      const block = getTargetBlockReason(card, round);
      if (block) {
        fizzleAction(state, actorId, action, block);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.protectedUntilTurn = round + 1;
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.protect,
        `${playingCardName(card)} korundu (bu round + sonraki)`,
      );
      break;
    }
    case 'transform': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      const transformBlock = getTargetBlockReason(card, round);
      if (transformBlock) {
        fizzleAction(state, actorId, action, transformBlock);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const result = applyTransform(state, card);
      if (result.success && result.newCard) {
        state.players[actorId].pokerHand = swapCards(state.players[actorId].pokerHand, card.id, result.newCard);
        logEffect(
          state,
          actorId,
          EFFECT_NAMES.transform,
          `${playingCardName(card)} → ${playingCardName(result.newCard)}`,
        );
      } else {
        addLog(state, result.message, actorId);
      }
      break;
    }
    case 'shift_chance': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      const shiftBlock = getTargetBlockReason(card, round);
      if (shiftBlock) {
        fizzleAction(state, actorId, action, shiftBlock);
        break;
      }
      if (getShiftChanceTargets(state.deck, card.suit, card.rank).length === 0) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const result = applyShiftChance(state, card);
      if (result.success && result.newCard) {
        state.players[actorId].pokerHand = swapCards(state.players[actorId].pokerHand, card.id, result.newCard);
        logEffect(
          state,
          actorId,
          EFFECT_NAMES.shift_chance,
          `${playingCardName(card)} → ${playingCardName(result.newCard)}`,
        );
      } else {
        addLog(state, result.message, actorId);
      }
      break;
    }
    case 'freeze': {
      if (action.opponentSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, opponentId, action.opponentSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'target invalid');
        break;
      }
      const freezeBlock = getTargetBlockReason(card, round);
      if (freezeBlock) {
        fizzleAction(state, actorId, action, freezeBlock);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.frozenUntilTurn = round + 2;
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.freeze,
        `${playingCardName(card)} donduruldu (2 round)`,
      );
      break;
    }
    case 'spy': {
      if (!action.opponentEffectId) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const effect = state.players[opponentId].effectHand.find(e => e.id === action.opponentEffectId);
      if (!effect) {
        const reason = wasEffectAlreadyResolvedInQueue(state, action.opponentEffectId)
          ? 'already played'
          : 'target invalid';
        fizzleAction(state, actorId, action, reason);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      if (!state.spyRevealedEffectIds.includes(effect.id)) {
        state.spyRevealedEffectIds.push(effect.id);
      }
      state.spyReveal = { type: effect.type, playerId: opponentId };
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.spy,
        `Opponent's ${EFFECT_NAMES[effect.type]} revealed`,
      );
      break;
    }
    case 'force_delete': {
      if (!action.opponentEffectId) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const idx = state.players[opponentId].effectHand.findIndex(e => e.id === action.opponentEffectId);
      if (idx === -1) {
        const reason = wasEffectAlreadyResolvedInQueue(state, action.opponentEffectId)
          ? 'already played'
          : 'target invalid';
        fizzleAction(state, actorId, action, reason);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      removeEffectFromHand(state, opponentId, action.opponentEffectId);
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.force_delete,
        'An effect card was deleted',
      );
      break;
    }
    case 'cleanse': {
      if (action.cleanseOwnerId === undefined || action.cleanseSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, action.cleanseOwnerId, action.cleanseSlot);
      if (!card || card.frozenUntilTurn < round) {
        fizzleAction(state, actorId, action, 'no freeze to remove');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.frozenUntilTurn = 0;
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.cleanse,
        `${playingCardName(card)} unfrozen`,
      );
      break;
    }
    case 'last_draw': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'missing target');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'empty slot');
        break;
      }
      const block = getTargetBlockReason(card, round);
      if (block) {
        fizzleAction(state, actorId, action, block);
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const slotIndex = card.slotIndex;
      state.players[actorId].pokerHand = state.players[actorId].pokerHand.filter(c => c.id !== card.id);
      returnCardToDeck(state, card);
      const newCard = drawRandomFromDeck(state, slotIndex);
      if (newCard) {
        state.players[actorId].pokerHand.push(newCard);
      }
      state.players[actorId].pokerHand = sortHandBySlot(state.players[actorId].pokerHand);
      logEffect(
        state,
        actorId,
        EFFECT_NAMES.last_draw,
        newCard
          ? `${playingCardName(card)} sent to deck → ${playingCardName(newCard)}`
          : `${playingCardName(card)} sent to deck`,
      );
      break;
    }
  }
}

export function createGame(
  playerEffectTypes: EffectType[],
  botEffectTypes: EffectType[],
  gameMode: GameMode = 'draft',
): GameState {
  resetIdCounter();
  resetEffectIdCounter();
  resetBotIntel();

  const startingPlayer: PlayerId = Math.random() < 0.5 ? 'player' : 'bot';

  const state: GameState = {
    gameMode,
    deck: createPlayingDeck(),
    players: {
      player: {
        id: 'player',
        pokerHand: [],
        effectHand: shuffle(createEffectCards(playerEffectTypes)),
      },
      bot: {
        id: 'bot',
        pokerHand: [],
        effectHand: shuffle(createEffectCards(botEffectTypes)),
      },
    },
    currentRound: 1,
    startingPlayer,
    phase: 'committing',
    roundCommits: emptyCommits(),
    resolutionQueue: [],
    resolutionIndex: 0,
    resolvingPlayer: null,
    spyRevealedEffectIds: [],
    spyReveal: null,
    log: [],
    winner: null,
  };

  drawRoundCards(state);
  addLog(state, 'Round 1 started', undefined, 'round');
  addLog(state, 'PokerDuel started! Round 1 — secretly choose your moves.');
  addLog(state, `Resolution order: ${startingPlayer === 'player' ? 'You' : 'Bot'} go first in Round 1.`, startingPlayer);
  return state;
}

export function validateCommittedActions(
  state: GameState,
  actorId: PlayerId,
  actions: CommittedAction[],
): string | null {
  if (actions.length > maxCardsForState(state)) {
    return `You can pick at most ${maxCardsForState(state)} cards`;
  }

  const usedEffects = new Set<string>();
  const round = state.currentRound;
  const opponentId = getOpponent(actorId);

  for (const action of actions) {
    if (usedEffects.has(action.effectId)) return 'Cannot pick the same card twice';
    usedEffects.add(action.effectId);

    const effect = state.players[actorId].effectHand.find(e => e.id === action.effectId);
    if (!effect || effect.type !== action.effectType) return 'Invalid effect card';

    switch (action.effectType) {
      case 'steal_card': {
        if (action.opponentSlot === undefined || action.ownSlot === undefined) return 'Steal Card requires two positions';
        const opp = getCardAtSlot(state, opponentId, action.opponentSlot);
        const own = getCardAtSlot(state, actorId, action.ownSlot);
        if (!opp || !own) return 'Invalid position';
        if (!isSlotVisibleToViewer(state, opponentId, action.opponentSlot, actorId)) return 'Cannot target a hidden slot';
        if (!canTargetCard(opp, round) || !canTargetCard(own, round)) return 'Target is locked or protected';
        break;
      }
      case 'send_back':
      case 'freeze': {
        if (action.opponentSlot === undefined) return 'Opponent position required';
        const card = getCardAtSlot(state, opponentId, action.opponentSlot);
        if (!card) return 'Invalid position';
        if (!isSlotVisibleToViewer(state, opponentId, action.opponentSlot, actorId)) return 'Cannot target a hidden slot';
        if (!canTargetCard(card, round)) return 'Target is locked or protected';
        break;
      }
      case 'protect':
      case 'last_draw': {
        if (action.ownSlot === undefined) return 'Your position required';
        const card = getCardAtSlot(state, actorId, action.ownSlot);
        if (!card) return 'Invalid position';
        const block = getTargetBlockReason(card, round);
        if (block) return block === 'target frozen' ? 'Target is frozen' : 'Target is locked or protected';
        break;
      }
      case 'transform': {
        if (action.ownSlot === undefined) return 'Your position required';
        const card = getCardAtSlot(state, actorId, action.ownSlot);
        if (!card) return 'Invalid position';
        const block = getTargetBlockReason(card, round);
        if (block) return block === 'target frozen' ? 'Target is frozen' : 'Target is locked or protected';
        if (getAvailableSuitsForTransform(state.deck, card.rank, card.suit).length === 0) {
          return 'No suit available to transform into';
        }
        break;
      }
      case 'shift_chance': {
        if (action.ownSlot === undefined) return 'Your position required';
        const card = getCardAtSlot(state, actorId, action.ownSlot);
        if (!card) return 'Invalid position';
        const block = getTargetBlockReason(card, round);
        if (block) return block === 'target frozen' ? 'Target is frozen' : 'Target is locked or protected';
        if (getShiftChanceTargets(state.deck, card.suit, card.rank).length === 0) {
          return 'No rank available to shift to';
        }
        break;
      }
      case 'spy':
      case 'force_delete': {
        if (!action.opponentEffectId) return 'Opponent effect card required';
        if (!state.players[opponentId].effectHand.some(e => e.id === action.opponentEffectId)) {
          return 'Invalid opponent effect card';
        }
        break;
      }
      case 'cleanse': {
        if (action.cleanseOwnerId === undefined || action.cleanseSlot === undefined) return 'Cleanse target required';
        const card = getCardAtSlot(state, action.cleanseOwnerId, action.cleanseSlot);
        if (!card || card.frozenUntilTurn < round) return 'No frozen card to cleanse';
        break;
      }
    }
  }

  return null;
}

/** Snapshot with player locked — used only to evaluate bot moves without mutating live state. */
export function cloneStateForBotEvaluation(
  state: GameState,
  playerActions: CommittedAction[],
): GameState {
  const err = validateCommittedActions(state, 'player', playerActions);
  if (err) throw new Error(err);

  return {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: {
      player: { actions: [...playerActions], locked: true },
      bot: { actions: [], locked: false },
    },
    log: [...state.log],
    spyReveal: null,
  };
}

export function forfeitGame(state: GameState, forfeitingPlayer: PlayerId): GameState {
  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: emptyCommits(),
    resolutionQueue: [],
    resolutionIndex: 0,
    resolvingPlayer: null,
    log: [...state.log],
    spyReveal: null,
    phase: 'finished',
    winner: forfeitingPlayer === 'player' ? 'bot' : 'player',
  };

  const message = forfeitingPlayer === 'player'
    ? 'You left the match — you lose.'
    : 'Opponent left the match — you win!';
  addLog(newState, message, undefined, 'result');
  return newState;
}

export function lockPlayerCommit(state: GameState, actions: CommittedAction[]): GameState {
  if (state.phase !== 'committing') return state;

  const err = validateCommittedActions(state, 'player', actions);
  if (err) return state;

  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: {
      player: { actions: [...actions], locked: true },
      bot: { actions: [], locked: false },
    },
    log: [...state.log],
    spyReveal: null,
  };

  try {
    const botActions = buildBotCommit(newState);
    newState.roundCommits.bot = { actions: botActions, locked: true };
  } catch (err) {
    console.error('[bot] buildBotCommit failed', err);
    newState.roundCommits.bot = { actions: [], locked: true };
  }

  const queue: ResolutionItem[] = [];
  for (const pid of getResolutionOrder(newState)) {
    for (const action of newState.roundCommits[pid].actions) {
      queue.push({ playerId: pid, action });
    }
  }

  newState.resolutionQueue = queue;
  newState.resolutionIndex = 0;
  newState.phase = 'resolving';
  addLog(newState, 'Moves locked — resolving...');

  if (queue.length === 0) {
    return finishResolutionPhase(newState);
  }

  return newState;
}

export function lockBothPlayerCommits(
  state: GameState,
  playerActions: CommittedAction[],
  botActions: CommittedAction[],
): GameState {
  if (state.phase !== 'committing') return state;

  const errPlayer = validateCommittedActions(state, 'player', playerActions);
  if (errPlayer) throw new Error(errPlayer);

  const errBot = validateCommittedActions(state, 'bot', botActions);
  if (errBot) throw new Error(errBot);

  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: {
      player: { actions: [...playerActions], locked: true },
      bot: { actions: [...botActions], locked: true },
    },
    log: [...state.log],
    spyReveal: null,
  };

  const queue: ResolutionItem[] = [];
  for (const pid of getResolutionOrder(newState)) {
    for (const action of newState.roundCommits[pid].actions) {
      queue.push({ playerId: pid, action });
    }
  }

  newState.resolutionQueue = queue;
  newState.resolutionIndex = 0;
  newState.phase = 'resolving';
  addLog(newState, 'Moves locked — resolving...');

  if (queue.length === 0) {
    return finishResolutionPhase(newState);
  }

  return newState;
}

function copyGameStateForResolution(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: {
      player: { ...state.roundCommits.player, actions: [...state.roundCommits.player.actions] },
      bot: { ...state.roundCommits.bot, actions: [...state.roundCommits.bot.actions] },
    },
    resolutionQueue: state.resolutionQueue.map(item => ({ ...item, action: { ...item.action } })),
    log: [...state.log],
    spyRevealedEffectIds: [...state.spyRevealedEffectIds],
  };
}

export function finishResolutionIfComplete(state: GameState): GameState {
  if (state.phase !== 'resolving') return state;
  if (state.resolutionIndex < state.resolutionQueue.length) return state;
  return finishResolutionPhase(copyGameStateForResolution(state));
}

export function resolveNextInQueue(state: GameState): GameState {
  if (state.phase !== 'resolving') return state;
  if (state.resolutionIndex >= state.resolutionQueue.length) {
    return finishResolutionIfComplete(state);
  }

  const newState: GameState = {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    log: [...state.log],
  };

  const item = newState.resolutionQueue[newState.resolutionIndex];
  newState.resolvingPlayer = item.playerId;
  resolveCommittedAction(newState, item.playerId, item.action);
  newState.resolutionIndex++;

  return newState;
}

export type TargetPickMode =
  | 'own_slot'
  | 'opponent_slot'
  | 'opponent_effect'
  | 'cleanse_slot';

export function getValidOwnSlots(
  state: GameState,
  actorId: PlayerId,
  effectType: EffectType,
): SlotIndex[] {
  const round = state.currentRound;
  const slots: SlotIndex[] = [];

  for (let s = 0; s < HAND_SIZE; s++) {
    const card = getCardAtSlot(state, actorId, s as SlotIndex);
    if (!card) continue;

    if (effectType === 'transform') {
      if (!canTargetCard(card, round)) continue;
      if (getAvailableSuitsForTransform(state.deck, card.rank, card.suit).length === 0) continue;
    } else if (effectType === 'shift_chance') {
      if (!canTargetCard(card, round)) continue;
      if (getShiftChanceTargets(state.deck, card.suit, card.rank).length === 0) continue;
    } else if (effectType === 'protect' || effectType === 'last_draw') {
      if (!canTargetCard(card, round)) continue;
    } else if (effectType === 'steal_card') {
      if (!canTargetCard(card, round)) continue;
    } else {
      continue;
    }

    slots.push(s as SlotIndex);
  }

  return slots;
}

export function getValidOpponentSlots(
  state: GameState,
  actorId: PlayerId,
  effectType: EffectType,
): SlotIndex[] {
  const opponentId = getOpponent(actorId);
  const round = state.currentRound;
  const slots: SlotIndex[] = [];

  for (let s = 0; s < HAND_SIZE; s++) {
    if (!isSlotVisibleToViewer(state, opponentId, s, actorId)) continue;
    const card = getCardAtSlot(state, opponentId, s as SlotIndex);
    if (!card) continue;
    if (!canTargetCard(card, round)) continue;
    if (['steal_card', 'send_back', 'freeze'].includes(effectType)) {
      slots.push(s as SlotIndex);
    }
  }

  return slots;
}

export function getValidCleanseTargets(state: GameState): { ownerId: PlayerId; slot: SlotIndex }[] {
  const round = state.currentRound;
  const results: { ownerId: PlayerId; slot: SlotIndex }[] = [];

  for (const pid of ['player', 'bot'] as PlayerId[]) {
    for (let s = 0; s < HAND_SIZE; s++) {
      const card = getCardAtSlot(state, pid, s as SlotIndex);
      if (card && card.frozenUntilTurn >= round) {
        results.push({ ownerId: pid, slot: s as SlotIndex });
      }
    }
  }

  return results;
}

export function canCommitEffectType(
  state: GameState,
  actorId: PlayerId,
  effectType: EffectType,
): boolean {
  switch (effectType) {
    case 'steal_card':
      return getValidOpponentSlots(state, actorId, effectType).length > 0
        && getValidOwnSlots(state, actorId, effectType).length > 0;
    case 'send_back':
    case 'freeze':
      return getValidOpponentSlots(state, actorId, effectType).length > 0;
    case 'protect':
    case 'last_draw':
      return getValidOwnSlots(state, actorId, effectType).length > 0;
    case 'transform':
    case 'shift_chance':
      return getValidOwnSlots(state, actorId, effectType).length > 0;
    case 'spy':
    case 'force_delete':
      return state.players[getOpponent(actorId)].effectHand.length > 0;
    case 'cleanse':
      return getValidCleanseTargets(state).length > 0;
    default:
      return false;
  }
}

export { addLog, getOpponent };
