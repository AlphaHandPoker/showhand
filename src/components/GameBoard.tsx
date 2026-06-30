import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CommittedAction, EffectType, GameState, SlotIndex, GameMode,
  ResolutionItem, PlayerId, PlayingCard, Suit, Rank,
} from '../game/types';
import { HAND_SIZE, TOTAL_ROUNDS, EFFECT_NAMES } from '../game/types';
import { maxCardsForState } from '../game/gameModes';
import {
  createGame, lockPlayerCommit, lockBothPlayerCommits, resolveNextInQueue,
  getValidOwnSlots, getValidOpponentSlots, getValidCleanseTargets,
  canCommitEffectType, cloneStateForBotEvaluation,
} from '../game/gameEngine';
import { buildBotCommit } from '../game/bot';
import { getDisguisedBotSubmitDelayMs, sleep } from '../ui/botSubmitTiming';
import { getHandHighlights } from '../game/poker';
import { sortHandBySlot, canTargetCard, formatDeckOutcomeHint } from '../game/effects';
import {
  PlayingCardSlot, EffectCardView, OpponentEffectStack, PokerCardEmptySlot,
} from './Cards';
import { HandRankBadge } from './HandRankBadge';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { RoundOrderIndicator } from './RoundOrderIndicator';
import { EffectCastOverlay } from './EffectCastOverlay';
import { DeckShuffleIntro } from './DeckShuffleIntro';
import { CardFromDeckFlight } from './CardFromDeckFlight';
import { CardToDeckFlight } from './CardToDeckFlight';
import { CardSwapFlight } from './CardSwapFlight';
import { CommitRevealLanes } from './CommitRevealLanes';
import { CommitToLaneFlight } from './CommitToLaneFlight';
import { EffectFizzleToast } from './EffectFizzleToast';
import { CenterHeldEffect } from './CenterHeldEffect';
// EffectTokenStack removed — tokens now render inside PlayingCardSlot
import { EffectToSlotFlight } from './EffectToSlotFlight';
import { EffectHandToCenterFlight } from './EffectHandToCenterFlight';
import { InPlaceCardSpin } from './InPlaceCardSpin';
import { SlotMachineReveal } from './SlotMachineReveal';
import { EffectShredOverlay } from './EffectShredOverlay';
import { SpyRevealOverlay } from './SpyRevealOverlay';
import { ForceDeleteOverlay } from './ForceDeleteOverlay';
import { VsIntroScreen } from './VsIntroScreen';
import { BattlefieldArena } from './BattlefieldArena';
import { MatchEndCinematic, getMatchEndZoneClass } from './MatchEndCinematic';
import { useAnimatedGame } from '../hooks/useAnimatedGame';
import { gameStateSyncSig } from '../hooks/useOnlineGame';
import { AnalyticsEvents } from '../analytics';
import { reportMatchToServer } from '../analytics/reportMatch';
import { useMobileGameLayout } from '../hooks/useMobileGameLayout';
import { getCardAnimationClass } from '../ui/detectAnimations';
import './GameBoard.css';
import './DeckShuffleIntro.css';
import './CardFromDeckFlight.css';
import './CardToDeckFlight.css';
import './CardSwapFlight.css';
import './CommitRevealLanes.css';
import './CommitToLaneFlight.css';
import './EffectFizzleToast.css';
import './LeftSidebar.css';
import './RightSidebar.css';
import './HandRankLadder.css';
import './GameLogPanel.css';
import './EffectHandToCenterFlight.css';
import './InPlaceCardSpin.css';
import './SlotMachineReveal.css';
import './EffectShredOverlay.css';
import './SpyRevealOverlay.css';
import './ForceDeleteOverlay.css';
import './VsIntroScreen.css';
import './BattlefieldArena.css';
import './PlayerAvatar.css';
import './MatchEndCinematic.css';
import './EffectToSlotFlight.css';
import { HowToPlayFab, HowToPlayGuide } from './HowToPlayGuide';
import { RoundTimer } from './RoundTimer';
import { LeaveMatchButton } from './LeaveMatchButton';
import './RoundTimer.css';
import './LeaveMatchButton.css';
import './HowToPlayGuide.css';
import { Menu, X } from 'lucide-react';

interface GameBoardProps {
  playerDeck: EffectType[];
  botDeck: EffectType[];
  gameMode?: GameMode;
  disguisedOpponent?: boolean;
  onRestart: () => void;
  online?: {
    youLocked: boolean;
    opponentLocked: boolean;
    onLockCommit: (actions: CommittedAction[]) => void;
    onForfeit?: () => void;
    onRequestSync?: () => void;
    syncedGame: GameState;
    opponentLabel?: string;
    matchKind?: 'matchmaking' | 'friend';
  };
}

type PendingPick =
  | { effectId: string; effectType: EffectType; step: 'opponent_slot'; partial: CommittedAction }
  | { effectId: string; effectType: EffectType; step: 'own_slot'; partial: CommittedAction }
  | { effectId: string; effectType: EffectType; step: 'opponent_effect' }
  | { effectId: string; effectType: EffectType; step: 'cleanse_slot' };

function pokerHandsMatch(a: GameState, b: GameState): boolean {
  for (const pid of ['player', 'bot'] as const) {
    const handA = a.players[pid].pokerHand;
    const handB = b.players[pid].pokerHand;
    if (handA.length !== handB.length) return false;
    for (let i = 0; i < handA.length; i++) {
      const ca = handA[i]!;
      const cb = handB[i]!;
      if (
        ca.id !== cb.id
        || ca.suit !== cb.suit
        || ca.rank !== cb.rank
        || ca.slotIndex !== cb.slotIndex
      ) {
        return false;
      }
    }
  }
  return true;
}

function serverStateMatchesLocal(local: GameState, server: GameState): boolean {
  return local.phase === server.phase
    && local.currentRound === server.currentRound
    && local.resolutionIndex === server.resolutionIndex
    && local.log.length === server.log.length
    && local.winner === server.winner
    && local.deck.length === server.deck.length
    && pokerHandsMatch(local, server);
}

