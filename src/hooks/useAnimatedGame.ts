import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameState, PlayerId, PlayingCard } from '../game/types';
import { getOpponent, getResolutionOrder, finishResolutionIfComplete } from '../game/gameEngine';
import type { EffectToken } from '../ui/effectTokens';
import {
  shouldAddToken,
  shouldPersistToken,
  TOKEN_ROUNDS,
  nextTokenId,
  addTokenToSlot,
  decrementAllTokens,
  removeTokenFromSlot,
  getTokenTargetSlots,
  slotKey as tokenSlotKey,
} from '../ui/effectTokens';
import type { EffectToSlotRequest } from '../components/EffectToSlotFlight';
import type { EffectHandToCenterRequest } from '../components/EffectHandToCenterFlight';
import type { CommitToLaneRequest } from '../components/CommitToLaneFlight';
import type { EffectCard } from '../game/types';
import type { InPlaceCardSpinRequest } from '../components/InPlaceCardSpin';
import type { SlotMachineRequest } from '../components/SlotMachineReveal';
import type { EffectShredRequest } from '../components/EffectShredOverlay';
import { playHitCardSound } from '../audio/sounds';
import type { SpyRevealRequest } from '../components/SpyRevealOverlay';
import type { ForceDeleteRequest } from '../components/ForceDeleteOverlay';
import {
  detectAnimations,
  type AnimationPlan,
  type CastAnimation,
  type MechanicalAnimType,
} from '../ui/detectAnimations';
import type { DeckTravelRequest } from '../components/CardFromDeckFlight';
import type { CardToDeckRequest } from '../components/CardToDeckFlight';
import type { CardSwapRequest } from '../components/CardSwapFlight';
import { buildSwapRequest } from '../components/CardSwapFlight';
import {
  CAST_TARGET_MS,
  CAST_CENTER_HOLD_MS,
  COMMIT_TO_LANE_STAGGER_MS,
  LANE_REVEAL_MS,
  FIZZLE_TOAST_MS,
  DRAW_BEAT_MS,
} from '../ui/resolutionTimings';
import {
  getActionTargetSlots,
  getActionTargetEffectId,
} from '../ui/resolutionTargets';
import type { SequencerUIState } from '../components/ResolutionSequencerUI';
import { IDLE_SEQUENCER } from '../components/ResolutionSequencerUI';
import type { TargetSlot } from '../ui/resolutionTargets';
import { buildCommitLanes, activeLaneHiddenIds, type CommitLaneCard } from '../ui/commitLanes';
import { formatFizzleToast, parseFizzleReason, type FizzleToastContent } from '../ui/fizzleMessages';

// ── Timing constants ──
const IMPACT_HOLD_MS = 550;
const SETTLE_MS = 250;
const BETWEEN_PLANS_MS = 200;
const DRAW_BETWEEN_MS = 350;
const INTRO_REVEAL_GAP_MS = 120;
const CHOREO_PAUSE_MS = 120;

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function afterPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// ── Types ──

export type CastPhase = 'present' | 'target' | 'fly' | 'impact' | 'result';

export interface AnimationVisualState {
  isAnimating: boolean;
  castOverlay: CastAnimation | null;
  castPhase: CastPhase | null;
  mechanical: MechanicalAnimType | null;
  targetCardIds: string[];
  targetSlots: TargetSlot[];
  targetEffectId: string | null;
  drawingEffectIds: string[];
  cardBefore: CastAnimation['cardBefore'];
  cardAfter: CastAnimation['cardAfter'];
  deckTravel: DeckTravelRequest | null;
  cardToDeck: CardToDeckRequest | null;
  cardSwap: CardSwapRequest | null;
  handToCenter: EffectHandToCenterRequest | null;
  inPlaceSpin: InPlaceCardSpinRequest | null;
  slotMachine: SlotMachineRequest | null;
  effectShred: EffectShredRequest | null;
  spyReveal: SpyRevealRequest | null;
  forceDelete: ForceDeleteRequest | null;
  effectToSlot: EffectToSlotRequest | null;
  laneFlight: CommitToLaneRequest | null;
  centerHeldEffect: { effectId: string; effect: EffectCard } | null;
  commitLanes: CommitLaneCard[];
  fizzleToast: FizzleToastContent | null;
  inFlightCardIds: string[];
  hiddenCardIds: string[];
  hiddenEffectIds: string[];
  spyFlipEffectId: string | null;
  sequencer: SequencerUIState;
  slotTokens: Map<string, EffectToken[]>;
}

const IDLE_VISUAL: AnimationVisualState = {
  isAnimating: false,
  castOverlay: null,
  castPhase: null,
  mechanical: null,
  targetCardIds: [],
  targetSlots: [],
  targetEffectId: null,
  drawingEffectIds: [],
  cardBefore: undefined,
  cardAfter: undefined,
  deckTravel: null,
  cardToDeck: null,
  cardSwap: null,
  handToCenter: null,
  inPlaceSpin: null,
  slotMachine: null,
  effectShred: null,
  spyReveal: null,
  forceDelete: null,
  effectToSlot: null,
  laneFlight: null,
  centerHeldEffect: null,
  commitLanes: [],
  fizzleToast: null,
  inFlightCardIds: [],
  hiddenCardIds: [],
  hiddenEffectIds: [],
  spyFlipEffectId: null,
  sequencer: IDLE_SEQUENCER,
  slotTokens: new Map(),
};

