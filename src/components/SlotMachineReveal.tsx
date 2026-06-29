import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayingCard, Suit } from '../game/types';
import { PlayingCardFace } from './PlayingCardFace';
import { SLOT_MACHINE_MS, SLOT_MACHINE_REDUCED_MS } from '../ui/effectTimings';
import { playHitCardSound } from '../audio/sounds';
import { prefersReducedMotion } from '../ui/motion';
import './SlotMachineReveal.css';

export interface SlotMachineRequest {
  mode: 'transform' | 'shift';
  cardBefore: PlayingCard;
  cardAfter: PlayingCard;
}

interface SlotMachineRevealProps {
  request: SlotMachineRequest;
  onComplete: () => void;
}

const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function buildTransformCandidates(before: PlayingCard, after: PlayingCard): PlayingCard[] {
  const others = ALL_SUITS.filter(s => s !== before.suit);
  const cycle = [...others, after.suit, after.suit];
  return cycle.map(suit => ({ ...before, suit }));
}

function buildShiftCandidates(before: PlayingCard, after: PlayingCard): PlayingCard[] {
  const ranks = [before.rank - 2, before.rank - 1, before.rank + 1, before.rank + 2, after.rank, after.rank]
    .map(r => ((r - 2 + 13) % 13) + 2 as PlayingCard['rank']);
  const unique = [...new Set(ranks)];
  while (unique.length < 6) unique.push(after.rank);
  return unique.slice(0, 6).map(rank => ({ ...before, rank }));
}

export function SlotMachineReveal({ request, onComplete }: SlotMachineRevealProps) {
  const reduced = prefersReducedMotion();
  const candidates = useMemo(
    () => request.mode === 'transform'
      ? buildTransformCandidates(request.cardBefore, request.cardAfter)
      : buildShiftCandidates(request.cardBefore, request.cardAfter),
    [request],
  );

  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const [landed, setLanded] = useState(false);

  const totalMs = reduced ? SLOT_MACHINE_REDUCED_MS : SLOT_MACHINE_MS;
  const stepCount = reduced ? 1 : candidates.length;
  const stepMs = totalMs / (stepCount + 1);

  useEffect(() => {
    if (reduced) {
      setIndex(candidates.length - 1);
      setLanded(true);
      playHitCardSound();
      const t = window.setTimeout(() => {
        setClosing(true);
        window.setTimeout(onComplete, 120);
      }, stepMs);
      return () => window.clearTimeout(t);
    }

    let step = 0;
    const interval = window.setInterval(() => {
      step++;
      if (step >= candidates.length) {
        window.clearInterval(interval);
        setLanded(true);
        playHitCardSound();
        window.setTimeout(() => {
          setClosing(true);
          window.setTimeout(onComplete, 280);
        }, 320);
        return;
      }
      setIndex(step);
    }, stepMs * 0.85);

    return () => window.clearInterval(interval);
  }, [candidates.length, onComplete, reduced, stepMs]);

  const displayCard = candidates[Math.min(index, candidates.length - 1)]!;

  return createPortal(
    <div className={`slot-machine-overlay ${closing ? 'slot-machine-overlay--closing' : ''}`} aria-hidden>
      <div className="slot-machine-backdrop" />
      <div className={`slot-machine-panel ${landed ? 'slot-machine-panel--landed' : ''}`}>
        <p className="slot-machine-label">
          {request.mode === 'transform' ? 'Transform' : 'Shift Chance'}
        </p>
        <div className={`slot-machine-card ${landed ? 'slot-machine-card--landed' : ''}`}>
          <PlayingCardFace card={displayCard} />
          {landed && <div className="slot-machine-flash" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
