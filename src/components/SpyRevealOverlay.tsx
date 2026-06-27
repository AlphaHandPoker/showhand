import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EffectCard, PlayerId } from '../game/types';
import { EFFECT_NAMES } from '../game/types';
import { EffectCardView } from './Cards';
import { prefersReducedMotion } from '../ui/motion';
import { readEffectAnchorRect, type AnchorRect } from '../ui/anchorRect';
import { SPY_FLIP_MS, SPY_REVEAL_HOLD_MS } from '../ui/effectTimings';
import './SpyRevealOverlay.css';

export interface SpyRevealRequest {
  victimEffect: EffectCard;
  victimOwnerId: PlayerId;
}

interface Props {
  request: SpyRevealRequest;
  onComplete: () => void;
}

type Phase = 'prep' | 'spin' | 'hold' | 'done';

function phaseCaption(phase: Phase, effectName: string, isOwnCard: boolean): string {
  switch (phase) {
    case 'spin':
      return isOwnCard ? 'Kartın açığa çıkıyor…' : `${effectName} açılıyor…`;
    case 'hold':
      return isOwnCard ? 'Rakip bu kartı gördü!' : `Rakibin efekti: ${effectName}`;
    default:
      return 'Casus';
  }
}

export function SpyRevealOverlay({ request, onComplete }: Props) {
  const reduced = prefersReducedMotion();
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [phase, setPhase] = useState<Phase>('prep');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const effectName = EFFECT_NAMES[request.victimEffect.type];
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
    setPhase('prep');

    let raf = 0;

    const applyStart = (start: AnchorRect) => {
      setAnchor(start);
      if (reduced) {
        setPhase('hold');
      } else {
        setPhase('spin');
      }
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
    if (phase === 'spin') {
      const t = window.setTimeout(() => setPhase('hold'), SPY_FLIP_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === 'hold') {
      const dur = reduced ? 180 : SPY_REVEAL_HOLD_MS;
      const t = window.setTimeout(finish, dur);
      return () => window.clearTimeout(t);
    }
  }, [phase, reduced]);

  if (phase === 'done' || phase === 'prep' || !anchor) return null;

  const transform = `translate3d(${anchor.cx}px, ${anchor.cy}px, 0) translate(-50%, -50%)`;
  const spinning = phase === 'spin';
  const holding = phase === 'hold';

  return createPortal(
    <div className="spy-reveal-overlay" aria-hidden>
      <div className={`spy-reveal-spotlight ${holding ? 'spy-reveal-spotlight--hold' : ''}`} />
      <div
        className="spy-reveal-caption"
        style={{ left: anchor.cx, top: Math.max(12, anchor.cy - anchor.h * 0.5 - 52) }}
      >
        <span className="spy-reveal-caption-title">Casus</span>
        <span className="spy-reveal-caption-sub">
          {phaseCaption(phase, effectName, isOwnCard)}
        </span>
      </div>
      <div
        className={[
          'spy-reveal-victim',
          spinning && 'spy-reveal-victim--spin',
          holding && 'spy-reveal-victim--hold',
          isOwnCard && 'spy-reveal-victim--own',
        ].filter(Boolean).join(' ')}
        style={{
          width: anchor.w,
          height: anchor.h,
          transform,
        }}
      >
        <div
          className="spy-reveal-victim-inner"
          style={{ ['--spy-flip-ms' as string]: `${SPY_FLIP_MS}ms` }}
        >
          <div className="spy-reveal-back">
            <EffectCardView card={request.victimEffect} hidden />
          </div>
          <div className="spy-reveal-face">
            <EffectCardView card={request.victimEffect} disabled large />
          </div>
        </div>
        {holding && (
          <div className="spy-reveal-mark" aria-hidden>
            <span className="spy-reveal-mark-icon">👁</span>
            <span className="spy-reveal-mark-text">Rakip görüyor</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
