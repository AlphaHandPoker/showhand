import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectCard } from '../game/types';
import { EffectCardView } from './Cards';
import { prefersReducedMotion } from '../ui/motion';
import { readElementRect, readCastCenterRect, type AnchorRect } from '../ui/anchorRect';
import {
  EFFECT_TO_SLOT_MS,
  FLIGHT_EASE,
} from '../ui/effectTimings';
import './EffectToSlotFlight.css';

export interface FlightRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface EffectToSlotRequest {
  effectId: string;
  effect: EffectCard;
  toSlotKey: string;
  from: 'center' | 'hand';
  fromRect?: FlightRect | null;
}

interface Props {
  request: EffectToSlotRequest;
  onComplete: () => void;
  onDepart?: () => void;
}

type Phase = 'prep' | 'start' | 'travel' | 'done';

function resolveStartRect(request: EffectToSlotRequest): AnchorRect | null {
  if (request.fromRect) return request.fromRect;

  if (request.from === 'center') {
    const source = document.querySelector('[data-cast-flight-source] .effect-card');
    if (source) return readElementRect(source);
    return readCastCenterRect();
  }

  return readCastCenterRect();
}

export function EffectToSlotFlight({ request, onComplete, onDepart }: Props) {
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

    const slot = document.querySelector(
      `[data-token-slot-anchor="${request.toSlotKey}"]`,
    );
    if (!slot) {
      finish();
      return;
    }

    const start = resolveStartRect(request);
    if (!start) {
      finish();
      return;
    }

    const sr = slot.getBoundingClientRect();
    const end = readElementRect(slot) ?? {
      cx: sr.left + sr.width / 2,
      cy: sr.top + sr.height / 2,
      w: sr.width,
      h: sr.height,
    };

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
  }, [request.effectId, request.toSlotKey, request.from, request.fromRect, reduced]);

  useEffect(() => {
    if (phase === 'travel') {
      const t = window.setTimeout(finish, EFFECT_TO_SLOT_MS);
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
    ? `transform ${EFFECT_TO_SLOT_MS}ms ${FLIGHT_EASE}`
    : 'none';

  return createPortal(
    <div
      className="effect-to-slot-flight"
      style={{
        transform,
        transition,
        width: start.w,
        height: start.h,
      }}
      aria-hidden
    >
      <EffectCardView card={request.effect} readOnly />
    </div>,
    document.body,
  );
}
