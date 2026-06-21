import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommittedAction, EffectType, GameState, SlotIndex, ResolutionItem } from '../game/types';
import { EFFECT_NAMES, HAND_SIZE, TOTAL_ROUNDS, MAX_CARDS_PER_ROUND } from '../game/types';
import {
  createGame, lockPlayerCommit, resolveNextInQueue,
  getValidOwnSlots, getValidOpponentSlots, getValidCleanseTargets,
  canCommitEffectType,
} from '../game/gameEngine';
import { getHandHighlights } from '../game/poker';
import { sortHandBySlot } from '../game/effects';
import {
  PlayingCardSlot, EffectCardView, OpponentEffectStack, DeckPile, PokerCardEmptySlot,
} from './Cards';
import { HandRankBadge } from './HandRankBadge';
import { HandRankLadder } from './HandRankLadder';
import { EffectCastOverlay } from './EffectCastOverlay';
import { ResolutionFeed } from './ResolutionFeed';
import { DeckShuffleIntro } from './DeckShuffleIntro';
import { CardFromDeckFlight } from './CardFromDeckFlight';
import { CardToDeckFlight } from './CardToDeckFlight';
import { CardSwapFlight } from './CardSwapFlight';
import { SlotMachineReveal } from './SlotMachineReveal';
import { EffectShredOverlay } from './EffectShredOverlay';
import { ResolutionSequencerUI } from './ResolutionSequencerUI';
import { useAnimatedGame } from '../hooks/useAnimatedGame';
import { getCardAnimationClass } from '../ui/detectAnimations';
import './GameBoard.css';
import './ResolutionFeed.css';
import './DeckShuffleIntro.css';
import './CardFromDeckFlight.css';
import './CardToDeckFlight.css';
import './CardSwapFlight.css';
import './SlotMachineReveal.css';
import './EffectShredOverlay.css';
import './ResolutionSequencerUI.css';

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
    applyUpdate,
    runResolutionCinematic,
    requestFastForward,
    runIntroReveal,
    completeDeckTravel,
    completeCardToDeck,
    completeCardSwap,
    completeSlotMachine,
    completeEffectShred,
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

  const handleEffectClick = (effectId: string) => {
    if (!canInteract) return;

    const pending = pendingPick;
    if (pending?.step === 'opponent_effect') {
      finishPending({
        effectId: pending.effectId,
        effectType: pending.effectType,
        opponentEffectId: effectId,
      });
      return;
    }

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
    if (!canInteract || !pendingPick) return;

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

  const handleRemoveQueued = (effectId: string) => {
    if (!canInteract) return;
    setCommitQueue(q => q.filter(a => a.effectId !== effectId));
  };

  const handleCancelPick = () => setPendingPick(null);

  const validOwnSlots = pendingPick
    ? new Set(getValidOwnSlots(displayGame, 'player', pendingPick.effectType))
    : new Set<number>();
  const validOppSlots = pendingPick
    ? new Set(getValidOpponentSlots(displayGame, 'player', pendingPick.effectType))
    : new Set<number>();
  const validCleanse = pendingPick?.step === 'cleanse_slot'
    ? getValidCleanseTargets(displayGame)
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

  const activeResolver = visual.sequencer.activeResolver;
  const isSequencerActive = resolving || (
    visual.sequencer.roundBanner !== null
    || visual.sequencer.sidePass !== null
    || visual.sequencer.sideTransition !== null
    || visual.sequencer.activeResolver !== null
    || visual.sequencer.drawBeat
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
          if (canInteract && pendingPick) {
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

          return (
            <PlayingCardSlot
              key={card.id}
              card={card}
              currentTurn={displayGame.currentRound}
              selected={selectable}
              animClass={animClass}
              flipping={visual.mechanical === 'transform' && visual.targetCardIds.includes(card.id)}
              shiftDisplayRank={isShiftAnim ? visual.cardAfter?.rank : undefined}
              highlightGroup={highlights.get(card.id) ?? null}
              slotAnchor={slotAnchor}
              targeted={isTargeted}
              onClick={selectable ? () => handleSlotClick(ownerId, slot) : undefined}
            />
          );
        })}
      </div>
    );
  };

  const effectDisabled = !canInteract
    || slotsLeft <= 0
    || (!!pendingPick && pendingPick.step !== 'opponent_effect');

  const actionHint = getCommitHint(
    displayGame,
    pendingPick,
    commitQueue.length,
    resolving,
    online ? { youLocked: online.youLocked, opponentLocked: online.opponentLocked } : undefined,
  );

  const handleIntroComplete = useCallback(async () => {
    setShuffleDone(true);
    await runIntroReveal(initialGame);
    setIntroReady(true);
  }, [initialGame, runIntroReveal]);

  return (
    <div className={`game-board ${isAnimating || resolving || !introReady ? 'is-animating' : ''}`}>
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

      {visual.castOverlay && visual.castPhase && visual.castPhase !== 'impact' && (
        <EffectCastOverlay cast={visual.castOverlay} phase={visual.castPhase} />
      )}

      <ResolutionSequencerUI
        sequencer={visual.sequencer}
        showFastForward={isSequencerActive}
        onFastForward={requestFastForward}
      />

      <HandRankLadder
        playerHand={playerHand.length > 0 ? playerHand : null}
        botHand={botHand.length > 0 ? botHand : null}
      />

      {/* ═══ BATTLEFIELD ═══ */}
      <div className="battlefield">

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
        <section className={`zone zone--bot ${activeResolver === 'bot' ? 'zone--resolving-active' : ''}`}>
          <div className="zone-top-bar">
            <span className="zone-label">Rakip</span>
            <HandRankBadge cards={botHand} />
            <OpponentEffectStack
              effects={displayGame.players.bot.effectHand}
              ownerId="bot"
              onCardClick={handleEffectClick}
              selectable={canInteract && pendingPick?.step === 'opponent_effect'}
              revealedSpyIds={revealedSpyEffectIds}
              spyFlipEffectId={visual.spyFlipEffectId}
              targetEffectId={visual.targetEffectId}
            />
          </div>
          {renderPokerHand('bot')}
        </section>

        {/* ── Battle center ── */}
        <section className="battle-center">
          <div className="battle-divider" />

          <div className="battle-hub">
            <h1 className="game-title">SHOWHAND</h1>
            <div className="battle-meta">
              <span className="round-indicator">Round {displayGame.currentRound} / {TOTAL_ROUNDS}</span>
              <DeckPile count={displayGame.deck.length} />
              {isCommitting && !isFinished && (
                <span className="slots-left">{slotsLeft} kart</span>
              )}
            </div>
          </div>

          {actionHint && (
            <div className="action-hint-container">
              <div className="action-hint">{actionHint}</div>
              {canInteract && pendingPick && (
                <button type="button" className="btn-cancel" onClick={handleCancelPick}>
                  İptal
                </button>
              )}
            </div>
          )}

          {online?.youLocked && !online.opponentLocked && isCommitting && (
            <div className="action-hint online-wait">Kilitledin — rakip bekleniyor…</div>
          )}
          {online?.opponentLocked && !online.youLocked && isCommitting && (
            <div className="action-hint online-wait online-wait--urgent">Rakip kilitledi — sen de kilitle!</div>
          )}

          {commitQueue.length > 0 && isCommitting && (
            <div className="commit-queue">
              <strong>Seçilen hamleler:</strong>
              <ul>
                {commitQueue.map(a => (
                  <li key={a.effectId}>
                    {EFFECT_NAMES[a.effectType]}
                    {canInteract && (
                      <button type="button" className="btn-remove-commit" onClick={() => handleRemoveQueued(a.effectId)}>
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {displayGame.spyReveal && (
            <div className="spy-reveal">
              Casus: {EFFECT_NAMES[displayGame.spyReveal.type]}
            </div>
          )}

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

          {canInteract && (
            <button type="button" className="btn-lock" onClick={handleLockCommit}>
              {commitQueue.length === 0 ? 'Pas Geç' : 'Kilitle'}
            </button>
          )}
        </section>

        {/* ── Player territory ── */}
        <section className={`zone zone--player ${activeResolver === 'player' ? 'zone--resolving-active' : ''}`}>
          {renderPokerHand('player')}
          <div className="zone-bottom-bar">
            <HandRankBadge cards={playerHand} />
            {isCommitting && !isFinished && <span className="zone-status">hamle seç</span>}
          </div>
          <div className="effect-tray">
            <span className="effect-tray-label">Efektler ({displayGame.players.player.effectHand.length})</span>
            <div className="effect-row">
              {displayGame.players.player.effectHand.map(card => (
                <EffectCardView
                  key={card.id}
                  card={card}
                  onClick={() => handleEffectClick(card.id)}
                  disabled={effectDisabled || usedEffectIds.has(card.id) || !canCommitEffectType(game, 'player', card.type)}
                  selected={usedEffectIds.has(card.id)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ GAME LOG ═══ */}
      <aside className="game-log">
        <h3>Olaylar</h3>
        <div className="log-entries">
          {[...displayGame.log].reverse().slice(0, 20).map((entry, i) => (
            <div key={i} className={`log-entry ${entry.playerId === 'player' ? 'player' : entry.playerId === 'bot' ? 'bot' : ''}`}>
              <span className="log-turn">R{entry.turn}</span> {entry.message}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function getCommitHint(
  game: GameState,
  pending: PendingPick | null,
  queued: number,
  resolving: boolean,
  online?: { youLocked: boolean; opponentLocked: boolean },
): string | null {
  if (game.phase === 'finished') return null;
  if (resolving) return 'Hamleler çözülüyor...';

  if (pending) {
    switch (pending.step) {
      case 'opponent_slot':
        return pending.effectType === 'steal_card'
          ? 'Rakibin açık pozisyonunu seç (takas)'
          : 'Rakibin açık pozisyonunu seç';
      case 'own_slot':
        return pending.effectType === 'steal_card'
          ? 'Kendi vereceğin pozisyonu seç'
          : 'Kendi pozisyonunu seç';
      case 'opponent_effect':
        return pending.effectType === 'spy'
          ? 'Casus: rakip efekt kartını seç'
          : 'Silinecek rakip efekt kartını seç';
      case 'cleanse_slot':
        return 'Dondurulmuş kartın pozisyonunu seç';
    }
  }

  if (game.phase === 'committing') {
    if (online?.youLocked && !online.opponentLocked) {
      return 'Kilitledin — rakip bekleniyor…';
    }
    if (online?.opponentLocked && !online.youLocked) {
      return 'Rakip kilitledi — sen de kilitle!';
    }
    const left = MAX_CARDS_PER_ROUND - queued;
    if (left === MAX_CARDS_PER_ROUND) {
      return 'Efekt seç veya pas geç — rakip görmeden kilitle';
    }
    return `${left} kart daha ekleyebilir veya kilitleyebilirsin`;
  }

  return null;
}
