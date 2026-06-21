import type {
  GameState, PlayerId, EffectType, CommittedAction,
  ResolutionItem, SlotIndex,
} from './types';
import {
  TOTAL_ROUNDS, EFFECT_NAMES, HAND_SIZE, MAX_CARDS_PER_ROUND,
} from './types';
import { createPlayingDeck, resetIdCounter } from './deck';
import { createEffectCards, resetEffectIdCounter } from './deckBuilder';
import {
  getOpponent, canTargetCard, applyTransform, applyShiftChance,
  returnCardToDeck, drawRandomFromDeck, swapCards, expireStatusesForRound,
  swapPokerCardsWithSlots, sortHandBySlot, getShiftChanceTargets,
  getAvailableSuitsForTransform, getCardAtSlot,
} from './effects';
import { isSlotVisibleToViewer } from './visibility';
import { evaluateHand, compareHands, describeHand } from './poker';
import { resetBotIntel } from './botScoring';
import { buildBotCommit } from './bot';

function addLog(state: GameState, message: string, playerId?: PlayerId): void {
  state.log.push({ turn: state.currentRound, message, playerId });
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
      addLog(state, 'Desteden kart çekildi', pid);
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
    addLog(state, `Oyun bitti! Kazandın: ${describeHand(state.players.player.pokerHand)} vs ${describeHand(state.players.bot.pokerHand)}`);
  } else if (cmp < 0) {
    state.winner = 'bot';
    addLog(state, `Oyun bitti! Bot kazandı: ${describeHand(state.players.bot.pokerHand)} vs ${describeHand(state.players.player.pokerHand)}`);
  } else {
    state.winner = 'tie';
    addLog(state, 'Oyun bitti! Berabere!');
  }
}

function endRound(state: GameState): void {
  state.currentRound++;
  expireStatusesForRound(state);
  drawRoundCards(state);
  state.roundCommits = emptyCommits();
  state.phase = 'committing';
  addLog(state, `— Round ${state.currentRound} başladı —`);
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
  addLog(state, `${EFFECT_NAMES[action.effectType]}: etkisiz kaldı (${reason})`, actorId);
}

