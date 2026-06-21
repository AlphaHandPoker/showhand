import type { ResolutionItem } from '../game/types';
import { EFFECT_NAMES } from '../game/types';
import './ResolutionFeed.css';

interface ResolutionFeedProps {
  queue: ResolutionItem[];
  completedCount: number;
  isAnimating: boolean;
  latestLog?: string;
}

export function ResolutionFeed({
  queue,
  completedCount,
  isAnimating,
  latestLog,
}: ResolutionFeedProps) {
  if (queue.length === 0) return null;

  return (
    <div className="resolution-feed" aria-live="polite">
      <h4 className="resolution-feed-title">Round çözülüyor</h4>
      <ol className="resolution-feed-list">
        {queue.map((item, i) => {
          const isDone = i < completedCount;
          const isActive = i === completedCount && isAnimating;
          const status = isDone ? 'done' : isActive ? 'active' : 'pending';

          return (
            <li key={`${item.playerId}-${item.action.effectId}-${i}`} className={`resolution-item resolution-item--${status}`}>
              <span className="resolution-item-step">{i + 1}</span>
              <span className="resolution-item-actor">{item.playerId === 'player' ? 'Sen' : 'Bot'}</span>
              <span className="resolution-item-effect">{EFFECT_NAMES[item.action.effectType]}</span>
              {isDone && <span className="resolution-item-check">✓</span>}
              {isActive && <span className="resolution-item-pulse">●</span>}
            </li>
          );
        })}
      </ol>
      {latestLog && (
        <p className={`resolution-latest-log ${isAnimating ? 'is-live' : ''}`}>{latestLog}</p>
      )}
    </div>
  );
}