function captureCenterCastRect(): EffectToSlotRequest['fromRect'] {
  const sourceCard = document.querySelector('[data-cast-flight-source] .effect-card');
  if (sourceCard) {
    const r = sourceCard.getBoundingClientRect();
    if (r.width > 0) {
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    }
  }
  const measure = document.querySelector('[data-cast-center-anchor="measure"]');
  if (measure) {
    const r = measure.getBoundingClientRect();
    if (r.width > 0) {
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    }
  }
  return {
    cx: window.innerWidth / 2,
    cy: window.innerHeight / 2,
    w: 86,
    h: 120,
  };
}

// ── State helpers ──

function buildDeckTravelRequest(ownerId: PlayerId, card: PlayingCard): DeckTravelRequest {
  return { cardId: card.id, card, ownerId, slotIndex: card.slotIndex };
}

function getDeckTravelFromPlan(plan: AnimationPlan, next: GameState): DeckTravelRequest | null {
  const cardId = plan.targetCardIds[0];
  if (!cardId) return null;

  let ownerId: PlayerId;
  if (plan.kind === 'draw') {
    ownerId = plan.playerId;
  } else if (plan.effect?.type === 'send_back') {
    ownerId = getOpponent(plan.playerId);
  } else if (plan.effect?.type === 'last_draw') {
    ownerId = plan.playerId;
  } else {
    return null;
  }

  const card = next.players[ownerId].pokerHand.find(c => c.id === cardId);
  if (!card) return null;
  return buildDeckTravelRequest(ownerId, card);
}

function mergeDrawnCard(current: GameState, next: GameState, request: DeckTravelRequest): GameState {
  const { ownerId, cardId } = request;
  const hand = current.players[ownerId].pokerHand;
  if (hand.some(c => c.id === cardId)) return current;

  const drawnCard = next.players[ownerId].pokerHand.find(c => c.id === cardId);
  if (!drawnCard) return current;

  return {
    ...current,
    deck: current.deck.length > 0 ? current.deck.slice(0, -1) : current.deck,
    players: {
      ...current.players,
      [ownerId]: {
        ...current.players[ownerId],
        pokerHand: [...hand, drawnCard],
      },
    },
  };
}

/**
 * Remove specific cards from both players' hands in a GameState.
 * Used to prevent cards from appearing in the board before their
 * deck-travel animation has played.
 */
function omitCardsFromHands(state: GameState, cardIds: string[]): GameState {
  if (cardIds.length === 0) return state;
  const hide = new Set(cardIds);
  const filter = (hand: PlayingCard[]) => hand.filter(c => !hide.has(c.id));
  return {
    ...state,
    players: {
      player: { ...state.players.player, pokerHand: filter(state.players.player.pokerHand) },
      bot: { ...state.players.bot, pokerHand: filter(state.players.bot.pokerHand) },
    },
  };
}

function isDeckDrawEffect(plan: AnimationPlan): boolean {
  return plan.mechanical === 'send_back'
    || plan.effect?.type === 'last_draw'
    || plan.effect?.type === 'send_back';
}

/** Round-end draw plans only — NOT effect replacement cards. */
function getRoundEndDrawIds(plans: AnimationPlan[]): string[] {
  return plans
    .filter(p => p.kind === 'draw')
    .flatMap(p => p.targetCardIds)
    .filter((id): id is string => Boolean(id));
}

/**
 * displayGame view of `next` with the effect result visible but round-end
 * draw cards still omitted (they animate in later).
 */
function displayWithEffectResult(next: GameState, roundEndDrawIds: string[]): GameState {
  return roundEndDrawIds.length > 0 ? omitCardsFromHands(next, roundEndDrawIds) : next;
}

function collectNewRoundCards(
  prev: GameState,
  next: GameState,
): { ownerId: PlayerId; card: PlayingCard }[] {
  const entries: { ownerId: PlayerId; card: PlayingCard }[] = [];
  for (const pid of ['player', 'bot'] as PlayerId[]) {
    const prevIds = new Set(prev.players[pid].pokerHand.map(c => c.id));
    for (const card of next.players[pid].pokerHand) {
      if (!prevIds.has(card.id)) entries.push({ ownerId: pid, card });
    }
  }
  return entries;
}

// ── Overlay promise helpers ──

function createOverlayRunner(resolveRef: { current: (() => void) | null }) {
  return () => {
    resolveRef.current?.();
    resolveRef.current = null;
  };
}

async function waitOverlay(
  resolveRef: { current: (() => void) | null },
  apply: () => void,
): Promise<void> {
  await new Promise<void>(resolve => {
    resolveRef.current = resolve;
    apply();
  });
}

async function runDeckTravel(
  setVisual: Dispatch<SetStateAction<AnimationVisualState>>,
  resolveRef: { current: (() => void) | null },
  request: DeckTravelRequest,
  hiddenCardIds: string[] = [],
): Promise<void> {
  await waitOverlay(resolveRef, () => {
    setVisual(v => ({
      ...v,
      isAnimating: true,
      deckTravel: request,
      inFlightCardIds: [...new Set([...hiddenCardIds, request.cardId])],
    }));
  });
  setVisual(v => ({ ...v, deckTravel: null, inFlightCardIds: hiddenCardIds }));
}

// ── Token helpers ──

// ═══════════════════════════════════════
// Main hook
// ═══════════════════════════════════════

