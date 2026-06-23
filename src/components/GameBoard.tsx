import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommittedAction, EffectType, GameState, SlotIndex, ResolutionItem } from '../game/types';
import { HAND_SIZE, TOTAL_ROUNDS, MAX_CARDS_PER_ROUND } from '../game/types';
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
import { EffectCastOverlay } from './EffectCastOverlay';
import { ResolutionFeed } from './ResolutionFeed';
import { DeckShuffleIntro } from './DeckShuffleIntro';
import { CardFromDeckFlight } from './CardFromDeckFlight';
import { CardToDeckFlight } from './CardToDeckFlight';
import { CardSwapFlight } from './CardSwapFlight';
import { ResolutionSequencerUI } from './ResolutionSequencerUI';
import { CommitRevealLanes } from './CommitRevealLanes';
import { CommitToLaneFlight } from './CommitToLaneFlight';
import { EffectFizzleToast } from './EffectFizzleToast';
import { CenterHeldEffect } from './CenterHeldEffect';
import { EffectTokenStack, TokenSlotPlaceholder } from './EffectTokenStack';
import { EffectToSlotFlight } from './EffectToSlotFlight';
import { EffectHandToCenterFlight } from './EffectHandToCenterFlight';
import { InPlaceCardSpin } from './InPlaceCardSpin';
import { SpyRevealOverlay } from './SpyRevealOverlay';
import { ForceDeleteOverlay } from './ForceDeleteOverlay';
import { useAnimatedGame } from '../hooks/useAnimatedGame';
import { getCardAnimationClass } from '../ui/detectAnimations';
import './GameBoard.css';
import './ResolutionFeed.css';
import './DeckShuffleIntro.css';
import './CardFromDeckFlight.css';
import './CardToDeckFlight.css';
import './CardSwapFlight.css';
import './CommitRevealLanes.css';
import './CommitToLaneFlight.css';
import './EffectFizzleToast.css';
import './LeftSidebar.css';
import './HandRankLadder.css';
import './GameLogPanel.css';
import './ResolutionSequencerUI.css';
import './EffectHandToCenterFlight.css';
import './InPlaceCardSpin.css';
import './SpyRevealOverlay.css';
import './ForceDeleteOverlay.css';
import './EffectToSlotFlight.css';

