import { useSimulatedOnlineCount } from '../hooks/useSimulatedOnlineCount';
import './OnlinePlayersBadge.css';

export function OnlinePlayersBadge() {
  const count = useSimulatedOnlineCount();

  return (
    <div className="online-players-badge" aria-label={`About ${count} players online`}>
      <span className="online-players-badge__dot" aria-hidden />
      <span className="online-players-badge__count">{count}</span>
      <span className="online-players-badge__label">online</span>
    </div>
  );
}
