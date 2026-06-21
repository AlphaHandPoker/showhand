import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerId } from '../game/types';
import { SHRED_MS } from '../ui/effectTimings';
import { prefersReducedMotion } from '../ui/motion';
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
  const [rect, setRect] = useState<DOMRect | null>(null);
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
    const el = document.querySelector(`[data-effect-anchor="${request.ownerId}-${request.effectId}"]`);
    if (!el) {
      finish();
      return;
    }
    setRect(el.getBoundingClientRect());
    setPhase(reduced ? 'shred' : 'shake');
  }, [request.effectId, request.ownerId, reduced]);

  useEffect(() => {
    if (!rect) return;
    const shakeMs = reduced ? 0 : 180;
    if (phase === 'shake') {
      const t = window.setTimeout(() => setPhase('shred'), shakeMs);
      return () => window.clearTimeout(t);
    }
    if (phase === 'shred') {
      const t = window.setTimeout(finish, reduced ? 120 : SHRED_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase, rect, reduced]);

  if (phase === 'done' || !rect) return null;

  return createPortal(
    <div
      className={['effect-shred-overlay', phase === 'shake' && 'effect-shred-overlay--shake'].filter(Boolean).join(' ')}
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
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
