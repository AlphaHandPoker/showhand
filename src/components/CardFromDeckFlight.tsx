import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayingCard, PlayerId } from '../game/types';
import { cardLabel, suitSymbol, suitColor } from '../game/deck';
import {
  playHitCardSound,
  CARD_TRAVEL_MS,
  CARD_DECK_FLIP_MS,
  CARD_REVEAL_REDUCED_MS,
} from '../audio/sounds';
import { prefersReducedMotion } from '../ui/motion';
import './CardFromDeckFlight.css';

export interface DeckTravelRequest {
  cardId: string;
  card: PlayingCard;
  ownerId: PlayerId;
  slotIndex: number;
}

interface CardFromDeckFlightProps {
  request: DeckTravelRequest;
  onComplete: () => void;
}

type FlightPhase = 'idle' | 'travel' | 'flip' | 'done';

interface Rect { cx: number; cy: number; w: number; h: number }

export function CardFromDeckFlight({ request, onComplete }: CardFromDeckFlightProps) {
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<FlightPhase>('idle');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const startRef = useRef<Rect | null>(null);
  const endRef = useRef<Rect | null>(null);

  const color = suitColor(request.card.suit);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('done');
    onCompleteRef.current();
  };

  useLayoutEffect(() => {
    completedRef.current = false;

    const deck = document.querySelector('[data-deck-anchor]');
    const slot = document.querySelector(
      `[data-slot-anchor="${request.ownerId}-${request.slotIndex}"]`,
    );

    if (!deck || !slot) {
      finish();
      return;
    }

    const dr = deck.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();

    startRef.current = {
      cx: dr.left + dr.width / 2,
      cy: dr.top + dr.height / 2,
      w: dr.width,
      h: dr.height,
    };
    endRef.current = {
      cx: sr.left + sr.width / 2,
      cy: sr.top + sr.height / 2,
      w: sr.width,
      h: sr.height,
    };

    if (reduced) {
      setPhase('flip');
    } else {
      setPhase('idle');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('travel'));
      });
    }
  }, [request.cardId, request.ownerId, request.slotIndex, reduced]);

  useEffect(() => {
    if (phase === 'travel') {
      const t = window.setTimeout(() => setPhase('flip'), CARD_TRAVEL_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'flip') {
      const dur = reduced ? CARD_REVEAL_REDUCED_MS : CARD_DECK_FLIP_MS;
      const t = window.setTimeout(() => {
        playHitCardSound();
        finish();
      }, dur);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduced]);

  if (phase === 'done' || !startRef.current || !endRef.current) return null;

  const s = startRef.current;
  const e = endRef.current;
  const atEnd = phase === 'travel' || phase === 'flip';
  const target = atEnd ? e : s;

  const tx = target.cx;
  const ty = target.cy;
  const scaleX = target.w / (s.w || 1);
  const scaleY = target.h / (s.h || 1);

  const flipMs = reduced ? CARD_REVEAL_REDUCED_MS : CARD_DECK_FLIP_MS;

  const transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
  const transition = phase === 'travel'
    ? `transform ${CARD_TRAVEL_MS}ms cubic-bezier(0.25, 1, 0.5, 1)`
    : 'none';

  return createPortal(
    <div
      className={[
        'card-from-deck-flight',
        `card-from-deck-flight--${request.ownerId}`,
        `phase-${phase}`,
        reduced && 'card-from-deck-flight--reduced',
      ].filter(Boolean).join(' ')}
      style={{
        transform,
        transition,
        width: s.w,
        height: s.h,
        ['--deck-flip-ms' as string]: `${flipMs}ms`,
      }}
      aria-hidden
    >
      <div className="card-from-deck-flight-inner">
        <div className="card-from-deck-back">
          <span className="card-from-deck-back-emblem">?</span>
        </div>
        <div className={`card-from-deck-face ${color}`}>
          <span className="card-corner card-corner-tl">
            <span className="card-rank">{cardLabel(request.card.rank)}</span>
            <span className="card-suit-sm">{suitSymbol(request.card.suit)}</span>
          </span>
          <span className="card-suit-center">{suitSymbol(request.card.suit)}</span>
          <span className="card-corner card-corner-br">
            <span className="card-rank">{cardLabel(request.card.rank)}</span>
            <span className="card-suit-sm">{suitSymbol(request.card.suit)}</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
