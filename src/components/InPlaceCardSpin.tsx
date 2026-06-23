import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayingCard, PlayerId, Suit } from '../game/types';
import { PlayingCardFace } from './PlayingCardFace';
import { prefersReducedMotion } from '../ui/motion';
import './InPlaceCardSpin.css';

export interface InPlaceCardSpinRequest {
  mode: 'transform' | 'shift';
  cardBefore: PlayingCard;
  cardAfter: PlayingCard;
  ownerId: PlayerId;
}

interface InPlaceCardSpinProps {
  request: InPlaceCardSpinRequest;
  onComplete: () => void;
}

const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SPIN_MS = 2200;
const SPIN_REDUCED_MS = 280;

function buildTransformCandidates(before: PlayingCard, after: PlayingCard): PlayingCard[] {
  const others = ALL_SUITS.filter(s => s !== before.suit);
  return [...others, after.suit, after.suit].map(suit => ({ ...before, suit }));
}

function buildShiftCandidates(before: PlayingCard, after: PlayingCard): PlayingCard[] {
  const ranks: PlayingCard['rank'][] = [before.rank - 2, before.rank - 1, before.rank + 1, before.rank + 2, after.rank, after.rank]
    .map(r => ((r - 2 + 13) % 13) + 2 as PlayingCard['rank']);
  const unique = [...new Set(ranks)];
  while (unique.length < 6) unique.push(after.rank);
  return unique.slice(0, 6).map(rank => ({ ...before, rank }));
}

export function InPlaceCardSpin({ request, onComplete }: InPlaceCardSpinProps) {
  const reduced = prefersReducedMotion();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [index, setIndex] = useState(0);
  const [landed, setLanded] = useState(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const candidates = useMemo(
    () => request.mode === 'transform'
      ? buildTransformCandidates(request.cardBefore, request.cardAfter)
      : buildShiftCandidates(request.cardBefore, request.cardAfter),
    [request],
  );

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  };

  useLayoutEffect(() => {
    completedRef.current = false;
    const el = document.querySelector(
      `[data-slot-anchor="${request.ownerId}-${request.cardBefore.slotIndex}"]`,
    );
    if (!el) {
      finish();
      return;
    }
    setRect(el.getBoundingClientRect());
    if (reduced) {
      setIndex(candidates.length - 1);
      setLanded(true);
    } else {
      requestAnimationFrame(() => setSpinning(true));
    }
  }, [request, candidates.length, reduced]);

  useEffect(() => {
    if (!rect) return;
    if (reduced) {
      const t = window.setTimeout(finish, SPIN_REDUCED_MS);
      return () => window.clearTimeout(t);
    }
    if (!spinning) return;

    let step = 0;
    const stepMs = SPIN_MS / (candidates.length + 1);
    const interval = window.setInterval(() => {
      step++;
      if (step >= candidates.length) {
        window.clearInterval(interval);
        setLanded(true);
        window.setTimeout(finish, 400);
        return;
      }
      setIndex(step);
    }, stepMs * 0.9);

    return () => window.clearInterval(interval);
  }, [rect, spinning, candidates.length, reduced]);

  if (!rect || completedRef.current) return null;

  const displayCard = candidates[Math.min(index, candidates.length - 1)]!;

  return createPortal(
    <div
      className={[
        'in-place-card-spin',
        request.mode === 'shift' && 'in-place-card-spin--shift',
        spinning && 'in-place-card-spin--active',
        landed && 'in-place-card-spin--landed',
      ].filter(Boolean).join(' ')}
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden
    >
      <div className="in-place-card-spin-inner">
        <PlayingCardFace card={displayCard} />
      </div>
      {landed && <div className="in-place-card-spin-flash" />}
    </div>,
    document.body,
  );
}
