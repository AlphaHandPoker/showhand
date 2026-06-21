import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameState, PlayerId, PlayingCard } from '../game/types';
import { getOpponent, getResolutionOrder } from '../game/gameEngine';
import {
  detectAnimations,
  type AnimationPlan,
  type CastAnimation,
  type MechanicalAnimType,
} from '../ui/detectAnimations';
import type { DeckTravelRequest } from '../components/CardFromDeckFlight';
import type { CardToDeckRequest } from '../components/CardToDeckFlight';
import type { CardSwapRequest } from '../components/CardSwapFlight';
import type { SlotMachineRequest } from '../components/SlotMachineReveal';
import type { EffectShredRequest } from '../components/EffectShredOverlay';
import {
  CAST_TARGET_MS,
  CAST_RETIRE_MS,
  CAST_FIZZLE_MS,
  ROUND_BANNER_MS,
  SIDE_PASS_MS,
  SIDE_TRANSITION_MS,
  DRAW_BEAT_MS,
} from '../ui/resolutionTimings';
import {
  getActionTargetSlots,
  getActionTargetEffectId,
  playerLabel,
} from '../ui/resolutionTargets';
import type { SequencerUIState } from '../components/ResolutionSequencerUI';
import { IDLE_SEQUENCER } from '../components/ResolutionSequencerUI';
import type { TargetSlot } from '../ui/resolutionTargets';

// ── Timing constants ──
const PRESENT_HOLD_MS = 800;
const IMPACT_HOLD_MS = 400;
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

export type CastPhase = 'present' | 'target' | 'impact' | 'retire' | 'result';

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
  slotMachine: SlotMachineRequest | null;
  effectShred: EffectShredRequest | null;
  inFlightCardIds: string[];
  hiddenCardIds: string[];
  spyFlipEffectId: string | null;
  sequencer: SequencerUIState;
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
  slotMachine: null,
  effectShred: null,
  inFlightCardIds: [],
  hiddenCardIds: [],
  spyFlipEffectId: null,
  sequencer: IDLE_SEQUENCER,
};

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
  return plan.mechanical === 'send_back' || plan.effect?.type === 'last_draw';
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

// ═══════════════════════════════════════
// Main hook
// ═══════════════════════════════════════