const SUIT_FROM_NAME: Record<string, Suit> = {
  Spades: 'spades',
  Hearts: 'hearts',
  Diamonds: 'diamonds',
  Clubs: 'clubs',
};

function parsePlayingCardName(name: string): Pick<PlayingCard, 'suit' | 'rank'> | null {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return null;
  const rankStr = parts[parts.length - 1]!;
  const suitStr = parts.slice(0, -1).join(' ');
  const suit = SUIT_FROM_NAME[suitStr];
  if (!suit) return null;

  let rank: Rank;
  if (rankStr === 'Ace') rank = 14;
  else if (rankStr === 'King') rank = 13;
  else if (rankStr === 'Queen') rank = 12;
  else if (rankStr === 'Jack') rank = 11;
  else {
    const n = parseInt(rankStr, 10);
    if (Number.isNaN(n) || n < 2 || n > 10) return null;
    rank = n as Rank;
  }
  return { suit, rank };
}

function findCardBySuitRank(state: GameState, suit: Suit, rank: Rank): PlayingCard | null {
  for (const pid of ['player', 'bot'] as const) {
    const found = state.players[pid].pokerHand.find(c => c.suit === suit && c.rank === rank);
    if (found) return found;
  }
  return state.deck.find(c => c.suit === suit && c.rank === rank) ?? null;
}

function getEffectLogForQueueIndex(
  finalState: GameState,
  queue: ResolutionItem[],
  queueIndex: number,
): string | null {
  const effectLogs = finalState.log.filter(e => e.kind === 'effect');
  let logCursor = 0;

  for (let i = 0; i < queue.length; i++) {
    const expected = EFFECT_NAMES[queue[i]!.action.effectType];
    while (logCursor < effectLogs.length) {
      const log = effectLogs[logCursor++]!;
      if (log.detail?.startsWith('fizzled')) continue;
      if (log.effectName === expected || log.message.includes(expected)) {
        if (i === queueIndex) return log.message;
        break;
      }
    }
  }
  return null;
}

/** Card removed by a later send_back / last_draw on the same slot — i.e. this step's draw. */
function cardSentToDeckFromLog(message: string, effectType: EffectType): Pick<PlayingCard, 'suit' | 'rank'> | null {
  const detail = message.includes(': ')
    ? message.split(': ').slice(1).join(': ').trim()
    : message.trim();
  if (effectType === 'last_draw') {
    const m = detail.match(/^(.+?) sent to deck/);
    return m ? parsePlayingCardName(m[1]!.trim()) : null;
  }
  if (effectType === 'send_back') {
    const m = detail.match(/^(.+?) sent to deck, new card drawn$/);
    return m ? parsePlayingCardName(m[1]!.trim()) : null;
  }
  return null;
}

function findLaterDeckEffectOnSlot(
  queue: ResolutionItem[],
  afterIndex: number,
  playerId: PlayerId,
  slot: SlotIndex,
): { item: ResolutionItem; index: number } | null {
  for (let i = afterIndex + 1; i < queue.length; i++) {
    const item = queue[i]!;
    if (!actionTouchesPlayerSlot(item, playerId, slot)) continue;
    if (item.action.effectType === 'last_draw' || item.action.effectType === 'send_back') {
      return { item, index: i };
    }
  }
  return null;
}

/**
 * When a later deck effect hits the same slot, the final hand still shows the
 * last draw — not this step's intermediate card. Parse the later effect's log
 * to recover what was on the slot after this step's draw.
 */
function getIntermediateDrawnCard(
  finalState: GameState,
  queue: ResolutionItem[],
  stepIndex: number,
  playerId: PlayerId,
  slot: SlotIndex,
): PlayingCard | null {
  const later = findLaterDeckEffectOnSlot(queue, stepIndex, playerId, slot);
  if (!later) return null;

  const logMessage = getEffectLogForQueueIndex(finalState, queue, later.index);
  if (!logMessage) return null;

  const parsed = cardSentToDeckFromLog(logMessage, later.item.action.effectType);
  if (!parsed) return null;

  return findCardBySuitRank(finalState, parsed.suit, parsed.rank);
}

/**
 * For each card drawn during an effect step (i.e. a card present in
 * stepState but not in prevState), replace it with the server's actual card.
 * When a later effect will change the same slot, use the intermediate card
 * (from the later effect's log) instead of the final card at that slot.
 */
function patchDrawnCards(
  prevState: GameState,
  stepState: GameState,
  finalState: GameState,
  stepIndex: number,
): GameState {
  const queue = prevState.resolutionQueue;
  let patchedDeck = stepState.deck;
  let deckChanged = false;
  const patchedPlayers = { player: stepState.players.player, bot: stepState.players.bot };
  let playersChanged = false;

  for (const pid of ['player', 'bot'] as const) {
    const prevIds = new Set(prevState.players[pid].pokerHand.map(c => c.id));
    let handChanged = false;
    const newHand = stepState.players[pid].pokerHand.map(card => {
      if (prevIds.has(card.id)) return card; // not drawn this step

      const slot = card.slotIndex as SlotIndex;
      let serverCard: PlayingCard | undefined;

      if (slotTouchedLater(queue, stepIndex, pid, slot)) {
        serverCard = getIntermediateDrawnCard(finalState, queue, stepIndex, pid, slot) ?? undefined;
      } else {
        serverCard = finalState.players[pid].pokerHand.find(c => c.slotIndex === slot);
      }

      if (!serverCard || serverCard.id === card.id) return card;

      if (!deckChanged) patchedDeck = [...stepState.deck];
      patchedDeck = patchedDeck.filter(c => c.id !== serverCard.id);
      patchedDeck.push({
        suit: card.suit, rank: card.rank, id: card.id,
        slotIndex: 0, protectedUntilTurn: 0, frozenUntilTurn: 0,
      });
      deckChanged = true;
      handChanged = true;
      return { ...serverCard, slotIndex: slot };
    });
    if (handChanged) {
      patchedPlayers[pid] = { ...stepState.players[pid], pokerHand: newHand };
      playersChanged = true;
    }
  }

  if (!playersChanged && !deckChanged) return stepState;
  return {
    ...stepState,
    players: playersChanged
      ? { player: patchedPlayers.player, bot: patchedPlayers.bot }
      : stepState.players,
    deck: patchedDeck,
  };
}

