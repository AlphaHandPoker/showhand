import type { CastAnimation } from '../ui/detectAnimations';
import { EFFECT_NAMES } from '../game/types';
import { EffectCardView } from './Cards';
import './EffectCastOverlay.css';

interface EffectCastOverlayProps {
  cast: CastAnimation;
  phase: 'present' | 'target' | 'fly' | 'result';
}

export function EffectCastOverlay({ cast, phase }: EffectCastOverlayProps) {
  const fromBottom = cast.playerId === 'player';
  const actorLabel = cast.playerId === 'player' ? 'Sen' : 'Bot';
  const effectName = cast.effect ? EFFECT_NAMES[cast.effect.type] : 'Deste';

  if (phase === 'result') {
    return (
      <div className={`effect-cast-overlay phase-result ${fromBottom ? 'from-player' : 'from-bot'}`}>
        <div className="cast-backdrop cast-backdrop--light" />
        <div className="cast-result-panel">
          <p className="cast-result-headline">{effectName}</p>
          <p className="cast-result-actor">{actorLabel}</p>
          {cast.logMessage && (
            <p className="cast-result-label">{cast.logMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'present' || phase === 'fly') {
    return (
      <div className={`effect-cast-overlay phase-${phase} ${fromBottom ? 'from-player' : 'from-bot'}`}>
        <div className="cast-backdrop cast-backdrop--light" />
        {phase === 'present' && cast.effect && (
          <div className="cast-card-wrapper cast-card-wrapper--center">
            <EffectCardView card={cast.effect} large castGlow />
            <p className="cast-effect-name">{effectName}</p>
            <p className="cast-player-label">{actorLabel} oynuyor…</p>
          </div>
        )}
      </div>
    );
  }

  const isTarget = phase === 'target';

  return (
    <div className={`effect-cast-overlay phase-${phase} ${fromBottom ? 'from-player' : 'from-bot'}`}>
      <div className={`cast-backdrop ${isTarget ? 'cast-backdrop--light' : ''}`} />
      <div
        className={`cast-card-wrapper cast-card-wrapper--center ${isTarget ? 'cast-card-wrapper--target' : ''}`}
        data-cast-flight-source
      >
        {cast.stepIndex !== undefined && cast.stepTotal !== undefined && (
          <span className="cast-step-badge">
            Hamle {cast.stepIndex} / {cast.stepTotal}
          </span>
        )}
        {cast.effect && (
          <EffectCardView card={cast.effect} large castGlow={!isTarget} />
        )}
        <p className="cast-effect-name">{effectName}</p>
        <p className="cast-player-label">
          {isTarget ? 'Hedef gösteriliyor…' : `${actorLabel} oynuyor…`}
        </p>
      </div>
    </div>
  );
}
