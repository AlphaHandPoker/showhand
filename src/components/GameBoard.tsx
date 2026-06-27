import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommittedAction, EffectType, GameState, SlotIndex, GameMode } from '../game/types';
import { HAND_SIZE, TOTAL_ROUNDS } from '../game/types';
import { maxCardsForState } from '../game/gameModes';
import {
  createGame, lockPlayerCommit, resolveNextInQueue,
  getValidOwnSlots, getValidOpponentSlots, getValidCleanseTargets,
  canCommitEffectType,
} from '../game/gameEngine';
import { getHandHighlights } from '../game/poker';
import { sortHandBySlot, canTargetCard } from '../game/effects';
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
import { useIsMobile } from '../hooks/useIsMobile';
import { getCardAnimationClass } from '../ui/detectAnimations';
import { CardInspectOverlay, type InspectTarget } from './CardInspectOverlay';
import { HowToPlayFab, HowToPlayGuide } from './HowToPlayGuide';
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
import { EffectCardLanes, PokerCardLanes } from './MobileCardLanes';
import './HowToPlayGuide.css';
import './CardInspectOverlay.css';
import { Menu, X } from 'lucide-react';

interface GameBoardProps {
  playerDeck: EffectType[];
  botDeck: EffectType[];
  gameMode?: GameMode;
  onRestart: () => void;
  online?: {
    youLocked: boolean;
    opponentLocked: boolean;
    onLockCommit: (actions: CommittedAction[]) => void;
    syncedGame: GameState;
    opponentLabel?: string;
  };
}

type PendingPick =
  | { effectId: string; effectType: EffectType; step: 'opponent_slot'; partial: CommittedAction }
  | { effectId: string; effectType: EffectType; step: 'own_slot'; partial: CommittedAction }
  | { effectId: string; effectType: EffectType; step: 'opponent_effect' }
  | { effectId: string; effectType: EffectType; step: 'cleanse_slot' };

