import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayingCard, PlayerId } from '../game/types';
import { PlayingCardFace } from './PlayingCardFace';
import { SWAP_LIFT_MS, SWAP_CROSS_MS, SWAP_LAND_MS } from '../ui/effectTimings';
import { playHitCardSound } from '../audio/sounds';
import { prefersReducedMotion } from '../ui/motion';
import type { GameState } from '../game/types';
import './CardSwapFlight.css';

export interface CardSwapRequest {
  cardIds: [string, string];
  cards: [PlayingCard, PlayingCard];
  owners: [PlayerId, PlayerId];
}

interface CardSwapFlightProps {
  request: CardSwapRequest;
  onComplete: () => void;
}

type SwapPhase = 'idle' | 'lift' | 'cross' | 'land' | 'done';

interface SlotRect { cx: number; cy: number; w: number; h: number }
interface CardEntry { rect: SlotRect; ownerId: PlayerId; card: PlayingCard }

export function buildSwapRequest(state: GameState, swapIds: [string, string]): CardSwapRequest | null {
  const cards: PlayingCard[] = [];
  const owners: PlayerId[] = [];
  for (const id of swapIds) {
    for (const pid of ['player', 'bot'] as PlayerId[]) {
      const c = state.players[pid].pokerHand.find(x => x.id === id);
      if (c) {
        cards.push(c);
        owners.push(pid);
        break;
      }
    }
  }
  if (cards.length < 2) return null;
  return { cardIds: swapIds, cards: [cards[0]!, cards[1]!], owners: [owners[0]!, owners[1]!] };
}

export function CardSwapFlight({ request, onComplete }: CardSwapFlightProps) {
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const entriesRef = useRef<[CardEntry, CardEntry] | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('done');
    onCompleteRef.current();
  };

  useLayoutEffect(() => {
    completedRef.current = false;
    const slots = request.cards.map((card, i) => {
      const ownerId = request.owners[i]!;
      const el = document.querySelector(`[data-slot-anchor="${ownerId}-${card.slotIndex}"]`);
      return { el, ownerId, card };
    });

    if (!slots[0]?.el || !slots[1]?.el) {
      finish();
      return;
    }

    const rects = slots.map(s => {
      const r = s.el!.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    });

    entriesRef.current = [
      { rect: rects[0]!, ownerId: slots[0]!.ownerId, card: slots[0]!.card },
      { rect: rects[1]!, ownerId: slots[1]!.ownerId, card: slots[1]!.card },
    ];

    if (reduced) {
      setPhase('land');
    } else {
      setPhase('idle');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('lift'));
      });
    }
  }, [request, reduced]);

  useEffect(() => {
    if (!entriesRef.current) return;
    if (reduced) {
      playHitCardSound();
      const t = window.setTimeout(finish, 120);
      return () => window.clearTimeout(t);
    }
    if (phase === 'lift') {
      const t = window.setTimeout(() => setPhase('cross'), SWAP_LIFT_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'cross') {
      const t = window.setTimeout(() => setPhase('land'), SWAP_CROSS_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'land') {
      playHitCardSound();
      const t = window.setTimeout(finish, SWAP_LAND_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduced]);

  if (phase === 'done' || !entriesRef.current) return null;

  const [a, b] = entriesRef.current;

  const renderCard = (entry: CardEntry, target: CardEntry, index: number) => {
    const src = entry.rect;
    const dst = target.rect;

    let tx = src.cx;
    let ty = src.cy;
    let extraScale = 1;

    if (phase === 'lift') {
      ty = src.cy - 36;
      extraScale = 1.08;
    } else if (phase === 'cross') {
      tx = dst.cx;
      ty = dst.cy - 36;
      extraScale = 1.08;
    } else if (phase === 'land') {
      tx = dst.cx;
      ty = dst.cy;
      extraScale = 1;
    }

    const scaleX = (phase === 'cross' || phase === 'land' ? dst.w : src.w) / (src.w || 1);
    const scaleY = (phase === 'cross' || phase === 'land' ? dst.h : src.h) / (src.h || 1);

    const dur = phase === 'cross' ? SWAP_CROSS_MS
      : phase === 'land' ? SWAP_LAND_MS
      : SWAP_LIFT_MS;

    const easing = phase === 'cross' ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      : phase === 'land' ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      : 'ease-out';

    const transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%) scale(${scaleX * extraScale}, ${scaleY * extraScale})`;
    const transition = phase !== 'idle'
      ? `transform ${dur}ms ${easing}`
      : 'none';

    return (
      <div
        key={index}
        className={[
          'card-swap-flight',
          `card-swap-flight--${entry.ownerId}`,
          phase === 'cross' && 'card-swap-flight--cross',
        ].filter(Boolean).join(' ')}
        style={{
          width: src.w,
          height: src.h,
          transform,
          transition,
        }}
      >
        <PlayingCardFace card={entry.card} />
      </div>
    );
  };

  return createPortal(
    <div className="card-swap-flight-layer" aria-hidden>
      {renderCard(a, b, 0)}
      {renderCard(b, a, 1)}
    </div>,
    document.body,
  );
}