export function useAnimatedGame(initial: GameState) {
  const [game, setGame] = useState<GameState>(initial);
  const [displayGame, setDisplayGame] = useState<GameState>(initial);
  const [visual, setVisual] = useState<AnimationVisualState>(IDLE_VISUAL);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const gameRef = useRef(game);
  const deckTravelResolveRef = useRef<(() => void) | null>(null);
  const cardToDeckResolveRef = useRef<(() => void) | null>(null);
  const cardSwapResolveRef = useRef<(() => void) | null>(null);
  const slotMachineResolveRef = useRef<(() => void) | null>(null);
  const effectShredResolveRef = useRef<(() => void) | null>(null);
  const skipRef = useRef(false);
  gameRef.current = game;

  const resolveAllOverlays = useCallback(() => {
    deckTravelResolveRef.current?.();
    cardToDeckResolveRef.current?.();
    cardSwapResolveRef.current?.();
    slotMachineResolveRef.current?.();
    effectShredResolveRef.current?.();
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

  const completeDeckTravel = useCallback(createOverlayRunner(deckTravelResolveRef), []);
  const completeCardToDeck = useCallback(createOverlayRunner(cardToDeckResolveRef), []);
  const completeCardSwap = useCallback(createOverlayRunner(cardSwapResolveRef), []);
  const completeSlotMachine = useCallback(createOverlayRunner(slotMachineResolveRef), []);
  const completeEffectShred = useCallback(createOverlayRunner(effectShredResolveRef), []);

  const finishInstant = (next: GameState) => {
    setDisplayGame(next);
    setGame(next);
    gameRef.current = next;
    setVisual(v => ({ ...IDLE_VISUAL, sequencer: v.sequencer }));
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
    const oldCard = plan.cardBefore;
    const newCardReq = getDeckTravelFromPlan(plan, next);
    const ownerId = plan.effect?.type === 'last_draw'
      ? plan.playerId
      : getOpponent(plan.playerId);

    // During choreography, hide the effect replacement + round-end cards.
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

    const isInstant = plan.mechanical === 'instant';
    const action = plan.committedAction;
    const deckDraw = isDeckDrawEffect(plan);

    // ── 1. PRESENT ──
    setSequencer({ activeResolver: plan.playerId });
    setVisual(v => ({
      ...v,
      isAnimating: true,
      castOverlay: plan,
      castPhase: 'present',
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
      slotMachine: null,
      effectShred: null,
      inFlightCardIds: [],
      hiddenCardIds: [],
      spyFlipEffectId: null,
      sequencer: { ...v.sequencer, activeResolver: plan.playerId },
    }));
    await holdForMs(PRESENT_HOLD_MS);
    if (skipRef.current) { finishInstant(next); return; }

    // Fizzled effects: brief result panel then done
    if (isInstant) {
      setVisual(v => ({
        ...v,
        castPhase: 'result',
        mechanical: null,
        targetSlots: [],
        targetEffectId: null,
      }));
      await holdForMs(CAST_FIZZLE_MS);
      setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
      setGame(next);
      gameRef.current = next;
      setVisual(v => ({ ...IDLE_VISUAL, sequencer: v.sequencer }));
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
      castPhase: 'target',
      targetSlots,
      targetEffectId,
    }));
    await holdForMs(CAST_TARGET_MS);
    if (skipRef.current) { finishInstant(next); return; }

    // ── 3. IMPACT ──
    setVisual(v => ({
      ...v,
      castPhase: 'impact',
      castOverlay: null,
      targetSlots: [],
      targetEffectId: null,
      mechanical: plan.mechanical !== 'none' ? plan.mechanical : null,
      targetCardIds: plan.targetCardIds,
    }));

    if (deckDraw) {
      // Board still shows prev state; choreography handles the card swap.
      await holdForMs(CHOREO_PAUSE_MS);
      await runDeckDrawChoreography(prev, next, plan, roundEndDrawIds);
    } else {
      // Normal effects: show result now, omit only round-end draw cards.
      setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
      await holdForMs(IMPACT_HOLD_MS);
    }

    if (skipRef.current) { finishInstant(next); return; }

    // ── 4. RETIRE ──
    setVisual(v => ({
      ...v,
      castPhase: 'retire',
      castOverlay: plan,
      mechanical: null,
      targetCardIds: [],
    }));
    await holdForMs(CAST_RETIRE_MS);

    // Effect result must stay visible; only round-end draws remain hidden.
    setDisplayGame(displayWithEffectResult(next, roundEndDrawIds));
    setVisual(v => ({
      ...v,
      castPhase: null,
      castOverlay: null,
      mechanical: null,
      targetCardIds: [],
      targetSlots: [],
      targetEffectId: null,
      hiddenCardIds: roundEndDrawIds,
      inFlightCardIds: [],
    }));
    setGame(next);
    gameRef.current = next;
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
    const prev = gameRef.current;
    if (prev === next) return Promise.resolve();

    const plans = detectAnimations(prev, next);

    queueRef.current = queueRef.current.then(async () => {
      if (plans.length === 0) {
        setGame(next);
        setDisplayGame(next);
        gameRef.current = next;
        return;
      }

      const hasEffectPlan = plans.some(p => p.kind === 'effect');
      const hasRoundEndDraws = plans.some(p => p.kind === 'draw');
      const hasStandaloneDraw = hasRoundEndDraws && !hasEffectPlan;

      if (hasStandaloneDraw && !skipRef.current) {
        setSequencer({ drawBeat: true, activeResolver: null });
        await holdForMs(DRAW_BEAT_MS);
        setSequencer({ drawBeat: false });
      }

      setVisual(v => ({ ...v, isAnimating: true }));

      // Only round-end draw cards stay hidden until their deck-travel animation.
      // Effect replacement cards are revealed by the effect plan itself.
      const roundEndDrawIds = getRoundEndDrawIds(plans);

      let stepState = prev;
      for (let i = 0; i < plans.length; i++) {
        if (skipRef.current) break;

        // Brief beat before round-end draws when an effect just resolved
        if (
          !skipRef.current
          && i > 0
          && plans[i]?.kind === 'draw'
          && plans[i - 1]?.kind === 'effect'
        ) {
          setSequencer({ drawBeat: true, activeResolver: null });
          await holdForMs(DRAW_BEAT_MS);
          setSequencer({ drawBeat: false });
        }

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
      setVisual(v => ({ ...IDLE_VISUAL, sequencer: v.sequencer }));
    });

    return queueRef.current;
  }, []);

  // ── Full resolution cinematic ──
  const runResolutionCinematic = useCallback(async (
    startState: GameState,
    resolveStep: (s: GameState) => GameState,
    onProgress?: (state: GameState) => void,
  ): Promise<GameState> => {
    skipRef.current = false;
    let current = startState;
    const order = getResolutionOrder(startState);
    const first = order[0]!;

    setVisual(v => ({
      ...v,
      isAnimating: true,
      sequencer: {
        ...IDLE_SEQUENCER,
        roundBanner: `Round ${startState.currentRound} — ${playerLabel(first)} hamleleri önce çözülüyor`,
      },
    }));
    await holdForMs(ROUND_BANNER_MS);
    setSequencer({ roundBanner: null });

    const queue = startState.resolutionQueue;
    let queueIdx = 0;
    let sideIdx = 0;

    for (const pid of order) {
      if (skipRef.current) break;

      const count = startState.roundCommits[pid].actions.length;
      if (count === 0) {
        setSequencer({ sidePass: pid, activeResolver: pid });
        await holdForMs(SIDE_PASS_MS);
        setSequencer({ sidePass: null, activeResolver: null });
        sideIdx++;
        continue;
      }

      if (sideIdx > 0) {
        setSequencer({ sideTransition: pid, activeResolver: pid });
        await holdForMs(SIDE_TRANSITION_MS);
        setSequencer({ sideTransition: null });
      } else {
        setSequencer({ activeResolver: pid });
      }

      while (queueIdx < queue.length && queue[queueIdx]!.playerId === pid) {
        if (skipRef.current) break;
        current = resolveStep(current);
        await applyUpdate(current);
        onProgress?.(current);
        queueIdx++;
        if (current.phase !== 'resolving') break;
      }
      sideIdx++;
      if (current.phase !== 'resolving') break;
    }

    if (skipRef.current && current.phase === 'resolving') {
      resolveAllOverlays();
      while (current.phase === 'resolving') {
        current = resolveStep(current);
      }
      setGame(current);
      setDisplayGame(current);
      gameRef.current = current;
    }

    setVisual(IDLE_VISUAL);
    setSequencer(null);
    skipRef.current = false;
    return current;
  }, [applyUpdate, resolveAllOverlays]);

  const resetGame = useCallback((fresh: GameState) => {
    queueRef.current = Promise.resolve();
    setGame(fresh);
    setDisplayGame(fresh);
    gameRef.current = fresh;
    setVisual(IDLE_VISUAL);
  }, []);

  return {
    game,
    displayGame,
    visual,
    applyUpdate,
    runResolutionCinematic,
    requestFastForward,
    resetGame,
    runIntroReveal,
    completeDeckTravel,
    completeCardToDeck,
    completeCardSwap,
    completeSlotMachine,
    completeEffectShred,
    isAnimating: visual.isAnimating,
  };
}