export function GameBoard({ playerDeck, botDeck, gameMode = 'draft', onRestart, online }: GameBoardProps) {
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
    runResolutionCinematic,
    runIntroReveal,
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
  const [resolving, setResolving] = useState(false);
  const [vsIntroDone, setVsIntroDone] = useState(false);
  const [shuffleDone, setShuffleDone] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [matchEndPhase, setMatchEndPhase] = useState<'idle' | 'highlight' | 'done'>('idle');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const isMobile = useIsMobile();
  const resolvingRef = useRef(false);
  const isFinished = game.phase === 'finished';
  const opponentLabel = online?.opponentLabel ?? 'Bot';

  useEffect(() => {
    document.documentElement.classList.add('game-board-active');
    document.body.classList.add('game-board-active');
    return () => {
      document.documentElement.classList.remove('game-board-active');
      document.body.classList.remove('game-board-active');
    };
  }, []);

  useEffect(() => {
    if (!isFinished) {
      setMatchEndPhase('idle');
      return;
    }
    const t = window.setTimeout(() => setMatchEndPhase('highlight'), 1800);
    return () => window.clearTimeout(t);
  }, [isFinished]);

  const isCommitting = game.phase === 'committing';
  const canInteract = introReady && isCommitting && !isFinished && !isAnimating && !resolving
    && (!online || !online.youLocked);
  const canCancelPick = isCommitting && !isFinished && pendingPick !== null;
  const canPickOpponentEffects = isCommitting && !isFinished && !resolving
    && pendingPick?.step === 'opponent_effect'
    && (!online || !online.youLocked);
  const canCompletePick = isCommitting && !isFinished && !resolving
    && (!online || !online.youLocked);
  const boardInputBlocked = resolving || !introReady || (isAnimating && !isCommitting);

  const syncQueueRef = useRef(Promise.resolve());
  const lastSyncSigRef = useRef('');

  useEffect(() => {
    if (!online?.syncedGame) return;
    const g = online.syncedGame;
    const sig = `${g.phase}-${g.currentRound}-${g.resolutionIndex}-${g.log.length}-${g.winner ?? ''}`;
    if (sig === lastSyncSigRef.current) return;
    lastSyncSigRef.current = sig;

    syncQueueRef.current = syncQueueRef.current.then(async () => {
      if (g.phase === 'resolving' && game.phase === 'committing') {
        setResolving(true);
      }
      await applyUpdate(g);
      if (g.phase !== 'resolving') {
        setResolving(false);
        if (g.phase === 'committing') {
          setCommitQueue([]);
          setPendingPick(null);
        }
      }
    });
  }, [online?.syncedGame, game.phase, applyUpdate]);

  useEffect(() => {
    if (!isCommitting || resolving) {
      setPendingPick(null);
    }
  }, [isCommitting, resolving]);

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

  const handleLockCommit = async () => {
    if (!canInteract || pendingPick) return;

    if (online) {
      online.onLockCommit([...commitQueue]);
      setCommitQueue([]);
      setPendingPick(null);
      return;
    }

    let next: GameState;
    try {
      next = lockPlayerCommit(game, commitQueue);
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
  };

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

  const inspectPoker = (card: typeof displayGame.players.player.pokerHand[0], ownerId: 'player' | 'bot') => {
    setInspectTarget({
      kind: 'poker',
      card,
      ownerId,
      ownerLabel: ownerId === 'player' ? 'Senin kartın' : opponentLabel,
    });
  };

  const inspectEffect = (card: typeof displayGame.players.player.effectHand[0], ownerId: 'player' | 'bot') => {
    setInspectTarget({
      kind: 'effect',
      card,
      ownerId,
      ownerLabel: ownerId === 'player' ? 'Senin efektin' : `${opponentLabel} efekti`,
    });
  };

  const handlePokerTap = (ownerId: 'player' | 'bot', slotIndex: SlotIndex, selectable: boolean) => {
    if (selectable) {
      handleSlotClick(ownerId, slotIndex);
      return;
    }
    const card = displayGame.players[ownerId].pokerHand.find(c => c.slotIndex === slotIndex);
    if (isMobile && card && !hiddenBoardCardIds.has(card.id)) {
      inspectPoker(card, ownerId);
    }
  };

  const handlePlayerEffectTap = (effectId: string) => {
    const effect = game.players.player.effectHand.find(e => e.id === effectId);
    if (!effect) return;

    const canPlay = canInteract
      && !pendingPick
      && slotsLeft > 0
      && !usedEffectIds.has(effectId)
      && canCommitEffectType(game, 'player', effect.type);

    if (canPlay) {
      handleEffectClick(effectId);
      return;
    }

    if (isMobile) {
      inspectEffect(effect, 'player');
    }
  };

  const handleOpponentEffectTap = (effectId: string, revealed: boolean) => {
    if (canPickOpponentEffects) {
      handleOpponentEffectPick(effectId);
      return;
    }
    if (!isMobile || !revealed) return;
    const effect = displayGame.players.bot.effectHand.find(e => e.id === effectId);
    if (effect) inspectEffect(effect, 'bot');
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


  const handleCancelPick = () => setPendingPick(null);

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

    const slotCells = Array.from({ length: HAND_SIZE }, (_, slotIndex) => {
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
          onClick={selectable || isMobile ? () => handlePokerTap(ownerId, slot, selectable) : undefined}
        />
      );
    });

    if (isMobile) {
      return <PokerCardLanes>{slotCells}</PokerCardLanes>;
    }

    return (
      <div className={`hand-row ${ownerId === 'player' ? 'hand-row--player' : 'hand-row--bot'} ${!shuffleDone ? 'hand-row--pre-reveal' : ''}`}>
        {slotCells}
      </div>
    );
  };

  const effectDisabled = !canInteract
    || slotsLeft <= 0
    || !!pendingPick;

  const handleIntroComplete = useCallback(async () => {
    setShuffleDone(true);
    await runIntroReveal(initialGame);
    setIntroReady(true);
  }, [initialGame, runIntroReveal]);

  return (
    <div className={`game-board ${game.gameMode === 'full_deck' ? 'game-board--full-deck' : ''} ${boardInputBlocked ? 'is-animating' : ''} ${mobileInfoOpen ? 'game-board--info-open' : ''}${isMobile ? ' game-board--mobile' : ''}`}>
      <HowToPlayFab onClick={() => setShowHowToPlay(true)} />
      {showHowToPlay && <HowToPlayGuide onClose={() => setShowHowToPlay(false)} />}
      {inspectTarget && (
        <CardInspectOverlay
          target={inspectTarget}
          currentTurn={game.currentRound}
          onClose={() => setInspectTarget(null)}
        />
      )}

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
          aria-label={mobileInfoOpen ? 'Bilgi panelini kapat' : 'Bilgi panelini aç'}
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

      <RightSidebar
        opponentLabel={opponentLabel}
        isFinished={isFinished}
        winner={game.winner}
        game={displayGame}
        resolving={resolving}
        actions={(
          <>
            {isCommitting && !isFinished && (
              <span className="slots-left">{slotsLeft} kart</span>
            )}

            {canCancelPick && (
              <button type="button" className="btn-cancel" onClick={handleCancelPick}>
                İptal
              </button>
            )}

            {pendingPick?.step === 'opponent_effect' && canPickOpponentEffects && (
              <span className="pick-hint">Rakibin efekt kartını seç</span>
            )}

            {canInteract && (
              <button type="button" className="btn-lock" onClick={handleLockCommit}>
                {commitQueue.length === 0 ? 'Pas Geç' : 'Kilitle'}
              </button>
            )}

            {online?.youLocked && !online.opponentLocked && isCommitting && (
              <span className="online-status-msg">Kilitledin — rakip bekleniyor…</span>
            )}
            {online?.opponentLocked && !online.youLocked && isCommitting && (
              <span className="online-status-msg online-status-msg--urgent">Rakip kilitledi — sen de kilitle!</span>
            )}
          </>
        )}
      />

      {/* ═══ BATTLEFIELD ═══ */}
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
          {/* ── Top half — bot (mirrors bottom half) ── */}
          <div className="battlefield-half battlefield-half--bot">
            <section className={`zone zone--bot ${activeLaneOwner === 'bot' ? 'zone--resolving-active' : ''} ${getMatchEndZoneClass('bot', game.winner, matchEndPhase)}`}>
              <div className="effect-band effect-band--bot">
                <div className="effect-band__cards">
                  <OpponentEffectStack
                    effects={displayGame.players.bot.effectHand}
                    ownerId="bot"
                    onCardClick={handleOpponentEffectTap}
                    selectable={canPickOpponentEffects}
                    inspectable={isMobile}
                    mobileLanes={isMobile}
                    revealedSpyIds={revealedSpyEffectIds}
                    spyFlipEffectId={visual.spyFlipEffectId}
                    targetEffectId={visual.targetEffectId}
                    hiddenEffectIds={hiddenEffectIds}
                    overlayMaskEffectId={
                      overlayMaskEffectId && visual.spyReveal?.victimOwnerId === 'bot'
                        ? overlayMaskEffectId
                        : overlayMaskEffectId && visual.forceDelete?.victimOwnerId === 'bot'
                          ? overlayMaskEffectId
                          : overlayMaskEffectId && visual.effectShred?.ownerId === 'bot'
                            ? overlayMaskEffectId
                            : null
                    }
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

          {/* ── Bottom half — player (mirrors top half) ── */}
          <div className="battlefield-half battlefield-half--player">
            <section className={`zone zone--player ${activeLaneOwner === 'player' ? 'zone--resolving-active' : ''} ${getMatchEndZoneClass('player', game.winner, matchEndPhase)}`}>
              <div className="battlefield-half-core">
                {renderArenaRows('player')}

                <div className="arena-hud arena-hud--compact">
                  <HandRankBadge cards={playerHand} />
                </div>
              </div>

              <div className="effect-band effect-band--player">
                <div className="effect-band__cards">
                  {isMobile ? (
                    <EffectCardLanes>
                      {displayGame.players.player.effectHand.map(card => {
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
                              compact
                              onClick={() => handlePlayerEffectTap(card.id)}
                              disabled={!isMobile && (effectDisabled || usedEffectIds.has(card.id) || !canCommitEffectType(game, 'player', card.type))}
                              selected={usedEffectIds.has(card.id)}
                              spyRevealed={revealedSpyEffectIds.has(card.id)}
                              spyFlipping={visual.spyFlipEffectId === card.id}
                            />
                          </div>
                        );
                      })}
                    </EffectCardLanes>
                  ) : (
                    <div className="effect-row">
                      {displayGame.players.player.effectHand.map(card => {
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
                              onClick={() => handlePlayerEffectTap(card.id)}
                              disabled={effectDisabled || usedEffectIds.has(card.id) || !canCommitEffectType(game, 'player', card.type)}
                              selected={usedEffectIds.has(card.id)}
                              spyRevealed={revealedSpyEffectIds.has(card.id)}
                              spyFlipping={visual.spyFlipEffectId === card.id}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

