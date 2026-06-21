import type { GameState, CommittedAction, EffectType, EffectCard, SlotIndex } from './types';
import { MAX_CARDS_PER_ROUND } from './types';
import {
  canCommitEffectType, getValidOwnSlots, getValidOpponentSlots, getValidCleanseTargets,
} from './gameEngine';
import {
  computeBotHandScore, computeThreatScore,
  cardMarginalValue, estimateTransformGain, estimateShiftGain,
  pickBestOwnTarget, pickBestOpponentTarget,
  recordSpyIntel, playerHasKnownEffect,
} from './botScoring';
import { getCardAtSlot, sortHandBySlot } from './effects';

const PLAY_THRESHOLD = 22;
const SECOND_PLAY_THRESHOLD = 14;

export interface BotMovePlan {
  actions: CommittedAction[];
  handScore: number;
  threatScore: number;
}

function getBotHand(state: GameState) {
  return sortHandBySlot(state.players.bot.pokerHand);
}

/** Rakibin sahadaki çekilmiş kartları (hepsi görünür) */
function getPlayerHandDrawn(state: GameState) {
  return sortHandBySlot(state.players.player.pokerHand);
}

function roundModifier(type: EffectType, round: number): number {
  const early = round <= 2;
  const late = round >= 4;

  switch (type) {
    case 'transform': return early ? 1.35 : late ? 0.85 : 1;
    case 'shift_chance': return late ? 1.4 : early ? 0.9 : 1;
    case 'protect': return early ? 1.15 : 1;
    case 'last_draw': return late ? 1.3 : 1;
    case 'spy':
      if (round <= 2) return 1.5;
      if (round >= 4) return 0.35;
      return 1;
    default: return 1;
  }
}

function estimateEffectValue(
  state: GameState,
  effect: EffectCard,
  handScore: number,
  threatScore: number,
): number {
  const round = state.currentRound;
  const deck = state.deck;
  const botHand = getBotHand(state);
  const playerHand = getPlayerHandDrawn(state);
  const behind = threatScore > handScore + 15;

  let value = 0;

  switch (effect.type) {
    case 'transform': {
      for (const s of getValidOwnSlots(state, 'bot', 'transform')) {
        const c = getCardAtSlot(state, 'bot', s)!;
        value = Math.max(value, estimateTransformGain(botHand, c, deck));
      }
      break;
    }
    case 'shift_chance': {
      for (const s of getValidOwnSlots(state, 'bot', 'shift_chance')) {
        const c = getCardAtSlot(state, 'bot', s)!;
        value = Math.max(value, estimateShiftGain(botHand, c, deck));
      }
      break;
    }
    case 'protect': {
      const target = pickBestOwnTarget(botHand, deck, 'buff');
      value = target ? cardMarginalValue(target, botHand, deck) * 0.45 + 14 : 0;
      if (playerHasKnownEffect('freeze') || playerHasKnownEffect('force_delete')) value += 18;
      break;
    }
    case 'last_draw': {
      const worst = pickBestOwnTarget(botHand, deck, 'discard');
      if (worst) value = Math.max(12, 28 - cardMarginalValue(worst, botHand, deck));
      break;
    }
    case 'steal_card': {
      const oppBest = pickBestOpponentTarget(playerHand, deck);
      const ownWorst = pickBestOwnTarget(botHand, deck, 'discard');
      if (oppBest && ownWorst) {
        const newBot = botHand.map(c => (c.id === ownWorst.id ? { ...oppBest, id: c.id, slotIndex: c.slotIndex } : c));
        const newOpp = playerHand.filter(c => c.id !== oppBest.id);
        value = (computeBotHandScore(newBot, deck) - handScore)
          + (threatScore - computeThreatScore(newOpp, deck));
      }
      if (behind) value *= 1.25;
      break;
    }
    case 'send_back': {
      const target = pickBestOpponentTarget(playerHand, deck);
      value = target ? cardMarginalValue(target, playerHand, deck) * 0.85 : 0;
      if (behind) value *= 1.2;
      break;
    }
    case 'freeze': {
      const target = pickBestOpponentTarget(playerHand, deck);
      value = target ? cardMarginalValue(target, playerHand, deck) * 0.75 + 6 : 0;
      if (behind) value *= 1.15;
      break;
    }
    case 'force_delete': {
      value = 16 + state.players.player.effectHand.length * 4;
      if (playerHasKnownEffect('freeze') || playerHasKnownEffect('steal_card')) value += 12;
      break;
    }
    case 'spy': {
      value = round <= 2 ? 38 : round === 3 ? 22 : 8;
      if (state.players.player.effectHand.length >= 3) value += 8;
      break;
    }
    case 'cleanse': {
      const frozen = botHand.filter(c => c.frozenUntilTurn >= round);
      value = frozen.length > 0 ? 42 : 10;
      break;
    }
  }

  return value * roundModifier(effect.type, round);
}