function resolveCommittedAction(state: GameState, actorId: PlayerId, action: CommittedAction): void {
  const opponentId = getOpponent(actorId);
  const round = state.currentRound;
  if (!state.players[actorId].effectHand.some(e => e.id === action.effectId)) return;

  switch (action.effectType) {
    case 'steal_card': {
      if (action.opponentSlot === undefined || action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const oppCard = getCardAtSlot(state, opponentId, action.opponentSlot);
      const ownCard = getCardAtSlot(state, actorId, action.ownSlot);
      if (!oppCard || !ownCard || !canTargetCard(oppCard, round) || !canTargetCard(ownCard, round)) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const swapped = swapPokerCardsWithSlots(
        state.players[actorId].pokerHand, ownCard.id,
        state.players[opponentId].pokerHand, oppCard.id,
      );
      state.players[actorId].pokerHand = sortHandBySlot(swapped.handA);
      state.players[opponentId].pokerHand = sortHandBySlot(swapped.handB);
      addLog(state, `Kart Çal: poz. ${action.opponentSlot + 1} ↔ ${action.ownSlot + 1}`, actorId);
      break;
    }
    case 'send_back': {
      if (action.opponentSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, opponentId, action.opponentSlot);
      if (!card || !canTargetCard(card, round)) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const slotIndex = card.slotIndex;
      state.players[opponentId].pokerHand = state.players[opponentId].pokerHand.filter(c => c.id !== card.id);
      returnCardToDeck(state, card);
      const newCard = drawRandomFromDeck(state, slotIndex);
      if (newCard) state.players[opponentId].pokerHand.push(newCard);
      state.players[opponentId].pokerHand = sortHandBySlot(state.players[opponentId].pokerHand);
      addLog(state, `Geri Yolla: rakibin poz. ${action.opponentSlot + 1}`, actorId);
      break;
    }
    case 'protect': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'pozisyon boş');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.protectedUntilTurn = round + 3;
      addLog(state, `Koru: poz. ${action.ownSlot + 1} (3 round)`, actorId);
      break;
    }
    case 'transform': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card || !canTargetCard(card, round)) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const result = applyTransform(state, card);
      if (result.success && result.newCard) {
        state.players[actorId].pokerHand = swapCards(state.players[actorId].pokerHand, card.id, result.newCard);
        addLog(state, `Dönüştür: ${result.message}`, actorId);
      } else {
        addLog(state, result.message, actorId);
      }
      break;
    }
    case 'shift_chance': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card || !canTargetCard(card, round)
        || getShiftChanceTargets(state.deck, card.suit, card.rank).length === 0) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const result = applyShiftChance(state, card);
      if (result.success && result.newCard) {
        state.players[actorId].pokerHand = swapCards(state.players[actorId].pokerHand, card.id, result.newCard);
        addLog(state, `Şans Kaydır: ${result.message}`, actorId);
      } else {
        addLog(state, result.message, actorId);
      }
      break;
    }
    case 'freeze': {
      if (action.opponentSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, opponentId, action.opponentSlot);
      if (!card || !canTargetCard(card, round)) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.frozenUntilTurn = round + 2;
      addLog(state, `Dondur: rakibin poz. ${action.opponentSlot + 1}`, actorId);
      break;
    }
    case 'spy': {
      if (!action.opponentEffectId) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const effect = state.players[opponentId].effectHand.find(e => e.id === action.opponentEffectId);
      if (!effect) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      if (!state.spyRevealedEffectIds.includes(effect.id)) {
        state.spyRevealedEffectIds.push(effect.id);
      }
      state.spyReveal = { type: effect.type, playerId: opponentId };
      addLog(state, `Casus: rakibin "${EFFECT_NAMES[effect.type]}" kartını gördün`, actorId);
      break;
    }
    case 'force_delete': {
      if (!action.opponentEffectId) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const idx = state.players[opponentId].effectHand.findIndex(e => e.id === action.opponentEffectId);
      if (idx === -1) {
        fizzleAction(state, actorId, action, 'hedef artık geçerli değil');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      removeEffectFromHand(state, opponentId, action.opponentEffectId);
      addLog(state, 'Zorla Sil: rakibin efekt kartı silindi', actorId);
      break;
    }
    case 'cleanse': {
      if (action.cleanseOwnerId === undefined || action.cleanseSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, action.cleanseOwnerId, action.cleanseSlot);
      if (!card || card.frozenUntilTurn < round) {
        fizzleAction(state, actorId, action, 'dondurma kalmadı');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      card.frozenUntilTurn = 0;
      addLog(state, 'Temizle: dondurma kaldırıldı', actorId);
      break;
    }
    case 'last_draw': {
      if (action.ownSlot === undefined) {
        fizzleAction(state, actorId, action, 'hedef eksik');
        break;
      }
      const card = getCardAtSlot(state, actorId, action.ownSlot);
      if (!card) {
        fizzleAction(state, actorId, action, 'pozisyon boş');
        break;
      }
      removeEffectFromHand(state, actorId, action.effectId);
      const slotIndex = card.slotIndex;
      state.players[actorId].pokerHand = state.players[actorId].pokerHand.filter(c => c.id !== card.id);
      returnCardToDeck(state, card);
      const newCard = drawRandomFromDeck(state, slotIndex);
      if (newCard) {
        newCard.protectedUntilTurn = round + 2;
        state.players[actorId].pokerHand.push(newCard);
      }
      state.players[actorId].pokerHand = sortHandBySlot(state.players[actorId].pokerHand);
      addLog(state, `Son Çekiliş: poz. ${action.ownSlot + 1}`, actorId);
      break;
    }
  }
}

