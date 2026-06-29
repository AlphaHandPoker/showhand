import { useEffect, useRef, useState } from 'react';
import './RoundTimer.css';

const DEFAULT_DURATION_SEC = 30;

interface RoundTimerProps {
  active: boolean;
  round: number;
  onExpire: () => void;
  durationSec?: number;
}

export function RoundTimer({
  active,
  round,
  onExpire,
  durationSec = DEFAULT_DURATION_SEC,
}: RoundTimerProps) {
  const [remainingSec, setRemainingSec] = useState(durationSec);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    setRemainingSec(durationSec);
    expiredRef.current = false;
    const startedAt = Date.now();

    const tick = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, durationSec - elapsed);
      setRemainingSec(left);

      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    }, 100);

    return () => window.clearInterval(tick);
  }, [active, round, durationSec]);

  if (!active) return null;

  const progress = remainingSec / durationSec;
  const displaySec = Math.ceil(remainingSec);
  const urgent = remainingSec <= 10;

  return (
    <div
      className={`round-timer-bar${urgent ? ' round-timer-bar--urgent' : ''}`}
      role="timer"
      aria-live="polite"
      aria-label={`Round timer: ${displaySec} seconds`}
    >
      <div className="round-timer-bar__track" aria-hidden>
        <div
          className="round-timer-bar__fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="round-timer-bar__value">{displaySec}s</span>
    </div>
  );
}