function actionTouchesPlayerSlot(
  item: ResolutionItem,
  playerId: PlayerId,
  slot: SlotIndex,
): boolean {
  const { playerId: actorId, action: a } = item;
  const opponentId: PlayerId = actorId === 'player' ? 'bot' : 'player';

  if (a.effectType === 'steal_card') {
    if (actorId === playerId && a.ownSlot === slot) return true;
    if (opponentId === playerId && a.opponentSlot === slot) return true;
  }
  if (a.effectType === 'send_back' && opponentId === playerId && a.opponentSlot === slot) {
    return true;
  }
  if (
    (a.effectType === 'protect' || a.effectType === 'transform'
      || a.effectType === 'shift_chance' || a.effectType === 'last_draw')
    && actorId === playerId
    && a.ownSlot === slot
  ) {
    return true;
  }
  if (a.effectType === 'freeze' && opponentId === playerId && a.opponentSlot === slot) {
    return true;
  }
  if (a.effectType === 'cleanse' && a.cleanseOwnerId === playerId && a.cleanseSlot === slot) {
    return true;
  }
  return false;
}

function slotTouchedLater(
  queue: ResolutionItem[],
  afterIndex: number,
  playerId: PlayerId,
  slot: SlotIndex,
): boolean {
  for (let i = afterIndex + 1; i < queue.length; i++) {
    if (actionTouchesPlayerSlot(queue[i]!, playerId, slot)) return true;
  }
  return false;
}

/** Patch one resolution step so random outcomes match the server's final state. */
function patchStepOutcome(
  prevState: GameState,
  stepState: GameState,
  finalState: GameState,
  stepIndex: number,
): GameState {
  let patched = patchDrawnCards(prevState, stepState, finalState, stepIndex);
  const item = prevState.resolutionQueue[stepIndex];
  if (!item) return patched;

  const { playerId, action } = item;

  // Transform / shift change suit or rank in-place (same card id).
  // patchDrawnCards only handles newly drawn ids, so fix those here.
  if (
    (action.effectType === 'transform' || action.effectType === 'shift_chance')
    && action.ownSlot !== undefined
    && !slotTouchedLater(prevState.resolutionQueue, stepIndex, playerId, action.ownSlot)
  ) {
    const serverCard = finalState.players[playerId].pokerHand.find(
      c => c.slotIndex === action.ownSlot,
    );
    if (serverCard) {
      patched = {
        ...patched,
        players: {
          ...patched.players,
          [playerId]: {
            ...patched.players[playerId],
            pokerHand: patched.players[playerId].pokerHand.map(c =>
              c.slotIndex === action.ownSlot ? { ...serverCard, slotIndex: action.ownSlot } : c,
            ),
          },
        },
      };
    }
  }

  return patched;
}

/**
 * Returns a resolveStep function that steps through the resolution queue
 * but patches random outcomes (deck draws, transform, shift) to match the
 * server's authoritative final state.
 */
function makeResolveStep(
  finalState: GameState,
): (state: GameState) => GameState {
  return (state: GameState) => {
    const stepIndex = state.resolutionIndex;
    const stepped = resolveNextInQueue(state);
    return patchStepOutcome(state, stepped, finalState, stepIndex);
  };
}