interface GameBoardProps {
  playerDeck: EffectType[];
  botDeck: EffectType[];
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

export function GameBoard({ playerDeck, botDeck, onRestart, online }: GameBoardProps) {
  const initialGame = useMemo(
    () => (online ? online.syncedGame : createGame(playerDeck, botDeck)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [online?.syncedGame, playerDeck, botDeck],
  );

  const {
    game,
    displayGame,
    visual,
    slotTokens,
    applyUpdate,
    runResolutionCinematic,
    requestFastForward,
    runIntroReveal,
    completeDeckTravel,
    completeCardToDeck,
    completeCardSwap,
    completeHandToCenter,
    departLaneCard,
    clearCenterHeld,
    completeCommitToLane,
    completeInPlaceSpin,
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
  const [shuffleDone, setShuffleDone] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const resolvingRef = useRef(false);
  const [resolutionFeed, setResolutionFeed] = useState<{
    queue: ResolutionItem[];
    completed: number;
    latestLog?: string;
  } | null>(null);

  const isFinished = game.phase === 'finished';
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
        setResolutionFeed({ queue: g.resolutionQueue, completed: 0 });
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

  const slotsLeft = MAX_CARDS_PER_ROUND - commitQueue.length;
  const usedEffectIds = new Set(commitQueue.map(a => a.effectId));

  const runResolution = useCallback(async (startState: GameState) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    const queue = startState.resolutionQueue;
    setResolutionFeed({ queue, completed: 0 });
    try {
      await runResolutionCinematic(startState, resolveNextInQueue, (current) => {
        setResolutionFeed({
          queue,
          completed: current.resolutionIndex,
          latestLog: current.log[current.log.length - 1]?.message,
        });
      });
    } finally {
      resolvingRef.current = false;
      setResolving(false);
      setCommitQueue([]);
      setPendingPick(null);
      setTimeout(() => setResolutionFeed(null), 2800);
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
  const isSequencerActive = resolving || visual.isAnimating;

  const hiddenEffectIds = useMemo(
    () => new Set(visual.hiddenEffectIds),
    [visual.hiddenEffectIds],
  );

  const renderTokenRow = (ownerId: 'player' | 'bot') => (
    <div className={`token-slot-row token-slot-row--${ownerId}`}>
      {Array.from({ length: HAND_SIZE }, (_, slotIndex) => {
        const tokens = slotTokens.get(`${ownerId}-${slotIndex}`) ?? [];
        return (
          <div
            key={`token-${ownerId}-${slotIndex}`}
            className={`token-slot ${tokens.length === 0 ? 'token-slot--empty' : 'token-slot--filled'}`}
            data-token-slot-anchor={`${ownerId}-${slotIndex}`}
          >
            {tokens.length > 0
              ? <EffectTokenStack tokens={tokens} />
              : <TokenSlotPlaceholder />}
          </div>
        );
      })}
    </div>
  );

  const renderArenaRows = (ownerId: 'player' | 'bot') => (
    <div className="arena-rows">
      {ownerId === 'bot' && renderTokenRow('bot')}
      {renderPokerHand(ownerId)}
      {ownerId === 'player' && renderTokenRow('player')}
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
          const isTargeted = visual.targetSlots.some(
            t => t.ownerId === ownerId && t.slotIndex === slotIndex,
          );

          if (!card || hiddenBoardCardIds.has(card.id)) {
            return (
              <PokerCardEmptySlot
                key={`empty-${ownerId}-${slotIndex}`}
                slotAnchor={slotAnchor}
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
              targeted={isTargeted}
              untargetable={blockedByStatus}
              onClick={selectable ? () => handleSlotClick(ownerId, slot) : undefined}
            />
          );
        })}
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
    <div className={`game-board ${boardInputBlocked ? 'is-animating' : ''}`}>
      {!shuffleDone && <DeckShuffleIntro onComplete={handleIntroComplete} />}

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
            if (visual.handToCenter) departLaneCard(visual.handToCenter.effectId);
          }}
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

      <ResolutionSequencerUI
        sequencer={visual.sequencer}
        showFastForward={isSequencerActive}
        onFastForward={requestFastForward}
      />

      <LeftSidebar
        playerHand={playerHand.length > 0 ? playerHand : null}
        botHand={botHand.length > 0 ? botHand : null}
        logEntries={displayGame.log}
      />

      {/* ═══ BATTLEFIELD ═══ */}
      <div className="battlefield">
        <div className="cast-center-anchor">
          <div className="cast-center-measure" data-cast-center-anchor="measure" aria-hidden />
          {visual.centerHeldEffect && (
            <CenterHeldEffect effect={visual.centerHeldEffect.effect} />
          )}
        </div>

        <CommitRevealLanes lanes={visual.commitLanes} />

        {resolutionFeed && (
          <div className="resolution-feed-anchor">
            <ResolutionFeed
              queue={resolutionFeed.queue}
              completedCount={resolutionFeed.completed}
              isAnimating={isAnimating || resolving}
              latestLog={resolutionFeed.latestLog}
            />
          </div>
        )}

        {/* ── Enemy territory ── */}
        <section className={`zone zone--bot ${activeLaneOwner === 'bot' ? 'zone--resolving-active' : ''}`}>
          <div className="zone-top-bar">
            <HandRankBadge cards={botHand} />
            <OpponentEffectStack
              effects={displayGame.players.bot.effectHand}
              ownerId="bot"
              onCardClick={handleOpponentEffectPick}
              selectable={canPickOpponentEffects}
              revealedSpyIds={revealedSpyEffectIds}
              spyFlipEffectId={visual.spyFlipEffectId}
              targetEffectId={visual.targetEffectId}
              hiddenEffectIds={hiddenEffectIds}
              overlayMaskEffectId={
                visual.spyReveal?.victimOwnerId === 'bot'
                  ? visual.spyReveal.victimEffect.id
                  : visual.forceDelete?.victimOwnerId === 'bot'
                    ? visual.forceDelete.victimEffect.id
                    : null
              }
            />
          </div>
          {renderArenaRows('bot')}
        </section>

        {/* ── VS divider ── */}
        <section className="battle-center">
          <div className="battle-divider" />
          <span className="vs-label">— VS&ensp;Round {displayGame.currentRound}/{TOTAL_ROUNDS} —</span>

          {isFinished && (
            <div className="result-banner">
              <span className="result-text">
                {game.winner === 'player' && 'Kazandın!'}
                {game.winner === 'bot' && (online ? 'Rakip kazandı' : 'Bot kazandı')}
                {game.winner === 'tie' && 'Berabere'}
              </span>
              <button type="button" className="btn-restart" onClick={onRestart}>
                {online ? 'Ana Menü' : 'Yeni Maç'}
              </button>
            </div>
          )}
        </section>

        {/* ── Player territory ── */}
        <section className={`zone zone--player ${activeLaneOwner === 'player' ? 'zone--resolving-active' : ''}`}>
          {renderArenaRows('player')}

          {/* ── Arena HUD strip ── */}
          <div className="arena-hud">
            <HandRankBadge cards={playerHand} />
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
          </div>

          <div className="effect-tray">
            <span className="effect-tray-label">Efektler ({displayGame.players.player.effectHand.length})</span>
            <div className="effect-row">
              {displayGame.players.player.effectHand.map(card => {
                if (hiddenEffectIds.has(card.id)) return null;
                const overlayHidden = visual.spyReveal?.victimEffect.id === card.id
                  || visual.forceDelete?.victimEffect.id === card.id;
                return (
                <div
                  key={card.id}
                  className={`effect-flight-anchor${overlayHidden ? ' effect-flight-anchor--overlay-active' : ''}`}
                  data-effect-anchor={`player-${card.id}`}
                >
                  <EffectCardView
                    card={card}
                    onClick={() => handleEffectClick(card.id)}
                    disabled={effectDisabled || usedEffectIds.has(card.id) || !canCommitEffectType(game, 'player', card.type)}
                    selected={usedEffectIds.has(card.id)}
                    spyRevealed={revealedSpyEffectIds.has(card.id)}
                    spyFlipping={visual.spyFlipEffectId === card.id}
                  />
                </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

