import { useEffect } from 'react';
import avatarImg from '../assets/avatar-placeholder.png';
import { PlayerAvatar } from './PlayerAvatar';
import './VsIntroScreen.css';

const VS_DURATION_MS = 2000;

interface VsIntroScreenProps {
  opponentLabel?: string;
  onComplete: () => void;
}

export function VsIntroScreen({ opponentLabel = 'Bot', onComplete }: VsIntroScreenProps) {
  useEffect(() => {
    const t = window.setTimeout(onComplete, VS_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="vs-intro-screen" aria-hidden>
      <div className="vs-intro-backdrop" />
      <div className="vs-intro-content">
        <div className="vs-intro-side vs-intro-side--player">
          <PlayerAvatar label="Sen" size="large" src={avatarImg} className="vs-intro-avatar" />
        </div>
        <div className="vs-intro-vs">
          <span className="vs-intro-vs-text">VS</span>
        </div>
        <div className="vs-intro-side vs-intro-side--opponent">
          <PlayerAvatar label={opponentLabel} size="large" src={avatarImg} className="vs-intro-avatar" />
        </div>
      </div>
    </div>
  );
}