export function GameBoard({
  playerDeck,
  botDeck,
  gameMode = 'draft',
  disguisedOpponent = false,
  onRestart,
  online,
}: GameBoardProps) {
  const initialGame = useMemo(
    () => (online ? online.syncedGame : createGame(playerDeck, botDeck, gameMode)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online?.syncedGame, playerDeck, botDeck, gameMode],
  );

  const {
    game,
    displayGame,
    visual,
    slotTokens,
    applyUpdate,
    snapToState,
    runCommitRevealPhase,
    runResolutionCinematic,
    runIntroReveal,
    getGameState,
    completeDeckTravel,
    completeCardToDeck,
    completeCardSwap,
    completeHandToCenter,
    departLaneCard,
    clearCenterHeld,
    completeCommitToLane,
    hideEffectInHand,
    completeInPlaceSpin,
    completeSlotMachine,
    completeEffectShred,
    completeSpyReveal,
    completeForceDelete,
    completeEffectToSlot,
    isAnimating,
  } = useAnimatedGame(initialGame);

  const revealedSpyEffectIds = useMemo(
    () => new Set(displayGame.spyRevealedEffectIds),
    [displayGame.spyRevealedEffectIds],
  );

  const [commitQueue, setCommitQueue] = useState<CommittedAction[]>([]);
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [deckHintSlot, setDeckHintSlot] = useState<SlotIndex | null>(null);
  const [resolving, setResolving] = useState(false);
  const [vsIntroDone, setVsIntroDone] = useState(false);
  const [shuffleDone, setShuffleDone] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [matchEndPhase, setMatchEndPhase] = useState<'idle' | 'highlight' | 'done'>('idle');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [disguisedWaiting, setDisguisedWaiting] = useState(false);
  const [leavingMatch, setLeavingMatch] = useState(false);
  const isMobileLayout = useMobileGameLayout();
  const resolvingRef = useRef(false);
  const botDelayAbortRef = useRef(false);
  const opponentLabel = online?.opponentLabel ?? (disguisedOpponent ? 'Opponent' : 'Bot');

  const isCommitting = game.phase === 'committing';
  const isFinished = game.phase === 'finished';
  const finishedTrackedRef = useRef(false);
  const matchStartedAtRef = useRef(Date.now());
  const gameStartedTrackedRef = useRef(false);

  useEffect(() => {
    if (gameStartedTrackedRef.current) return;
    gameStartedTrackedRef.current = true;
    matchStartedAtRef.current = Date.now();
    AnalyticsEvents.gameStarted(
      online?.matchKind === 'friend' ? 'friend' : online ? 'online' : 'bot',
      disguisedOpponent,
    );
  }, [online, disguisedOpponent]);

  useEffect(() => {
    if (!isFinished || !game.winner || finishedTrackedRef.current) return;
    finishedTrackedRef.current = true;
    AnalyticsEvents.gameFinished(
      online?.matchKind === 'friend' ? 'friend' : online ? 'online' : 'bot',
      game.winner,
      game.currentRound,
    );
    reportMatchToServer(game, {
      online: Boolean(online),
      disguisedOpponent,
      friendMatch: online?.matchKind === 'friend',
      matchStartedAt: matchStartedAtRef.current,
    });
  }, [isFinished, game.winner, game.currentRound, online, disguisedOpponent, game]);

  useEffect(() => {
    if (!isFinished) {
      finishedTrackedRef.current = false;
      setMatchEndPhase('idle');
      return;
    }
    const t = window.setTimeout(() => setMatchEndPhase('highlight'), 1800);
    return () => window.clearTimeout(t);
  }, [isFinished]);

  useEffect(() => {
    document.documentElement.classList.add('game-board-active');
    document.body.classList.add('game-board-active');
    return () => {
      document.documentElement.classList.remove('game-board-active');
      document.body.classList.remove('game-board-active');
    };
  }, []);

  const youLocked = online?.youLocked ?? disguisedWaiting;
  const opponentLocked = online?.opponentLocked ?? false;
  const serverPhase = online?.syncedGame.phase;
  const canInteract = introReady && isCommitting && !isFinished && !isAnimating && !resolving
    && !youLocked && !leavingMatch;
  const canCancelPick = isCommitting && !isFinished && pendingPick !== null;
  const canPickOpponentEffects = isCommitting && !isFinished && !resolving
    && pendingPick?.step === 'opponent_effect'
    && !youLocked;
  const canCompletePick = isCommitting && !isFinished && !resolving && !youLocked;
  const boardInputBlocked = resolving || !introReady || (isAnimating && !isCommitting);
  const timerActive = introReady && isCommitting && !isFinished && !resolving && !isAnimating
    && !youLocked && !leavingMatch;

  useEffect(() => {
    if (!isCommitting) {
      setDisguisedWaiting(false);
    }
  }, [isCommitting]);

  useEffect(() => {
    if (!online?.onRequestSync) return;
    if (!youLocked || opponentLocked || !isCommitting || serverPhase !== 'committing') return;

    const timer = window.setInterval(() => {
      online.onRequestSync?.();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [online?.onRequestSync, youLocked, opponentLocked, isCommitting, serverPhase]);

  const syncQueueRef = useRef(Promise.resolve());
  const processedSyncSigRef = useRef('');
  // Holds the server's resolving snapshot while we wait for the matching
  // committing snapshot. The two states are needed together so that the
  // deck-draw animation uses the server's actual card identities.
  const pendingResolvingRef = useRef<GameState | null>(null);
  const syncedGame = online?.syncedGame;

  useEffect(() => {
    if (!syncedGame) return;

    const sig = gameStateSyncSig(syncedGame);
    if (sig === processedSyncSigRef.current) return;
    processedSyncSigRef.current = sig;

    const g = syncedGame;

    // ── ONLINE: resolving snapshot ──
    // Start the lane-reveal animation immediately so there's no visible delay.
    // Store the state and wait for the committing snapshot to run effects.
    if (online && g.phase === 'resolving' && g.resolutionQueue.length > 0) {
      pendingResolvingRef.current = g;
      setResolving(true);
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        await runCommitRevealPhase(g);
      });
      return;
    }

    // ── ONLINE: committing / finished snapshot (paired with pending resolving) ──
    // Round 5 ends with phase 'finished' instead of 'committing'. Both need the
    // full effect cinematic with the server as ground truth.
    if (
      online
      && (g.phase === 'committing' || g.phase === 'finished')
      && pendingResolvingRef.current
    ) {
      const resolvingG = pendingResolvingRef.current;
      pendingResolvingRef.current = null;
      syncQueueRef.current = syncQueueRef.current.then(async () => {
        try {
          await runResolutionCinematic(
            resolvingG,
            makeResolveStep(g),
            undefined,
            g,
            true,
          );
        } finally {
          setResolving(false);
          setCommitQueue([]);
          setPendingPick(null);
        }
      });
      return;
    }

    syncQueueRef.current = syncQueueRef.current.then(async () => {
      const local = getGameState();

      // ── Reconnect / missed resolving phase ──
      if (
        (g.phase === 'committing' || g.phase === 'finished')
        && local.phase !== g.phase
      ) {
        // Clear any stale pending resolving state.
        pendingResolvingRef.current = null;
        await applyUpdate(g);
        setResolving(false);
        setCommitQueue([]);
        setPendingPick(null);
        return;
      }

      // ── Silent ground-truth correction (same round, same phase, different cards) ──
      if (
        g.phase === 'committing'
        && local.phase === 'committing'
        && !serverStateMatchesLocal(local, g)
      ) {
        await snapToState(g);
        return;
      }

      // ── Stale resolving state (safety) ──
      if (g.phase === 'resolving' && local.phase === 'resolving') return;

      // ── Initial game state or general transition ──
      if (!serverStateMatchesLocal(local, g)) {
        await applyUpdate(g);
        if (g.phase !== 'resolving') {
          setResolving(false);
          if (g.phase === 'committing') {
            setCommitQueue([]);
            setPendingPick(null);
          }
        }
      }
    });
  }, [syncedGame, online, applyUpdate, getGameState, runResolutionCinematic,
    snapToState, runCommitRevealPhase]);

  useEffect(() => {
    if (!isCommitting || resolving) {
      setPendingPick(null);
    }
  }, [isCommitting, resolving]);

  const isDeckOutcomePick = pendingPick?.step === 'own_slot'
    && (pendingPick.effectType === 'transform' || pendingPick.effectType === 'shift_chance');

  useEffect(() => {
    if (!isDeckOutcomePick || !pendingPick) {
      setDeckHintSlot(null);
      return;
    }

    const valid = getValidOwnSlots(game, 'player', pendingPick.effectType);
    setDeckHintSlot(valid.length === 1 ? valid[0]! : null);
  }, [isDeckOutcomePick, pendingPick, game]);

  const deckOutcomeHint = useMemo(() => {
    if (!isDeckOutcomePick || !pendingPick || deckHintSlot === null) return null;
    if (pendingPick.effectType !== 'transform' && pendingPick.effectType !== 'shift_chance') {
      return null;
    }
    const card = game.players.player.pokerHand.find(c => c.slotIndex === deckHintSlot);
    if (!card) return null;
    return formatDeckOutcomeHint(game.deck, pendingPick.effectType, card);
  }, [isDeckOutcomePick, pendingPick, deckHintSlot, game]);

  const maxCardsPerRound = maxCardsForState(game);
  const slotsLeft = maxCardsPerRound - commitQueue.length;
  const usedEffectIds = new Set(commitQueue.map(a => a.effectId));

  const runResolution = useCallback(async (startState: GameState) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    try {
      await runResolutionCinematic(startState, resolveNextInQueue);
    } finally {
      resolvingRef.current = false;
      setResolving(false);
      setCommitQueue([]);
      setPendingPick(null);
    }
  }, [runResolutionCinematic]);

  const handleLockCommit = useCallback(async (forcedActions?: CommittedAction[]) => {
    const actions = forcedActions ?? commitQueue;
    const isForcedPass = forcedActions !== undefined;

    if (!isForcedPass && (!canInteract || pendingPick)) return;
    if (isForcedPass && (!introReady || !isCommitting || isFinished || resolving || youLocked || leavingMatch)) {
      return;
    }

    if (online) {
      online.onLockCommit([...actions]);
      setCommitQueue([]);
      setPendingPick(null);
      return;
    }

    if (disguisedOpponent) {
      setDisguisedWaiting(true);
      setCommitQueue([]);
      setPendingPick(null);
      botDelayAbortRef.current = false;

      let botActions: CommittedAction[];
      try {
        const evalState = cloneStateForBotEvaluation(game, actions);
        botActions = buildBotCommit(evalState);
      } catch (err) {
        console.error('[bot] disguised commit failed', err);
        setDisguisedWaiting(false);
        return;
      }

      await sleep(getDisguisedBotSubmitDelayMs(game.currentRound));
      if (botDelayAbortRef.current) return;

      let next: GameState;
      try {
        next = lockBothPlayerCommits(game, actions, botActions);
      } catch (err) {
        console.error('[bot] lockBothPlayerCommits failed', err);
        setDisguisedWaiting(false);
        return;
      }

      setDisguisedWaiting(false);
      if (next.phase === 'resolving' && next.resolutionQueue.length > 0) {
        await runResolution(next);
      } else {
        await applyUpdate(next);
      }
      return;
    }

    let next: GameState;
    try {
      next = lockPlayerCommit(game, actions);
    } catch (err) {
      console.error('[bot] lockPlayerCommit failed', err);
      return;
    }
    if (next === game) return;
    if (next.phase === 'resolving' && next.resolutionQueue.length > 0) {
      await runResolution(next);
    } else {
      await applyUpdate(next);
    }
  }, [
    applyUpdate,
    canInteract,
    commitQueue,
    disguisedOpponent,
    game,
    introReady,
    isCommitting,
    isFinished,
    leavingMatch,
    online,
    pendingPick,
    resolving,
    runResolution,
    youLocked,
  ]);

  const handleTimerExpire = useCallback(() => {
    setPendingPick(null);
    setCommitQueue([]);
    void handleLockCommit([]);
  }, [handleLockCommit]);

  const handleConfirmLeave = useCallback(() => {
    setLeavingMatch(true);
    botDelayAbortRef.current = true;
    setDisguisedWaiting(false);

    if (online?.onForfeit) {
      AnalyticsEvents.matchForfeited('online');
      online.onForfeit();
      onRestart();
      return;
    }

    AnalyticsEvents.matchForfeited('bot');
    onRestart();
  }, [online, onRestart]);

  const finishPending = (action: CommittedAction) => {
    setCommitQueue(q => [...q, action]);
    setPendingPick(null);
  };

  const handleOpponentEffectPick = (opponentEffectId: string) => {
    if (!canPickOpponentEffects || !pendingPick || pendingPick.step !== 'opponent_effect') return;
    if (!game.players.bot.effectHand.some(e => e.id === opponentEffectId)) return;
    finishPending({
      effectId: pendingPick.effectId,
      effectType: pendingPick.effectType,
      opponentEffectId,
    });
  };

  const handleEffectClick = (effectId: string) => {
    if (!canInteract) return;

    if (pendingPick || slotsLeft <= 0) return;
    if (usedEffectIds.has(effectId)) return;

    const effect = game.players.player.effectHand.find(e => e.id === effectId);
    if (!effect) return;
    if (!canCommitEffectType(game, 'player', effect.type)) return;

    switch (effect.type) {
      case 'steal_card':
        setPendingPick({ effectId, effectType: effect.type, step: 'opponent_slot', partial: { effectId, effectType: effect.type } });
        break;
      case 'send_back':
      case 'freeze':
        setPendingPick({ effectId, effectType: effect.type, step: 'opponent_slot', partial: { effectId, effectType: effect.type } });
        break;
      case 'protect':
      case 'transform':
      case 'shift_chance':
      case 'last_draw':
        setPendingPick({ effectId, effectType: effect.type, step: 'own_slot', partial: { effectId, effectType: effect.type } });
        break;
      case 'spy':
      case 'force_delete':
        setPendingPick({ effectId, effectType: effect.type, step: 'opponent_effect' });
        break;
      case 'cleanse':
        setPendingPick({ effectId, effectType: effect.type, step: 'cleanse_slot' });
        break;
    }
  };

  const handleSlotClick = (ownerId: 'player' | 'bot', slotIndex: SlotIndex) => {
    if (!canCompletePick || !pendingPick) return;

    if (pendingPick.step === 'opponent_slot') {
      const valid = getValidOpponentSlots(game, 'player', pendingPick.effectType);
      if (!valid.includes(slotIndex) || ownerId !== 'bot') return;

      if (pendingPick.effectType === 'steal_card') {
        setPendingPick({
          ...pendingPick,
          step: 'own_slot',
          partial: { ...pendingPick.partial, opponentSlot: slotIndex },
        });
        return;
      }

      finishPending({ ...pendingPick.partial, opponentSlot: slotIndex });
      return;
    }

    if (pendingPick.step === 'own_slot') {
      const valid = getValidOwnSlots(game, 'player', pendingPick.effectType);
      if (!valid.includes(slotIndex) || ownerId !== 'player') return;

      if (pendingPick.effectType === 'steal_card') {
        finishPending({ ...pendingPick.partial, ownSlot: slotIndex });
        return;
      }

      finishPending({ ...pendingPick.partial, ownSlot: slotIndex });
      return;
    }

    if (pendingPick.step === 'cleanse_slot') {
      const targets = getValidCleanseTargets(game);
      const match = targets.find(t => t.ownerId === ownerId && t.slot === slotIndex);
      if (!match) return;
      finishPending({
        effectId: pendingPick.effectId,
        effectType: pendingPick.effectType,
        cleanseOwnerId: match.ownerId,
        cleanseSlot: match.slot,
      });
    }
  };


  const handleCancelPick = () => {
    setPendingPick(null);
    setDeckHintSlot(null);
  };

  const validOwnSlots = pendingPick
    ? new Set(getValidOwnSlots(game, 'player', pendingPick.effectType))
    : new Set<number>();
  const validOppSlots = pendingPick
    ? new Set(getValidOpponentSlots(game, 'player', pendingPick.effectType))
    : new Set<number>();
  const validCleanse = pendingPick?.step === 'cleanse_slot'
    ? getValidCleanseTargets(game)
    : [];

  const playerHand = displayGame.players.player.pokerHand;
  const botHand = displayGame.players.bot.pokerHand;
  const handsComplete = playerHand.length === HAND_SIZE && botHand.length === HAND_SIZE;
  const playerHighlights = handsComplete ? getHandHighlights(playerHand) : new Map();
  const botHighlights = handsComplete ? getHandHighlights(botHand) : new Map();

  const hiddenBoardCardIds = useMemo(
    () => new Set([...visual.inFlightCardIds, ...visual.hiddenCardIds]),
    [visual.inFlightCardIds, visual.hiddenCardIds],
  );

  const activeLaneOwner = visual.commitLanes.find(l => l.active)?.ownerId ?? null;

  const hiddenEffectIds = useMemo(
    () => new Set(visual.hiddenEffectIds),
    [visual.hiddenEffectIds],
  );

  const overlayMaskEffectId =
    visual.spyReveal?.victimEffect.id
    ?? visual.forceDelete?.victimEffect.id
    ?? visual.effectShred?.effectId
    ?? null;

  const renderArenaRows = (ownerId: 'player' | 'bot') => (
    <div className="arena-rows">
      {renderPokerHand(ownerId)}
    </div>
  );

  const renderPokerHand = (ownerId: 'player' | 'bot') => {
    const hand = sortHandBySlot(displayGame.players[ownerId].pokerHand);
    const highlights = ownerId === 'player' ? playerHighlights : botHighlights;
    const slotAnchorPrefix = ownerId;

    return (
      <div className={`hand-row ${ownerId === 'player' ? 'hand-row--player' : 'hand-row--bot'} ${!shuffleDone ? 'hand-row--pre-reveal' : ''}`}>
        {Array.from({ length: HAND_SIZE }, (_, slotIndex) => {
          const card = hand.find(c => c.slotIndex === slotIndex);
          const slot = slotIndex as SlotIndex;
          const slotAnchor = `${slotAnchorPrefix}-${slotIndex}`;
          const tokenKey = `${ownerId}-${slotIndex}`;
          const tokens = slotTokens.get(tokenKey) ?? [];
          const isTargeted = visual.targetSlots.some(
            t => t.ownerId === ownerId && t.slotIndex === slotIndex,
          );

          if (!card || hiddenBoardCardIds.has(card.id)) {
            return (
              <PokerCardEmptySlot
                key={`empty-${ownerId}-${slotIndex}`}
                slotAnchor={slotAnchor}
                tokenSlotKey={tokenKey}
                targeted={isTargeted}
              />
            );
          }

          let selectable = false;
          if (canCompletePick && pendingPick) {
            if (pendingPick.step === 'opponent_slot' && ownerId === 'bot' && validOppSlots.has(slotIndex)) {
              selectable = true;
            }
            if (pendingPick.step === 'own_slot' && ownerId === 'player' && validOwnSlots.has(slotIndex)) {
              selectable = true;
            }
            if (pendingPick.step === 'cleanse_slot') {
              selectable = validCleanse.some(t => t.ownerId === ownerId && t.slot === slot);
            }
          }

          const animClass = getCardAnimationClass(
            card.id,
            visual.mechanical,
            visual.targetCardIds,
          );
          const isShiftAnim = animClass === 'anim-shift' && visual.cardBefore?.id === card.id;
          const blockedByStatus = Boolean(
            canCompletePick
            && pendingPick
            && card
            && (
              (pendingPick.step === 'own_slot' && ownerId === 'player' && !canTargetCard(card, game.currentRound))
              || (pendingPick.step === 'opponent_slot' && ownerId === 'bot' && !canTargetCard(card, game.currentRound))
            ),
          );

          const showDeckOutcomeHint = selectable
            && isDeckOutcomePick
            && ownerId === 'player'
            && pendingPick.step === 'own_slot';

          return (
            <PlayingCardSlot
              key={card.id}
              card={card}
              currentTurn={game.currentRound}
              selected={selectable}
              animClass={animClass}
              flipping={visual.mechanical === 'transform' && visual.targetCardIds.includes(card.id)}
              shiftDisplayRank={isShiftAnim ? visual.cardAfter?.rank : undefined}
              highlightGroup={highlights.get(card.id) ?? null}
              slotAnchor={slotAnchor}
              tokenSlotKey={tokenKey}
              tokens={tokens}
              targeted={isTargeted}
              untargetable={blockedByStatus}
              onClick={selectable ? () => handleSlotClick(ownerId, slot) : undefined}
              onPointerEnter={showDeckOutcomeHint ? () => setDeckHintSlot(slot) : undefined}
            />
          );
        })}
      </div>
    );
  };

  const effectDisabled = !canInteract
    || slotsLeft <= 0
    || !!pendingPick;

  const botOverlayMaskEffectId =
    overlayMaskEffectId && visual.spyReveal?.victimOwnerId === 'bot'
      ? overlayMaskEffectId
      : overlayMaskEffectId && visual.forceDelete?.victimOwnerId === 'bot'
        ? overlayMaskEffectId
        : overlayMaskEffectId && visual.effectShred?.ownerId === 'bot'
          ? overlayMaskEffectId
          : null;

  const renderPlayerEffectCards = () =>
    displayGame.players.player.effectHand.map(card => {
      if (hiddenEffectIds.has(card.id)) return null;
      const overlayHidden = visual.spyReveal?.victimEffect.id === card.id
        || visual.forceDelete?.victimEffect.id === card.id
        || visual.effectShred?.effectId === card.id;
      return (
        <div
          key={card.id}
          className={`effect-flight-anchor${overlayHidden ? ' effect-flight-anchor--overlay-active' : ''}`}
          data-effect-anchor={`player-${card.id}`}
        >
          <EffectCardView
            card={card}
            mobileRail={isMobileLayout}
            onClick={() => handleEffectClick(card.id)}
            disabled={effectDisabled || usedEffectIds.has(card.id) || !canCommitEffectType(game, 'player', card.type)}
            selected={usedEffectIds.has(card.id)}
            spyRevealed={revealedSpyEffectIds.has(card.id)}
            spyFlipping={visual.spyFlipEffectId === card.id}
          />
        </div>
      );
    });

  const handleIntroComplete = useCallback(async () => {
    setShuffleDone(true);
    await runIntroReveal(initialGame);
    setIntroReady(true);
  }, [initialGame, runIntroReveal]);

  const sidebarActions = (
    <>
      {isCommitting && !isFinished && (
        <span className="slots-left">{slotsLeft} left</span>
      )}

      {canCancelPick && (
        <button type="button" className="btn-cancel" onClick={handleCancelPick}>
          Cancel
        </button>
      )}

      {pendingPick?.step === 'opponent_effect' && canPickOpponentEffects && (
        <span className="pick-hint">Select an opponent effect card</span>
      )}

      {isDeckOutcomePick && (
        <span className="pick-hint pick-hint--deck">
          {deckOutcomeHint ?? 'Select one of your cards'}
        </span>
      )}

      {canInteract && (
        <button type="button" className="btn-lock" onClick={() => void handleLockCommit()}>
          {commitQueue.length === 0 ? 'Pass' : 'Lock In'}
        </button>
      )}

      {youLocked && !opponentLocked && isCommitting && serverPhase === 'committing' && (
        <span className="online-status-msg">Locked in — waiting for opponent…</span>
      )}
      {opponentLocked && !youLocked && isCommitting && serverPhase === 'committing' && (
        <span className="online-status-msg online-status-msg--urgent">Opponent locked in — your turn!</span>
      )}
      {serverPhase === 'resolving' && (isCommitting || resolving) && (
        <span className="online-status-msg">Resolving moves…</span>
      )}
    </>
  );

  const rightSidebar = (
    <RightSidebar
      opponentLabel={opponentLabel}
      isFinished={isFinished}
      winner={game.winner}
      game={displayGame}
      resolving={resolving}
      actions={sidebarActions}
    />
  );

  const battlefield = (
    <div className="battlefield">
      <BattlefieldArena />

      <CommitRevealLanes
        lanes={visual.commitLanes}
        overlayMaskEffectId={overlayMaskEffectId}
      />

      <div className="cast-center-anchor">
        <div className="cast-center-measure" data-cast-center-anchor="measure" aria-hidden />
        {visual.centerHeldEffect && (
          <CenterHeldEffect effect={visual.centerHeldEffect.effect} />
        )}
      </div>

      <div className="battlefield-stack">
        <div className="battlefield-half battlefield-half--bot">
          <section className={`zone zone--bot ${activeLaneOwner === 'bot' ? 'zone--resolving-active' : ''} ${getMatchEndZoneClass('bot', game.winner, matchEndPhase)}`}>
            {isMobileLayout && (
              <div className="mobile-zone-label mobile-zone-label--bot">Opponent</div>
            )}
            <div className="effect-band effect-band--bot">
              <div className="effect-band__cards">
                <OpponentEffectStack
                  effects={displayGame.players.bot.effectHand}
                  ownerId="bot"
                  mobileRail={isMobileLayout}
                  onCardClick={handleOpponentEffectPick}
                  selectable={canPickOpponentEffects}
                  revealedSpyIds={revealedSpyEffectIds}
                  spyFlipEffectId={visual.spyFlipEffectId}
                  targetEffectId={visual.targetEffectId}
                  hiddenEffectIds={hiddenEffectIds}
                  overlayMaskEffectId={botOverlayMaskEffectId}
                />
              </div>
            </div>

            <div className="battlefield-half-core">
              <div className="arena-hud arena-hud--compact">
                <HandRankBadge cards={botHand} />
              </div>
              {renderArenaRows('bot')}
            </div>
          </section>
        </div>

        <div className="battlefield-half battlefield-half--player">
          <section className={`zone zone--player ${activeLaneOwner === 'player' ? 'zone--resolving-active' : ''} ${getMatchEndZoneClass('player', game.winner, matchEndPhase)}`}>
            {isMobileLayout && (
              <div className="mobile-zone-label mobile-zone-label--player">You</div>
            )}
            <div className="battlefield-half-core">
              {renderArenaRows('player')}

              <div className="arena-hud arena-hud--compact">
                <HandRankBadge cards={playerHand} />
              </div>
            </div>

            <div className="effect-band effect-band--player">
              <div className="effect-band__cards">
                <div className={`effect-row${isMobileLayout ? ' effect-row--mobile-grid' : ''}`}>
                  {renderPlayerEffectCards()}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`game-board ${game.gameMode === 'full_deck' ? 'game-board--full-deck' : ''} ${boardInputBlocked ? 'is-animating' : ''} ${mobileInfoOpen ? 'game-board--info-open' : ''}${isMobileLayout ? ' game-board--mobile-layout' : ''}`}>
      <HowToPlayFab onClick={() => setShowHowToPlay(true)} />
      {showHowToPlay && <HowToPlayGuide onClose={() => setShowHowToPlay(false)} />}
      {!isFinished && (
        <LeaveMatchButton onConfirmLeave={handleConfirmLeave} disabled={leavingMatch} />
      )}

      <RoundTimer
        active={timerActive}
        round={game.currentRound}
        onExpire={handleTimerExpire}
      />

      {/* ═══ MOBILE TOP BAR (hidden on desktop via CSS) ═══ */}
      <div className="mobile-topbar">
        <div className="mobile-topbar__info">
          <span className="mobile-round-pill">
            <span className="mobile-round-pill__num">{Math.min(displayGame.currentRound, TOTAL_ROUNDS)}</span>
            <span className="mobile-round-pill__sep">/</span>
            <span className="mobile-round-pill__total">{TOTAL_ROUNDS}</span>
          </span>
          <div className="mobile-topbar__order">
            <RoundOrderIndicator
              game={displayGame}
              resolving={resolving}
              opponentLabel={opponentLabel}
              variant="rail"
            />
          </div>
        </div>
        <button
          type="button"
          className="mobile-info-btn"
          onClick={() => setMobileInfoOpen(o => !o)}
          aria-label={mobileInfoOpen ? 'Close info panel' : 'Open info panel'}
          aria-expanded={mobileInfoOpen}
        >
          {mobileInfoOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {mobileInfoOpen && (
        <div
          className="mobile-scrim"
          onClick={() => setMobileInfoOpen(false)}
          aria-hidden
        />
      )}

      {!vsIntroDone && (
        <VsIntroScreen
          opponentLabel={opponentLabel}
          onComplete={() => setVsIntroDone(true)}
        />
      )}
      {vsIntroDone && !shuffleDone && <DeckShuffleIntro onComplete={handleIntroComplete} />}

      {visual.deckTravel && (
        <CardFromDeckFlight
          request={visual.deckTravel}
          onComplete={completeDeckTravel}
        />
      )}

      {visual.cardToDeck && (
        <CardToDeckFlight
          request={visual.cardToDeck}
          onComplete={completeCardToDeck}
        />
      )}

      {visual.cardSwap && (
        <CardSwapFlight
          request={visual.cardSwap}
          onComplete={completeCardSwap}
        />
      )}

      {visual.laneFlight && (
        <CommitToLaneFlight
          request={visual.laneFlight}
          onComplete={completeCommitToLane}
          onDepart={() => hideEffectInHand(visual.laneFlight!.effectId)}
        />
      )}

      {visual.fizzleToast && (
        <EffectFizzleToast toast={visual.fizzleToast} />
      )}

      {visual.handToCenter && (
        <EffectHandToCenterFlight
          request={visual.handToCenter}
          onComplete={completeHandToCenter}
          onDepart={() => {
            if (!visual.handToCenter) return;
            const id = visual.handToCenter.effectId;
            const onLane = visual.commitLanes.some(c => c.effectId === id && !c.departed);
            if (onLane) departLaneCard(id);
            else hideEffectInHand(id);
          }}
        />
      )}

      {visual.slotMachine && (
        <SlotMachineReveal
          request={visual.slotMachine}
          onComplete={completeSlotMachine}
        />
      )}

      {visual.effectShred && (
        <EffectShredOverlay
          request={visual.effectShred}
          onComplete={completeEffectShred}
        />
      )}

      {visual.inPlaceSpin && (
        <InPlaceCardSpin
          request={visual.inPlaceSpin}
          onComplete={completeInPlaceSpin}
        />
      )}

      {visual.spyReveal && (
        <SpyRevealOverlay
          request={visual.spyReveal}
          onComplete={completeSpyReveal}
        />
      )}

      {visual.forceDelete && (
        <ForceDeleteOverlay
          request={visual.forceDelete}
          onComplete={completeForceDelete}
        />
      )}

      {visual.effectToSlot && (
        <EffectToSlotFlight
          request={visual.effectToSlot}
          onComplete={completeEffectToSlot}
          onDepart={clearCenterHeld}
        />
      )}

      {visual.castOverlay && visual.castPhase && visual.castPhase !== 'impact'
        && visual.commitLanes.length === 0 && (
        <EffectCastOverlay cast={visual.castOverlay} phase={visual.castPhase} />
      )}

      {isFinished && (
        <MatchEndCinematic
          game={game}
          online={!!online}
          onRestart={onRestart}
        />
      )}

      <LeftSidebar
        playerHand={playerHand.length > 0 ? playerHand : null}
        botHand={botHand.length > 0 ? botHand : null}
        logEntries={displayGame.log}
      />

      {rightSidebar}
      {battlefield}
    </div>
  );
}