export function createGame(playerEffectTypes: EffectType[], botEffectTypes: EffectType[]): GameState {
  resetIdCounter();
  resetEffectIdCounter();
  resetBotIntel();

  const startingPlayer: PlayerId = Math.random() < 0.5 ? 'player' : 'bot';

  const state: GameState = {
    deck: createPlayingDeck(),
    players: {
      player: {
        id: 'player',
        pokerHand: [],
        effectHand: createEffectCards(playerEffectTypes),
      },
      bot: {
        id: 'bot',
        pokerHand: [],
        effectHand: createEffectCards(botEffectTypes),
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
  addLog(state, 'SHOWHAND başladı! Round 1 — hamlelerini gizlice seç.');
  addLog(state, `Çözülme sırası: Round 1'de ${startingPlayer === 'player' ? 'Sen' : 'Bot'} önce.`, startingPlayer);
  return state;
}

export function validateCommittedActions(
  state: GameState,
  actorId: PlayerId,
  actions: CommittedAction[],
): string | null {
  if (actions.length > MAX_CARDS_PER_ROUND) {
    return `En fazla ${MAX_CARDS_PER_ROUND} kart seçebilirsin`;
  }

  const usedEffects = new Set<string>();
  const round = state.currentRound;
  const opponentId = getOpponent(actorId);

  for (const action of actions) {
    if (usedEffects.has(action.effectId)) return 'Aynı kartı iki kez seçemezsin';
    usedEffects.add(action.effectId);

    const effect = state.players[actorId].effectHand.find(e => e.id === action.effectId);
    if (!effect || effect.type !== action.effectType) return 'Geçersiz efekt kartı';

    switch (action.effectType) {
      case 'steal_card': {
        if (action.opponentSlot === undefined || action.ownSlot === undefined) return 'Kart Çal için iki pozisyon gerekli';
        const opp = getCardAtSlot(state, opponentId, action.opponentSlot);
        const own = getCardAtSlot(state, actorId, action.ownSlot);
        if (!opp || !own) return 'Geçersiz pozisyon';
        if (!isSlotVisibleToViewer(state, opponentId, action.opponentSlot, actorId)) return 'Kapalı pozisyon hedeflenemez';
        if (!canTargetCard(opp, round) || !canTargetCard(own, round)) return 'Hedef kilitli veya korumalı';
        break;
      }
      case 'send_back':
      case 'freeze': {
        if (action.opponentSlot === undefined) return 'Rakip pozisyonu gerekli';
        const card = getCardAtSlot(state, opponentId, action.opponentSlot);
        if (!card) return 'Geçersiz pozisyon';
        if (!isSlotVisibleToViewer(state, opponentId, action.opponentSlot, actorId)) return 'Kapalı pozisyon hedeflenemez';
        if (!canTargetCard(card, round)) return 'Hedef kilitli veya korumalı';
        break;
      }
      case 'protect':
      case 'last_draw': {
        if (action.ownSlot === undefined) return 'Kendi pozisyonun gerekli';
        if (!getCardAtSlot(state, actorId, action.ownSlot)) return 'Geçersiz pozisyon';
        break;
      }
      case 'transform': {
        if (action.ownSlot === undefined) return 'Kendi pozisyonun gerekli';
        const card = getCardAtSlot(state, actorId, action.ownSlot);
        if (!card || !canTargetCard(card, round)) return 'Geçersiz veya kilitli hedef';
        if (getAvailableSuitsForTransform(state.deck, card.rank, card.suit).length === 0) {
          return 'Dönüştürülebilecek sembol yok';
        }
        break;
      }
      case 'shift_chance': {
        if (action.ownSlot === undefined) return 'Kendi pozisyonun gerekli';
        const card = getCardAtSlot(state, actorId, action.ownSlot);
        if (!card || !canTargetCard(card, round)) return 'Geçersiz veya kilitli hedef';
        if (getShiftChanceTargets(state.deck, card.suit, card.rank).length === 0) {
          return 'Kaydırılabilecek değer yok';
        }
        break;
      }
      case 'spy':
      case 'force_delete': {
        if (!action.opponentEffectId) return 'Rakip efekt kartı gerekli';
        if (!state.players[opponentId].effectHand.some(e => e.id === action.opponentEffectId)) {
          return 'Geçersiz rakip efekt kartı';
        }
        break;
      }
      case 'cleanse': {
        if (action.cleanseOwnerId === undefined || action.cleanseSlot === undefined) return 'Temizle hedefi gerekli';
        const card = getCardAtSlot(state, action.cleanseOwnerId, action.cleanseSlot);
        if (!card || card.frozenUntilTurn < round) return 'Dondurulmuş kart yok';
        break;
      }
    }
  }

  return null;
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
  addLog(newState, 'Hamleler kilitlendi — çözülüyor...');

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
  addLog(newState, 'Hamleler kilitlendi — çözülüyor...');

  if (queue.length === 0) {
    return finishResolutionPhase(newState);
  }

  return newState;
}

export function resolveNextInQueue(state: GameState): GameState {
  if (state.phase !== 'resolving') return state;
  if (state.resolutionIndex >= state.resolutionQueue.length) {
    return finishResolutionPhase(state);
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

  if (newState.resolutionIndex >= newState.resolutionQueue.length) {
    return finishResolutionPhase(newState);
  }

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
    } else if (['protect', 'last_draw'].includes(effectType)) {
      // always targetable own slots
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
