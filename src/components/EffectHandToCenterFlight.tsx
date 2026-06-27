import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectCard, PlayerId } from '../game/types';
import { EffectCardView } from './Cards';
import { prefersReducedMotion } from '../ui/motion';
import { readEffectAnchorRect, readCastCenterRect, type AnchorRect } from '../ui/anchorRect';
import {
  FLIGHT_EASE,
  HAND_TO_CENTER_MS,
} from '../ui/effectTimings';
import './EffectHandToCenterFlight.css';

export interface EffectHandToCenterRequest {
  effectId: string;
  effect: EffectCard;
  fromOwnerId: PlayerId;
}

interface Props {
  request: EffectHandToCenterRequest;
  onComplete: () => void;
  onDepart?: () => void;
}

type Phase = 'prep' | 'start' | 'travel' | 'done';

export function EffectHandToCenterFlight({ request, onComplete, onDepart }: Props) {
  const reduced = prefersReducedMotion();
  const [geometry, setGeometry] = useState<{ start: AnchorRect; end: AnchorRect } | null>(null);
  const [phase, setPhase] = useState<Phase>('prep');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onDepartRef = useRef(onDepart);
  onCompleteRef.current = onComplete;
  onDepartRef.current = onDepart;

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('done');
    onCompleteRef.current();
  };

  useLayoutEffect(() => {
    completedRef.current = false;
    setGeometry(null);
    setPhase('prep');

    const start = readEffectAnchorRect(request.fromOwnerId, request.effectId);
    if (!start) {
      finish();
      return;
    }

    const end = readCastCenterRect();

    if (reduced) {
      finish();
      return;
    }

    setGeometry({ start, end });
    onDepartRef.current?.();
    setPhase('start');

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('travel'));
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [request.effectId, request.fromOwnerId, reduced]);

  useEffect(() => {
    if (phase === 'travel') {
      const t = window.setTimeout(finish, HAND_TO_CENTER_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  if (phase === 'done' || phase === 'prep' || !geometry) return null;

  const { start, end } = geometry;
  const atEnd = phase === 'travel';
  const target = atEnd ? end : start;

  const scaleX = target.w / (start.w || 1);
  const scaleY = target.h / (start.h || 1);

  const transform = `translate3d(${target.cx}px, ${target.cy}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
  const transition = phase === 'travel'
    ? `transform ${HAND_TO_CENTER_MS}ms ${FLIGHT_EASE}`
    : 'none';

  return createPortal(
    <div
      className="effect-hand-to-center-flight"
      style={{ transform, transition, width: start.w, height: start.h }}
      aria-hidden
    >
      <EffectCardView card={request.effect} readOnly />
    </div>,
    document.body,
  );
}