export function useAnimatedGame(initial: GameState) {
  const [game, setGame] = useState<GameState>(initial);
  const [displayGame, setDisplayGame] = useState<GameState>(initial);
  const [visual, setVisual] = useState<AnimationVisualState>(IDLE_VISUAL);
  const visualRef = useRef(visual);
  visualRef.current = visual;
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const gameRef = useRef(game);
  const deckTravelResolveRef = useRef<(() => void) | null>(null);
  const cardToDeckResolveRef = useRef<(() => void) | null>(null);
  const cardSwapResolveRef = useRef<(() => void) | null>(null);
  const handToCenterResolveRef = useRef<(() => void) | null>(null);
  const commitToLaneResolveRef = useRef<(() => void) | null>(null);
  const inPlaceSpinResolveRef = useRef<(() => void) | null>(null);
  const slotMachineResolveRef = useRef<(() => void) | null>(null);
  const effectShredResolveRef = useRef<(() => void) | null>(null);
  const spyRevealResolveRef = useRef<(() => void) | null>(null);
  const forceDeleteResolveRef = useRef<(() => void) | null>(null);
  const effectToSlotResolveRef = useRef<(() => void) | null>(null);
  const skipRef = useRef(false);
  // gameRef is updated only inside applyUpdate / resetGame / runResolutionCinematic.
  // Do NOT mirror React `game` here — re-renders during resolution would rewind
  // gameRef to the pre-resolution committing state and break detectAnimations.

  const resolveAllOverlays = useCallback(() => {
    deckTravelResolveRef.current?.();
    cardToDeckResolveRef.current?.();
    cardSwapResolveRef.current?.();
    handToCenterResolveRef.current?.();
    commitToLaneResolveRef.current?.();
    inPlaceSpinResolveRef.current?.();
    slotMachineResolveRef.current?.();
    effectShredResolveRef.current?.();
    spyRevealResolveRef.current?.();
    forceDeleteResolveRef.current?.();
    effectToSlotResolveRef.current?.();
  }, []);

  const wait = async (ms: number) => {
    if (skipRef.current) return;
    await delay(ms);
  };

  const holdForMs = async (ms: number) => {
    if (skipRef.current) return;
    await afterPaint();
    await delay(ms);
  };

  const setSequencer = (patch: Partial<SequencerUIState> | null) => {
    if (patch === null) {
      setVisual(v => ({ ...v, sequencer: IDLE_SEQUENCER }));
      return;
    }
    setVisual(v => ({ ...v, sequencer: { ...v.sequencer, ...patch } }));
  };

  const requestFastForward = useCallback(() => {
    skipRef.current = true;
    resolveAllOverlays();
  }, [resolveAllOverlays]);

  const completeDeckTravel = useCallback(() => {
    playHitCardSound();
    deckTravelResolveRef.current?.();
    deckTravelResolveRef.current = null;
  }, []);

  const completeCardToDeck = useCallback(createOverlayRunner(cardToDeckResolveRef), []);
  const completeCardSwap = useCallback(createOverlayRunner(cardSwapResolveRef), []);
  const completeHandToCenter = useCallback(createOverlayRunner(handToCenterResolveRef), []);
  const completeCommitToLane = useCallback(createOverlayRunner(commitToLaneResolveRef), []);
  const completeInPlaceSpin = useCallback(() => {
    playHitCardSound();
    inPlaceSpinResolveRef.current?.();
    inPlaceSpinResolveRef.current = null;
  }, []);
  const completeSlotMachine = useCallback(createOverlayRunner(slotMachineResolveRef), []);
  const completeEffectShred = useCallback(createOverlayRunner(effectShredResolveRef), []);
  const completeSpyReveal = useCallback(createOverlayRunner(spyRevealResolveRef), []);
  const completeForceDelete = useCallback(createOverlayRunner(forceDeleteResolveRef), []);
  const completeEffectToSlot = useCallback(createOverlayRunner(effectToSlotResolveRef), []);

  const finishInstant = (next: GameState) => {
    setDisplayGame(next);
    setGame(next);
    gameRef.current = next;
    setVisual(v => ({ ...IDLE_VISUAL, sequencer: v.sequencer, slotTokens: v.slotTokens }));
  };

  const markLaneDeparted = useCallback((effectId: string) => {
    setVisual(v => ({
      ...v,
      commitLanes: v.commitLanes.map(c =>
        c.effectId === effectId ? { ...c, departed: true, active: false } : c,
      ),
    }));
  }, []);

  const hideEffectInHand = useCallback((effectId: string) => {
    setVisual(v => ({
      ...v,
      hiddenEffectIds: v.hiddenEffectIds.includes(effectId)
        ? v.hiddenEffectIds
        : [...v.hiddenEffectIds, effectId],
    }));
  }, []);

  const clearCenterHeld = useCallback(() => {
    setVisual(v => ({ ...v, centerHeldEffect: null }));
  }, []);

  const markLaneConsumed = (effectId: string) => {
    setVisual(v => ({
      ...v,
      commitLanes: v.commitLanes.map(c =>
        c.effectId === effectId ? { ...c, consumed: true, active: false } : c,
      ),
    }));
  };

  const revealLaneCard = async (effectId: string) => {
    const lane = visualRef.current.commitLanes.find(c => c.effectId === effectId);
    const needsFlip = lane?.faceDown;

    setVisual(v => ({
      ...v,
      commitLanes: v.commitLanes.map(c =>
        c.effectId === effectId
          ? { ...c, active: true, revealed: true }
          : { ...c, active: false },
      ),
    }));

    if (needsFlip) {
      await holdForMs(LANE_REVEAL_MS);
    } else {
      await holdForMs(220);
    }
  };

  const runCommitToLanesPhase = async (startState: GameState) => {
    const lanes = buildCommitLanes(startState);
    if (lanes.length === 0) return;

    setVisual(v => ({
      ...v,
      isAnimating: true,
      commitLanes: lanes,
      hiddenEffectIds: [],
    }));
    await afterPaint();

    for (const card of lanes) {
      if (skipRef.current) return;
      await waitOverlay(commitToLaneResolveRef, () => {
        setVisual(v => ({
          ...v,
          laneFlight: {
            effectId: card.effectId,
            effect: card.effect,
            ownerId: card.ownerId,
            laneIndex: card.laneIndex,
            faceDown: card.faceDown,
          },
        }));
      });
      setVisual(v => ({
        ...v,
        laneFlight: null,
      }));
      await holdForMs(COMMIT_TO_LANE_STAGGER_MS);
    }

    setVisual(v => ({
      ...v,
      hiddenEffectIds: activeLaneHiddenIds(lanes),
    }));
  };

  // ── Sequential round-end draws (after resolution → new round) ──
  const runSequentialRoundDraws = async (prev: GameState, next: GameState) => {
    const entries = collectNewRoundCards(prev, next);
    if (entries.length === 0 || skipRef.current) return;

    const drawIds = entries.map(e => e.card.id);

    setDisplayGame(omitCardsFromHands(prev, drawIds));
    setVisual(v => ({
      ...v,
      isAnimating: true,
      hiddenCardIds: drawIds,
      inFlightCardIds: drawIds,
      deckTravel: null,
    }));
    await afterPaint();

    for (let i = 0; i < entries.length; i++) {
      if (skipRef.current) break;
      const { ownerId, card } = entries[i]!;
      const stillHidden = drawIds.slice(i + 1);
      const request = buildDeckTravelRequest(ownerId, card);

      await runDeckTravel(setVisual, deckTravelResolveRef, request, stillHidden);
      setDisplayGame(current => mergeDrawnCard(current, next, request));
      setVisual(v => ({
        ...v,
        deckTravel: null,
        inFlightCardIds: stillHidden,
        hiddenCardIds: stillHidden,
      }));

      if (i < entries.length - 1) {
        await holdForMs(DRAW_BETWEEN_MS);
      } else {
        await holdForMs(SETTLE_MS);
      }
    }
  };

  // ── Draw plan (round-end card from deck) ──
  const runDrawPlan = async (
    _prev: GameState,
    next: GameState,
    plan: AnimationPlan,
    roundEndDrawIds: string[] = [],
  ) => {
    const request = getDeckTravelFromPlan(plan, next);
    if (!request) return;

    const planIndex = roundEndDrawIds.indexOf(request.cardId);
    const stillHidden = planIndex >= 0 ? roundEndDrawIds.slice(planIndex + 1) : [];

    await afterPaint();
    await runDeckTravel(setVisual, deckTravelResolveRef, request, stillHidden);
    setDisplayGame(current => mergeDrawnCard(current, next, request));
    await holdForMs(SETTLE_MS);
    setVisual(v => ({ ...v, deckTravel: null, inFlightCardIds: stillHidden, hiddenCardIds: stillHidden }));
  };

  // ═══════════════════════════════════════
  // Deck-draw choreography for send_back / last_draw
  //
  // Visual sequence the player should see:
  //   1. Old card lifts off its slot and flies to the deck
  //   2. Brief pause (the slot is now visibly empty)
  //   3. New card flies from the deck into the empty slot
  //   4. New card lands and becomes part of the board
  //
  // Key: displayGame is NOT updated before this runs.
  // The board still shows the old card from prev state.
  // ═══════════════════════════════════════
  const runDeckDrawChoreography = async (
    _prev: GameState,
    next: GameState,
    plan: AnimationPlan,
    roundEndDrawIds: string[],
  ) => {
    if (skipRef.current) return;

    const effectNewCardId = plan.targetCardIds[0];
    const action = plan.committedAction;
    const ownerId = plan.effect?.type === 'last_draw'
      ? plan.playerId
      : getOpponent(plan.playerId);
    const oldCard = plan.cardBefore
      ?? (action?.opponentSlot !== undefined && plan.effect?.type === 'send_back'
        ? _prev.players[ownerId].pokerHand.find(c => c.slotIndex === action.opponentSlot)
        : action?.ownSlot !== undefined && plan.effect?.type === 'last_draw'
          ? _prev.players[ownerId].pokerHand.find(c => c.slotIndex === action.ownSlot)
          : undefined);
    const newCardReq = getDeckTravelFromPlan(plan, next);
    // Round-end cards stay hidden until their own draw animations.
    const hideDuringChoreo = [
      ...(effectNewCardId ? [effectNewCardId] : []),
      ...roundEndDrawIds,
    ];

    // Step 1: Old card flies to deck
    if (oldCard && !skipRef.current) {
      const toDeckReq: CardToDeckRequest = {
        card: oldCard,
        ownerId,
        slotIndex: oldCard.slotIndex,
      };
      await waitOverlay(cardToDeckResolveRef, () => {
        setVisual(v => ({
          ...v,
          hiddenCardIds: [oldCard.id, ...hideDuringChoreo],
          cardToDeck: toDeckReq,
        }));
      });
      setVisual(v => ({ ...v, cardToDeck: null }));
      await holdForMs(CHOREO_PAUSE_MS);
    }

    if (skipRef.current) return;

    // Step 2: Apply effect result (effect card leaves tray), slot stays empty
    setDisplayGame(omitCardsFromHands(next, hideDuringChoreo));
    setVisual(v => ({ ...v, hiddenCardIds: hideDuringChoreo }));

    // Step 3: New card flies from deck to the empty slot
    if (newCardReq && !skipRef.current) {
      await afterPaint();
      await runDeckTravel(setVisual, deckTravelResolveRef, newCardReq, roundEndDrawIds);
    }

    if (skipRef.current) return;

    // Step 4: Reveal the effect replacement card — only round-end draws stay hidden
    setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
    setVisual(v => ({
      ...v,
      deckTravel: null,
      inFlightCardIds: roundEndDrawIds,
      hiddenCardIds: roundEndDrawIds,
    }));
    await holdForMs(SETTLE_MS);
  };

  // ═══════════════════════════════════════
  // Effect plan: the core "tell-one-story" sequence
  //
  // 1. PRESENT — card rises to center, hold ~800ms to be read
  // 2. TARGET  — card shrinks, target slots glow, hold ~500ms
  // 3. IMPACT  — game state applies, board shows result
  // 4. RETIRE  — card fades back toward owner side
  //
  // For deck-draw effects (send_back, last_draw), IMPACT is replaced
  // by the deck choreography: old card → deck → new card from deck.
  //
  // For ALL effects, any round-end drawn cards are omitted from
  // displayGame at IMPACT — they'll be revealed by their own
  // draw plan animations afterward.
  // ═══════════════════════════════════════
  const runEffectPlan = async (
    prev: GameState,
    next: GameState,
    plan: AnimationPlan,
    roundEndDrawIds: string[] = [],
  ) => {
    if (skipRef.current) { finishInstant(next); return; }

    const effectId = plan.effect?.id;
    const fromCommitLane = Boolean(
      effectId && visualRef.current.commitLanes.some(c => c.effectId === effectId),
    );

    // ── 0. REVEAL at commit lane ──
    if (effectId && visualRef.current.commitLanes.some(c => c.effectId === effectId)) {
      await revealLaneCard(effectId);
      if (skipRef.current) { finishInstant(next); return; }
    }

    // ── 1. PRESENT ──
    setVisual(v => ({
      ...v,
      isAnimating: true,
      castOverlay: fromCommitLane ? null : plan,
      castPhase: fromCommitLane ? null : 'present',
      centerHeldEffect: null,
      mechanical: null,
      targetCardIds: [],
      targetSlots: [],
      targetEffectId: null,
      drawingEffectIds: [],
      cardBefore: plan.cardBefore,
      cardAfter: plan.cardAfter,
      deckTravel: null,
      cardToDeck: null,
      cardSwap: null,
      handToCenter: null,
      inPlaceSpin: null,
      slotMachine: null,
      effectShred: null,
      spyReveal: null,
      forceDelete: null,
      effectToSlot: null,
      inFlightCardIds: [],
      hiddenCardIds: [],
      hiddenEffectIds: fromCommitLane ? v.hiddenEffectIds : [],
      spyFlipEffectId: null,
    }));

    const isInstant = plan.mechanical === 'instant';
    const action = plan.committedAction;
    const deckDraw = isDeckDrawEffect(plan);

    // ── 1. PRESENT: lane/hand → center ──
    if (plan.effect && !skipRef.current) {
      await afterPaint();
      await waitOverlay(handToCenterResolveRef, () => {
        setVisual(v => ({
          ...v,
          handToCenter: {
            effectId: plan.effect!.id,
            effect: plan.effect!,
            fromOwnerId: plan.playerId,
          },
          hiddenEffectIds: fromCommitLane
            ? v.hiddenEffectIds
            : plan.effect ? [plan.effect.id] : [],
        }));
      });
      setVisual(v => ({
        ...v,
        handToCenter: null,
        centerHeldEffect: plan.effect
          ? { effectId: plan.effect.id, effect: plan.effect }
          : null,
      }));
      await holdForMs(CAST_CENTER_HOLD_MS);
    }
    if (skipRef.current) { finishInstant(next); return; }

    // Fizzled effects: toast at lane, then done
    if (isInstant) {
      const reason = parseFizzleReason(plan.logMessage);
      const toast = plan.effect
        ? formatFizzleToast(plan.effect.type, reason)
        : { title: 'Effect fizzled', body: 'The effect could not be applied.' };

      setVisual(v => ({
        ...v,
        castOverlay: null,
        castPhase: null,
        centerHeldEffect: null,
        fizzleToast: toast,
        hiddenEffectIds: v.hiddenEffectIds,
      }));
      await holdForMs(FIZZLE_TOAST_MS);
      if (effectId) markLaneConsumed(effectId);
      setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
      setGame(next);
      gameRef.current = next;
      setVisual(v => ({
        ...IDLE_VISUAL,
        sequencer: v.sequencer,
        slotTokens: v.slotTokens,
        commitLanes: v.commitLanes,
        hiddenEffectIds: activeLaneHiddenIds(v.commitLanes),
        fizzleToast: null,
      }));
      await wait(SETTLE_MS);
      return;
    }

    // ── 2. TARGET ──
    const targetSlots = action ? getActionTargetSlots(action, plan.playerId) : [];
    const targetEffectId = action
      ? getActionTargetEffectId(action)
      : plan.opponentEffectId ?? null;

    setVisual(v => ({
      ...v,
      castPhase: fromCommitLane ? null : 'target',
      castOverlay: fromCommitLane ? null : v.castOverlay,
      targetSlots,
      targetEffectId,
    }));
    await holdForMs(CAST_TARGET_MS);
    if (skipRef.current) { finishInstant(next); return; }

    const victimOwner = getOpponent(plan.playerId);
    const victimEffectId = plan.opponentEffectId ?? action?.opponentEffectId;
    const victimEffect = victimEffectId
      ? prev.players[victimOwner].effectHand.find(e => e.id === victimEffectId)
      : undefined;

    // ── 3. Fly: center → token slot ──
    const tokenTargets = plan.effect && action && shouldAddToken(plan.effect.type)
      ? getTokenTargetSlots(action, plan.playerId)
      : [];

    if (tokenTargets.length > 0 && plan.effect && !skipRef.current) {
      await afterPaint();
      const centerRect = captureCenterCastRect();

      for (const target of tokenTargets) {
        const targetKey = tokenSlotKey(target.ownerId, target.slotIndex);

        setVisual(v => ({ ...v, castPhase: fromCommitLane ? null : 'fly' }));
        await afterPaint();

        await waitOverlay(effectToSlotResolveRef, () => {
          setVisual(v => ({
            ...v,
            effectToSlot: {
              effectId: plan.effect!.id,
              effect: plan.effect!,
              toSlotKey: targetKey,
              from: 'center',
              fromRect: centerRect,
            },
          }));
        });
        setVisual(v => ({ ...v, effectToSlot: null }));

        if (shouldPersistToken(plan.effect.type)) {
          const newToken: EffectToken = {
            id: nextTokenId(),
            effect: plan.effect,
            roundsLeft: TOKEN_ROUNDS[plan.effect.type],
          };
          setVisual(v => ({
            ...v,
            slotTokens: addTokenToSlot(v.slotTokens, targetKey, newToken),
          }));
        }
        await holdForMs(280);
      }

      setVisual(v => ({
        ...v,
        castOverlay: null,
        castPhase: null,
        centerHeldEffect: null,
        hiddenEffectIds: fromCommitLane ? v.hiddenEffectIds : [],
      }));
      await holdForMs(200);
    } else if (!skipRef.current && plan.mechanical !== 'spy' && plan.mechanical !== 'force_delete') {
      setVisual(v => ({
        ...v,
        castOverlay: null,
        castPhase: null,
        centerHeldEffect: null,
        hiddenEffectIds: fromCommitLane ? v.hiddenEffectIds : [],
      }));
      await holdForMs(100);
    }

    // ── 4. Mechanical overlays ──
    if (plan.mechanical === 'swap' && plan.swapCardIds) {
      const swapReq = buildSwapRequest(prev, plan.swapCardIds);
      if (swapReq && !skipRef.current) {
        await afterPaint();
        await waitOverlay(cardSwapResolveRef, () => {
          setVisual(v => ({
            ...v,
            cardSwap: swapReq,
            hiddenCardIds: [...plan.swapCardIds!, ...roundEndDrawIds],
          }));
        });
        setVisual(v => ({ ...v, cardSwap: null }));
      }
    } else if (
      (plan.mechanical === 'transform' || plan.mechanical === 'shift')
      && plan.cardBefore
      && plan.cardAfter
      && !skipRef.current
    ) {
      await afterPaint();
      await waitOverlay(slotMachineResolveRef, () => {
        setVisual(v => ({
          ...v,
          slotMachine: {
            mode: plan.mechanical === 'transform' ? 'transform' : 'shift',
            cardBefore: plan.cardBefore!,
            cardAfter: plan.cardAfter!,
          },
          hiddenCardIds: [plan.cardBefore!.id, ...roundEndDrawIds],
        }));
      });
      setVisual(v => ({ ...v, slotMachine: null }));
    } else if (plan.mechanical === 'spy' && victimEffect && !skipRef.current) {
      setVisual(v => ({
        ...v,
        castOverlay: null,
        castPhase: null,
        centerHeldEffect: null,
        spyFlipEffectId: victimEffect.id,
      }));
      await afterPaint();
      await waitOverlay(spyRevealResolveRef, () => {
        setVisual(v => ({
          ...v,
          spyReveal: { victimEffect, victimOwnerId: victimOwner },
        }));
      });
      setVisual(v => ({ ...v, spyReveal: null, spyFlipEffectId: null }));
    } else if (plan.mechanical === 'force_delete' && victimEffect && !skipRef.current) {
      setVisual(v => ({
        ...v,
        castOverlay: null,
        castPhase: null,
        centerHeldEffect: null,
      }));
      await afterPaint();
      await waitOverlay(forceDeleteResolveRef, () => {
        setVisual(v => ({
          ...v,
          forceDelete: { victimEffect, victimOwnerId: victimOwner },
        }));
      });
      setVisual(v => ({ ...v, forceDelete: null }));
    }

    if (skipRef.current) { finishInstant(next); return; }

    // ── Cleanse: remove freeze token with leaving animation ──
    if (plan.mechanical === 'cleanse' && !skipRef.current) {
      const cleanseAction = plan.committedAction;
      if (cleanseAction?.cleanseOwnerId !== undefined && cleanseAction.cleanseSlot !== undefined) {
        const cleanseKey = `${cleanseAction.cleanseOwnerId}-${cleanseAction.cleanseSlot}`;
        const freezeTokens = visualRef.current.slotTokens.get(cleanseKey)?.filter(t => t.effect.type === 'freeze') ?? [];
        if (freezeTokens.length > 0) {
          const tokenToRemove = freezeTokens[0]!;
          setVisual(v => {
            let tokens = removeTokenFromSlot(v.slotTokens, cleanseKey, tokenToRemove.id);
            tokens = addTokenToSlot(tokens, cleanseKey, { ...tokenToRemove, leaving: true });
            return { ...v, slotTokens: tokens };
          });
          await holdForMs(250);
          setVisual(v => ({
            ...v,
            slotTokens: removeTokenFromSlot(v.slotTokens, cleanseKey, tokenToRemove.id),
          }));
        }
      }
    }

    // ── 3. IMPACT ──
    const useOverlayMechanical =
      plan.mechanical === 'swap'
      || plan.mechanical === 'transform'
      || plan.mechanical === 'shift'
      || plan.mechanical === 'spy'
      || plan.mechanical === 'force_delete';

    setVisual(v => ({
      ...v,
      castPhase: 'impact',
      castOverlay: null,
      targetSlots: [],
      targetEffectId: null,
      hiddenEffectIds: fromCommitLane ? v.hiddenEffectIds : [],
      mechanical: plan.mechanical !== 'none' && !useOverlayMechanical ? plan.mechanical : null,
      targetCardIds: useOverlayMechanical ? [] : plan.targetCardIds,
    }));

    if (deckDraw) {
      await holdForMs(CHOREO_PAUSE_MS);
      await runDeckDrawChoreography(prev, next, plan, roundEndDrawIds);
    } else if (plan.mechanical === 'swap' && plan.swapCardIds) {
      // Swap already animated above — apply board state now
      setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
      setVisual(v => ({ ...v, hiddenCardIds: roundEndDrawIds }));
      await holdForMs(IMPACT_HOLD_MS);
    } else {
      setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
      setVisual(v => ({ ...v, hiddenCardIds: roundEndDrawIds }));
      await holdForMs(IMPACT_HOLD_MS);
    }

    if (skipRef.current) { finishInstant(next); return; }

    setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
    setVisual(v => ({
      ...v,
      castPhase: null,
      castOverlay: null,
      mechanical: null,
      targetCardIds: [],
      targetSlots: [],
      targetEffectId: null,
      hiddenEffectIds: activeLaneHiddenIds(v.commitLanes),
      hiddenCardIds: roundEndDrawIds,
      inFlightCardIds: [],
    }));
    setGame(next);
    gameRef.current = next;
    if (effectId) markLaneConsumed(effectId);
    await wait(SETTLE_MS);
    void prev;
  };

  const runPlan = async (
    prev: GameState,
    next: GameState,
    plan: AnimationPlan,
    roundEndDrawIds: string[] = [],
  ) => {
    if (plan.kind === 'draw') {
      await runDrawPlan(prev, next, plan, roundEndDrawIds);
    } else {
      await runEffectPlan(prev, next, plan, roundEndDrawIds);
    }
  };

  // ── Intro reveal (game start) ──
  const runIntroReveal = useCallback(async (state: GameState) => {
    const entries = ([
      { ownerId: 'player' as const, card: state.players.player.pokerHand[0] },
      { ownerId: 'bot' as const, card: state.players.bot.pokerHand[0] },
    ]).filter((e): e is { ownerId: PlayerId; card: PlayingCard } => Boolean(e.card));

    await queueRef.current;
    queueRef.current = queueRef.current.then(async () => {
      const pendingIds = entries.map(e => e.card.id);
      for (let i = 0; i < entries.length; i++) {
        const { ownerId, card } = entries[i]!;
        const stillHidden = pendingIds.slice(i + 1);
        await runDeckTravel(
          setVisual,
          deckTravelResolveRef,
          buildDeckTravelRequest(ownerId, card),
          stillHidden,
        );
        if (i < entries.length - 1) {
          await afterPaint();
          await delay(INTRO_REVEAL_GAP_MS);
        }
      }
      setVisual(v => ({ ...v, inFlightCardIds: [], isAnimating: false }));
    });
    return queueRef.current;
  }, []);

  // ── Apply a single state transition with animation ──
  const applyUpdate = useCallback((next: GameState) => {
    queueRef.current = queueRef.current.then(async () => {
      const prev = gameRef.current;
      if (prev === next) return;

      // After effects resolve, round cards must animate one-by-one (like intro / pass).
      if (prev.phase === 'resolving' && (next.phase === 'committing' || next.phase === 'finished')) {
        const roundDraws = collectNewRoundCards(prev, next);
        if (roundDraws.length > 0) {
          await runSequentialRoundDraws(prev, next);
          setGame(next);
          setDisplayGame(next);
          gameRef.current = next;
          setVisual(v => ({
            ...IDLE_VISUAL,
            sequencer: v.sequencer,
            slotTokens: v.slotTokens,
          }));
          return;
        }
      }

      const plans = detectAnimations(prev, next);

      if (plans.length === 0) {
        setGame(next);
        setDisplayGame(next);
        gameRef.current = next;
        return;
      }

      if (next.phase === 'resolving' && prev.phase === 'committing') {
        skipRef.current = false;
      }

      setVisual(v => ({ ...v, isAnimating: true }));

      // Only round-end draw cards stay hidden until their deck-travel animation.
      // Effect replacement cards are revealed by the effect plan itself.
      const roundEndDrawIds = getRoundEndDrawIds(plans);

      if (roundEndDrawIds.length > 0) {
        setDisplayGame(cur => omitCardsFromHands(cur, roundEndDrawIds));
        setVisual(v => ({
          ...v,
          hiddenCardIds: roundEndDrawIds,
          inFlightCardIds: roundEndDrawIds,
        }));
        await afterPaint();
      }

      let stepState = prev;
      for (let i = 0; i < plans.length; i++) {
        if (skipRef.current) break;

        await runPlan(stepState, next, plans[i]!, roundEndDrawIds);
        stepState = next;
        if (i < plans.length - 1) {
          const bothDraws = plans[i]?.kind === 'draw' && plans[i + 1]?.kind === 'draw';
          await holdForMs(bothDraws ? DRAW_BETWEEN_MS : BETWEEN_PLANS_MS);
        }
      }

      // Final cleanup: ensure display matches actual game state
      setGame(next);
      setDisplayGame(next);
      gameRef.current = next;
      setVisual(v => ({
        ...IDLE_VISUAL,
        sequencer: v.sequencer,
        slotTokens: v.slotTokens,
        commitLanes: next.phase === 'resolving' ? v.commitLanes : [],
        hiddenEffectIds: next.phase === 'resolving' ? activeLaneHiddenIds(v.commitLanes) : [],
      }));
    });

    return queueRef.current;
  }, []);

  /** Re-exported so GameBoard can start the lane animation immediately on the
   *  resolving snapshot while waiting for the committing snapshot. */
  const runCommitRevealPhase = useCallback(async (startState: GameState) => {
    setVisual(v => ({ ...v, isAnimating: true }));
    await runCommitToLanesPhase(startState);
  }, []);

  /**
   * @param finalState  Server's committing state. When provided:
   *   • deck-draw effects use the actual drawn cards (via caller-supplied resolveStep)
   *   • round-end draws animate the server's actual new cards, not locally random ones
   *   • `skipLanes` must be true (lanes already animated via runCommitRevealPhase)
   * @param skipLanes   Skip the commit-to-lane animation (already played separately).
   */
  const runResolutionCinematic = useCallback(async (
    startState: GameState,
    resolveStep: (s: GameState) => GameState,
    onProgress?: (state: GameState) => void,
    finalState?: GameState,
    skipLanes?: boolean,
  ): Promise<GameState> => {
    skipRef.current = false;
    gameRef.current = startState;
    setGame(startState);
    setDisplayGame(startState);
    let current = startState;

    setVisual(v => ({ ...v, isAnimating: true }));
    if (!skipLanes) {
      await runCommitToLanesPhase(startState);
    }

    const queue = startState.resolutionQueue;
    let queueIdx = 0;

    for (const pid of getResolutionOrder(startState)) {
      if (skipRef.current) break;

      while (queueIdx < queue.length && queue[queueIdx]!.playerId === pid) {
        if (skipRef.current) break;
        current = resolveStep(current);
        await applyUpdate(current);
        onProgress?.(current);
        queueIdx++;
        if (current.phase !== 'resolving') break;
      }
      if (current.phase !== 'resolving') break;
    }

    // Round-end draws are a separate transition so deck effects animate first.
    if (
      !skipRef.current
      && current.phase === 'resolving'
      && current.resolutionIndex >= queue.length
    ) {
      await holdForMs(DRAW_BEAT_MS);
      const beforeFinish = current;
      if (finalState) {
        // Online mode: use server's authoritative committing state for round-end
        // draws. This ensures the animated card IDs match exactly what the server
        // dealt — no silent correction needed after the cinematic.
        await runSequentialRoundDraws(beforeFinish, finalState);
        current = finalState;
      } else {
        current = finishResolutionIfComplete(current);
        await runSequentialRoundDraws(beforeFinish, current);
      }
      setGame(current);
      setDisplayGame(current);
      gameRef.current = current;
      onProgress?.(current);
    }

    if (skipRef.current && current.phase === 'resolving') {
      resolveAllOverlays();
      if (finalState) {
        current = finalState;
      } else {
        while (current.phase === 'resolving') {
          if (current.resolutionIndex >= current.resolutionQueue.length) {
            current = finishResolutionIfComplete(current);
          } else {
            current = resolveStep(current);
          }
        }
      }
      setGame(current);
      setDisplayGame(current);
      gameRef.current = current;
    }

    // ── Decrement all token round counters ──
    const { updated: updatedTokens, expired: expiredTokens } = decrementAllTokens(visualRef.current.slotTokens);
    if (expiredTokens.length > 0 && !skipRef.current) {
      setVisual(v => {
        let tokens = v.slotTokens;
        for (const { slotKey, token } of expiredTokens) {
          tokens = addTokenToSlot(tokens, slotKey, token);
        }
        return { ...v, slotTokens: tokens };
      });
      await holdForMs(250);
    }
    setVisual(v => ({ ...v, slotTokens: updatedTokens }));

    setVisual(v => ({ ...IDLE_VISUAL, slotTokens: v.slotTokens }));
    setSequencer(null);
    skipRef.current = false;
    return current;
  }, [applyUpdate, resolveAllOverlays]);

  const resetGame = useCallback((fresh: GameState) => {
    queueRef.current = Promise.resolve();
    setGame(fresh);
    setDisplayGame(fresh);
    gameRef.current = fresh;
    setVisual({ ...IDLE_VISUAL, slotTokens: new Map() });
  }, []);

  /**
   * Silently snap to a new game state through the animation queue — no visual
   * transitions, no token reset. Used to apply server ground-truth corrections
   * after local resolution may have diverged (e.g. deck-draw randomness).
   */
  const snapToState = useCallback((next: GameState) => {
    queueRef.current = queueRef.current.then(() => {
      setGame(next);
      setDisplayGame(next);
      gameRef.current = next;
    });
    return queueRef.current;
  }, []);

  const getGameState = useCallback(() => gameRef.current, []);

  return {
    game,
    displayGame,
    visual,
    slotTokens: visual.slotTokens,
    applyUpdate,
    snapToState,
    runCommitRevealPhase,
    runResolutionCinematic,
    requestFastForward,
    resetGame,
    getGameState,
    runIntroReveal,
    completeDeckTravel,
    completeCardToDeck,
    completeCardSwap,
    completeHandToCenter,
    departLaneCard: markLaneDeparted,
    hideEffectInHand,
    clearCenterHeld,
    completeCommitToLane,
    completeInPlaceSpin,
    completeSlotMachine,
    completeEffectShred,
    completeSpyReveal,
    completeForceDelete,
    completeEffectToSlot,
    isAnimating: visual.isAnimating,
  };
}
