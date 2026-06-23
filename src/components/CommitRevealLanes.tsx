import type { CommitLaneCard } from '../ui/commitLanes';
import { EffectCardView, EffectCardBack } from './Cards';
import './CommitRevealLanes.css';

interface Props {
  lanes: CommitLaneCard[];
}

export function CommitRevealLanes({ lanes }: Props) {
  if (lanes.length === 0) return null;

  const playerLanes = lanes.filter(l => l.ownerId === 'player' && !l.consumed);
  const botLanes = lanes.filter(l => l.ownerId === 'bot' && !l.consumed);

  return (
    <div className="commit-reveal-lanes" aria-hidden>
      <div className="commit-lane commit-lane--player">
        {playerLanes.map(card => (
          <CommitLaneSlot key={card.effectId} card={card} />
        ))}
      </div>
      <div className="commit-lane commit-lane--bot">
        {botLanes.map(card => (
          <CommitLaneSlot key={card.effectId} card={card} />
        ))}
      </div>
    </div>
  );
}

function CommitLaneSlot({ card }: { card: CommitLaneCard }) {
  const showFlip = card.faceDown;
  const showCard = !card.departed;

  return (
    <div
      className={[
        'commit-lane-slot',
        card.active ? 'commit-lane-slot--active' : '',
        card.revealed && showFlip ? 'commit-lane-slot--revealed' : '',
      ].filter(Boolean).join(' ')}
      data-commit-lane-slot={`${card.ownerId}-${card.laneIndex}`}
    >
      {showCard && (
        <div className="commit-lane-card" data-commit-lane-card={card.effectId}>
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
