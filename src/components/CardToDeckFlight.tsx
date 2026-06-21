import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayingCard, PlayerId } from '../game/types';
import { PlayingCardFace } from './PlayingCardFace';
import { CARD_REVEAL_REDUCED_MS } from '../audio/sounds';
import { RETURN_TO_DECK_MS } from '../ui/effectTimings';
import { prefersReducedMotion } from '../ui/motion';
import './CardToDeckFlight.css';

export interface CardToDeckRequest {
  card: PlayingCard;
  ownerId: PlayerId;
  slotIndex: number;
}

interface CardToDeckFlightProps {
  request: CardToDeckRequest;
  onComplete: () => void;
}

interface Rect { cx: number; cy: number; w: number; h: number }

export function CardToDeckFlight({ request, onComplete }: CardToDeckFlightProps) {
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'travel' | 'done'>('idle');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const startRef = useRef<Rect | null>(null);
  const endRef = useRef<Rect | null>(null);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('done');
    onCompleteRef.current();
  };

  useLayoutEffect(() => {
    completedRef.current = false;
    const deck = document.querySelector('[data-deck-anchor]');
    const slot = document.querySelector(`[data-slot-anchor="${request.ownerId}-${request.slotIndex}"]`);
    if (!deck || !slot) {
      finish();
      return;
    }

    const dr = deck.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();

    startRef.current = {
      cx: sr.left + sr.width / 2,
      cy: sr.top + sr.height / 2,
      w: sr.width,
      h: sr.height,
    };
    endRef.current = {
      cx: dr.left + dr.width / 2,
      cy: dr.top + dr.height / 2,
      w: dr.width * 0.85,
      h: dr.height * 0.85,
    };

    if (reduced) {
      setPhase('travel');
    } else {
      setPhase('idle');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('travel'));
      });
    }
  }, [request.card.id, request.ownerId, request.slotIndex, reduced]);

  useEffect(() => {
    if (phase === 'travel') {
      const dur = reduced ? CARD_REVEAL_REDUCED_MS : RETURN_TO_DECK_MS;
      const t = window.setTimeout(finish, dur);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduced]);

  if (phase === 'done' || !startRef.current || !endRef.current) return null;

  const s = startRef.current;
  const e = endRef.current;
  const atEnd = phase === 'travel';
  const target = atEnd ? e : s;

  const tx = target.cx;
  const ty = target.cy;
  const scaleX = target.w / (s.w || 1);
  const scaleY = target.h / (s.h || 1);
  const opacity = atEnd ? 0 : 1;

  const dur = reduced ? CARD_REVEAL_REDUCED_MS : RETURN_TO_DECK_MS;
  const transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
  const transition = phase === 'travel'
    ? `transform ${dur}ms ease-in, opacity ${dur}ms ease-in`
    : 'none';

  return createPortal(
    <div
      className={`card-to-deck-flight card-to-deck-flight--${request.ownerId}`}
      style={{ transform, transition, opacity, width: s.w, height: s.h }}
      aria-hidden
    >
      <PlayingCardFace card={request.card} />
    </div>,
    document.body,
  );
}
