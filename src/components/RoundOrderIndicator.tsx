import { useEffect, useState } from 'react';
import type { GameState } from '../game/types';
import { getResolutionOrder } from '../game/gameEngine';
import './RoundOrderIndicator.css';

interface RoundOrderIndicatorProps {
  game: GameState;
  resolving: boolean;
  opponentLabel?: string;
  variant?: 'default' | 'rail';
}

export function RoundOrderIndicator({
  game,
  resolving,
  opponentLabel = 'Rakip',
  variant = 'default',
}: RoundOrderIndicatorProps) {
  const [highlight, setHighlight] = useState(true);

  const order = getResolutionOrder(game);
  const playerFirst = order[0] === 'player';

  useEffect(() => {
    if (game.phase !== 'committing') return;
    setHighlight(true);
    const t = window.setTimeout(() => setHighlight(false), 1500);
    return () => window.clearTimeout(t);
  }, [game.currentRound, game.phase]);

  if (resolving || game.phase === 'finished' || game.phase !== 'committing') return null;

  const label = playerFirst ? 'Sen önce' : `${opponentLabel} önce`;

  return (
    <section
      className={[
        'round-order-sidebar',
        variant === 'rail' && 'round-order-sidebar--rail',
        highlight && 'round-order-sidebar--highlight',
        playerFirst ? 'round-order-sidebar--player' : 'round-order-sidebar--opponent',
      ].join(' ')}
      aria-label="Bu round çözülme sırası"
    >
      <h3 className="round-order-sidebar-title">Çözülme sırası</h3>
      <p className="round-order-sidebar-value">
        <span className="round-order-dot" aria-hidden />
        {label}
      </p>
    </section>
  );
}
