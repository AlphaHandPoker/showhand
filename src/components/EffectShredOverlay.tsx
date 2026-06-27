import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerId } from '../game/types';
import { SHRED_MS } from '../ui/effectTimings';
import { prefersReducedMotion } from '../ui/motion';
import { readEffectAnchorRect, type AnchorRect } from '../ui/anchorRect';
import './EffectShredOverlay.css';

export interface EffectShredRequest {
  effectId: string;
  ownerId: PlayerId;
}

interface EffectShredOverlayProps {
  request: EffectShredRequest;
  onComplete: () => void;
}

export function EffectShredOverlay({ request, onComplete }: EffectShredOverlayProps) {
  const reduced = prefersReducedMotion();
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [phase, setPhase] = useState<'shake' | 'shred' | 'done'>('shake');
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
    setAnchor(null);

    let raf = 0;

    const applyStart = (start: AnchorRect) => {
      setAnchor(start);
      setPhase(reduced ? 'shred' : 'shake');
    };

    const measure = () =>
      readEffectAnchorRect(request.ownerId, request.effectId);

    const start = measure();
    if (start) {
      applyStart(start);
      return;
    }

    raf = requestAnimationFrame(() => {
      const retry = measure();
      if (!retry) {
        finish();
        return;
      }
      applyStart(retry);
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [request.effectId, request.ownerId, reduced]);

  useEffect(() => {
    if (!anchor) return;
    const shakeMs = reduced ? 0 : 180;
    if (phase === 'shake') {
      const t = window.setTimeout(() => setPhase('shred'), shakeMs);
      return () => window.clearTimeout(t);
    }
    if (phase === 'shred') {
      const t = window.setTimeout(finish, reduced ? 120 : SHRED_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase, anchor, reduced]);

  if (phase === 'done' || !anchor) return null;

  return createPortal(
    <div
      className={['effect-shred-overlay', phase === 'shake' && 'effect-shred-overlay--shake'].filter(Boolean).join(' ')}
      style={{
        left: anchor.cx,
        top: anchor.cy,
        width: anchor.w,
        height: anchor.h,
      }}
      aria-hidden
    >
      {phase === 'shred' && (
        <>
          <span className="shred-piece shred-piece--1" />
          <span className="shred-piece shred-piece--2" />
          <span className="shred-piece shred-piece--3" />
          <span className="shred-piece shred-piece--4" />
        </>
      )}
    </div>,
    document.body,
  );
}
