import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectCard, PlayerId } from '../game/types';
import { EffectCardView } from './Cards';
import { prefersReducedMotion } from '../ui/motion';
import { readEffectAnchorRect, type AnchorRect } from '../ui/anchorRect';
import { FORCE_SHRED_HOLD_MS, FORCE_SHRED_MS } from '../ui/effectTimings';
import './ForceDeleteOverlay.css';

export interface ForceDeleteRequest {
  victimEffect: EffectCard;
  victimOwnerId: PlayerId;
}

interface Props {
  request: ForceDeleteRequest;
  onComplete: () => void;
}

type Phase = 'prep' | 'shred-hold' | 'shredding' | 'done';

export function ForceDeleteOverlay({ request, onComplete }: Props) {
  const reduced = prefersReducedMotion();
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [phase, setPhase] = useState<Phase>('prep');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isOwnCard = request.victimOwnerId === 'player';

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
      setPhase(reduced ? 'shredding' : 'shred-hold');
    };

    const measure = () =>
      readEffectAnchorRect(request.victimOwnerId, request.victimEffect.id);

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
  }, [request.victimEffect.id, request.victimOwnerId, reduced]);

  useEffect(() => {
    if (phase === 'shred-hold') {
      const t = window.setTimeout(() => setPhase('shredding'), FORCE_SHRED_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'shredding') {
      const dur = reduced ? 200 : FORCE_SHRED_MS;
      const t = window.setTimeout(finish, dur);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduced]);

  if (phase === 'done' || phase === 'prep' || !anchor) return null;

  const transform = `translate3d(${anchor.cx}px, ${anchor.cy}px, 0) translate(-50%, -50%)`;

  const cardNode = (
    <EffectCardView
      card={request.victimEffect}
      hidden={!isOwnCard}
      disabled
      large={!isOwnCard}
    />
  );

  const shredding = phase === 'shredding';

  return createPortal(
    <div className="force-delete-overlay" aria-hidden>
      <div className="force-delete-dim" />
      <div
        className={[
          'force-delete-victim',
          shredding && 'force-delete-victim--shredding',
          isOwnCard && 'force-delete-victim--own',
        ].filter(Boolean).join(' ')}
        style={{
          width: anchor.w,
          height: anchor.h,
          transform,
          ['--force-shred-ms' as string]: `${FORCE_SHRED_MS}ms`,
        }}
      >
        {!shredding ? (
          <div className="force-delete-victim-inner">{cardNode}</div>
        ) : (
          <>
            <div className="force-delete-half force-delete-half--left">
              <div className="force-delete-half-inner">{cardNode}</div>
            </div>
            <div className="force-delete-half force-delete-half--right">
              <div className="force-delete-half-inner">{cardNode}</div>
            </div>
            <div className="force-delete-tear-line" />
            <div className="force-delete-burst" aria-hidden />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