function buildActionForEffect(state: GameState, effect: EffectCard): CommittedAction | null {
  const deck = state.deck;
  const botHand = getBotHand(state);
  const playerHand = getPlayerHandDrawn(state);

  switch (effect.type) {
    case 'steal_card': {
      const oppSlots = getValidOpponentSlots(state, 'bot', 'steal_card');
      const ownSlots = getValidOwnSlots(state, 'bot', 'steal_card');
      if (oppSlots.length === 0 || ownSlots.length === 0) return null;

      let bestOpp = oppSlots[0];
      let bestOwn = ownSlots[0];
      let bestVal = -Infinity;
      for (const os of oppSlots) {
        const oppCard = getCardAtSlot(state, 'player', os)!;
        for (const ws of ownSlots) {
          const ownCard = getCardAtSlot(state, 'bot', ws)!;
          const newBot = botHand.map(c => (c.id === ownCard.id ? { ...oppCard, id: c.id, slotIndex: c.slotIndex } : c));
          const newOpp = playerHand.filter(c => c.id !== oppCard.id);
          const val = computeBotHandScore(newBot, deck) - computeThreatScore(newOpp, deck);
          if (val > bestVal) { bestVal = val; bestOpp = os; bestOwn = ws; }
        }
      }
      return { effectId: effect.id, effectType: effect.type, opponentSlot: bestOpp, ownSlot: bestOwn };
    }
    case 'send_back':
    case 'freeze': {
      const slots = getValidOpponentSlots(state, 'bot', effect.type);
      if (slots.length === 0) return null;
      let best = slots[0];
      let bestVal = -Infinity;
      for (const s of slots) {
        const c = getCardAtSlot(state, 'player', s)!;
        const v = cardMarginalValue(c, playerHand, deck);
        if (v > bestVal) { bestVal = v; best = s; }
      }
      return { effectId: effect.id, effectType: effect.type, opponentSlot: best };
    }
    case 'protect':
    case 'transform':
    case 'shift_chance':
    case 'last_draw': {
      const slots = getValidOwnSlots(state, 'bot', effect.type);
      if (slots.length === 0) return null;
      let best = slots[0];
      let bestVal = -Infinity;
      for (const s of slots) {
        const c = getCardAtSlot(state, 'bot', s)!;
        let v = cardMarginalValue(c, botHand, deck);
        if (effect.type === 'transform') v = estimateTransformGain(botHand, c, deck);
        if (effect.type === 'shift_chance') v = estimateShiftGain(botHand, c, deck);
        if (effect.type === 'protect') {
          v = Math.max(
            cardMarginalValue(c, botHand, deck),
            estimateTransformGain(botHand, c, deck) * 0.5,
          ) + 8;
        }
        if (effect.type === 'last_draw') {
          v = Math.max(0, 20 - cardMarginalValue(c, botHand, deck));
        }
        if (v > bestVal) { bestVal = v; best = s; }
      }
      return { effectId: effect.id, effectType: effect.type, ownSlot: best as SlotIndex };
    }
    case 'spy':
    case 'force_delete': {
      const hand = state.players.player.effectHand;
      if (hand.length === 0) return null;
      if (effect.type === 'force_delete') {
        const priority: EffectType[] = [
          'freeze', 'force_delete', 'steal_card', 'send_back',
          'transform', 'shift_chance', 'last_draw', 'protect',
        ];
        for (const t of priority) {
          const found = hand.find(e => e.type === t);
          if (found) return { effectId: effect.id, effectType: effect.type, opponentEffectId: found.id };
        }
      }
      const pick = hand[Math.floor(Math.random() * hand.length)];
      return { effectId: effect.id, effectType: effect.type, opponentEffectId: pick.id };
    }
    case 'cleanse': {
      const targets = getValidCleanseTargets(state);
      const botFrozen = targets.find(t => t.ownerId === 'bot');
      const pick = botFrozen ?? targets[0];
      if (!pick) return null;
      return {
        effectId: effect.id,
        effectType: effect.type,
        cleanseOwnerId: pick.ownerId,
        cleanseSlot: pick.slot,
      };
    }
    default:
      return null;
  }
}

/**
 * Round başlangıcındaki bilinen duruma göre bot hamlesi (körleme commit).
 * İnsan oyuncunun o roundki hamlesi hakkında bilgi kullanılmaz.
 */
export function evaluateBotMove(state: GameState): BotMovePlan {
  const botHand = getBotHand(state);
  const playerRevealed = getPlayerHandDrawn(state);
  const deck = state.deck;

  const handScore = computeBotHandScore(botHand, deck);
  const threatScore = computeThreatScore(playerRevealed, deck);

  const actions: CommittedAction[] = [];
  const usedIds = new Set<string>();

  for (let pick = 0; pick < MAX_CARDS_PER_ROUND; pick++) {
    const threshold = pick === 0 ? PLAY_THRESHOLD : SECOND_PLAY_THRESHOLD;
    const scored: { effect: EffectCard; value: number }[] = [];

    for (const effect of state.players.bot.effectHand) {
      if (usedIds.has(effect.id)) continue;
      if (!canCommitEffectType(state, 'bot', effect.type)) continue;
      scored.push({
        effect,
        value: estimateEffectValue(state, effect, handScore, threatScore),
      });
    }

    scored.sort((a, b) => b.value - a.value);
    if (scored.length === 0 || scored[0].value < threshold) break;

    const built = buildActionForEffect(state, scored[0].effect);
    if (!built) break;

    actions.push(built);
    usedIds.add(built.effectId);

    if (built.effectType === 'spy' && built.opponentEffectId) {
      const revealed = state.players.player.effectHand.find(e => e.id === built.opponentEffectId);
      if (revealed) recordSpyIntel(revealed.type);
    }
  }

  return { actions, handScore, threatScore };
}

/** Kilitlenen bot commit — evaluateBotMove sarmalayıcısı */
export function buildBotCommit(state: GameState): CommittedAction[] {
  try {
    return evaluateBotMove(state).actions;
  } catch (err) {
    console.error('[bot] evaluateBotMove failed', err);
    return [];
  }
}
