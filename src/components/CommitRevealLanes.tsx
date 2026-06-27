import type { CommitLaneCard } from '../ui/commitLanes';
import { EffectCardView, EffectCardBack } from './Cards';
import './CommitRevealLanes.css';

interface Props {
  lanes: CommitLaneCard[];
  overlayMaskEffectId?: string | null;
}

export function CommitRevealLanes({ lanes, overlayMaskEffectId = null }: Props) {
  if (lanes.length === 0) return null;

  const playerLanes = lanes.filter(l => l.ownerId === 'player' && !l.consumed);
  const botLanes = lanes.filter(l => l.ownerId === 'bot' && !l.consumed);

  return (
    <div className="commit-reveal-lanes" aria-hidden>
      <div className="commit-lane commit-lane--player">
        {playerLanes.map(card => (
          <CommitLaneSlot key={card.effectId} card={card} overlayMaskEffectId={overlayMaskEffectId} />
        ))}
      </div>
      <div className="commit-lane commit-lane--bot">
        {botLanes.map(card => (
          <CommitLaneSlot key={card.effectId} card={card} overlayMaskEffectId={overlayMaskEffectId} />
        ))}
      </div>
    </div>
  );
}

function CommitLaneSlot({
  card,
  overlayMaskEffectId,
}: {
  card: CommitLaneCard;
  overlayMaskEffectId?: string | null;
}) {
  const showFlip = card.faceDown;
  const overlayMasked = overlayMaskEffectId === card.effectId;

  return (
    <div
      className={[
        'commit-lane-slot',
        card.active ? 'commit-lane-slot--active' : '',
        card.revealed && showFlip ? 'commit-lane-slot--revealed' : '',
      ].filter(Boolean).join(' ')}
      data-commit-lane-slot={`${card.ownerId}-${card.laneIndex}`}
      data-commit-lane-effect={card.effectId}
    >
      {!card.departed && (
        <div
          className={[
            'commit-lane-card',
            overlayMasked ? 'commit-lane-card--masked' : '',
          ].filter(Boolean).join(' ')}
          data-commit-lane-card={card.effectId}
          aria-hidden={overlayMasked || undefined}
        >
          {showFlip ? (
            <div className="commit-lane-flip">
              <div className="commit-lane-face commit-lane-face--back">
                <EffectCardBack readOnly />
              </div>
              <div className="commit-lane-face commit-lane-face--front">
                <EffectCardView card={card.effect} readOnly />
              </div>
            </div>
          ) : (
            <EffectCardView card={card.effect} readOnly />
          )}
        </div>
      )}
    </div>
  );
}
