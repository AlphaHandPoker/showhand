import { useEffect } from 'react';
import { playShuffleSound, SHUFFLE_DURATION_MS, warmUpGameAudio } from '../audio/sounds';
import './DeckShuffleIntro.css';

interface DeckShuffleIntroProps {
  onComplete: () => void;
}

export function DeckShuffleIntro({ onComplete }: DeckShuffleIntroProps) {
  useEffect(() => {
    warmUpGameAudio();
    playShuffleSound();
    const timer = window.setTimeout(onComplete, SHUFFLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="deck-shuffle-intro"
      role="presentation"
      aria-hidden
      style={{ ['--shuffle-ms' as string]: `${SHUFFLE_DURATION_MS}ms` }}
    >
      <div className="shuffle-stage">
        <div className="shuffle-deck shuffle-deck--left">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`l-${i}`} className="shuffle-card" style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="shuffle-deck shuffle-deck--right">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`r-${i}`} className="shuffle-card" style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="shuffle-glow" />
      </div>
    </div>
  );
}
