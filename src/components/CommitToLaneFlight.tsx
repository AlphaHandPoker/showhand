import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectCard, PlayerId } from '../game/types';
import { EffectCardView } from './Cards';
import { EffectCardBack } from './Cards';
import { prefersReducedMotion } from '../ui/motion';
import { readAnchorRect, readElementRect, type AnchorRect } from '../ui/anchorRect';
import { laneSlotSelector } from '../ui/commitLanes';
import { FLIGHT_EASE } from '../ui/effectTimings';
import './CommitToLaneFlight.css';

export interface CommitToLaneRequest {
  effectId: string;
  effect: EffectCard;
  ownerId: PlayerId;
  laneIndex: number;
  faceDown: boolean;
}

interface Props {
  request: CommitToLaneRequest;
  onComplete: () => void;
}

type Phase = 'prep' | 'start' | 'travel' | 'done';

const FLIGHT_MS = 620;

export function CommitToLaneFlight({ request, onComplete }: Props) {
  const reduced = prefersReducedMotion();
  const [geometry, setGeometry] = useState<{ start: AnchorRect; end: AnchorRect } | null>(null);
  const [phase, setPhase] = useState<Phase>('prep');
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
    setGeometry(null);
    setPhase('prep');

    const start = readAnchorRect(`[data-effect-anchor="${request.ownerId}-${request.effectId}"]`);
    const slot = document.querySelector(laneSlotSelector(request.ownerId, request.laneIndex));
    const end = slot ? readElementRect(slot) : null;

    if (!start || !end) {
      finish();
      return;
    }

    if (reduced) {
      finish();
      return;
    }

    setGeometry({ start, end });
    setPhase('start');

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('travel'));
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [request.effectId, request.ownerId, request.laneIndex, reduced]);

  useEffect(() => {
    if (phase === 'travel') {
      const t = window.setTimeout(finish, FLIGHT_MS);
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
  const transition = phase === 'travel' ? `transform ${FLIGHT_MS}ms ${FLIGHT_EASE}` : 'none';

  const CardFace = request.faceDown
    ? <EffectCardBack readOnly />
    : <EffectCardView card={request.effect} readOnly />;

  return createPortal(
    <div
      className="commit-to-lane-flight"
      style={{ transform, transition, width: start.w, height: start.h }}
      aria-hidden
    >
      {CardFace}
    </div>,
    document.body,
  );
}
