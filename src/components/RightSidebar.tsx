import type { ReactNode } from 'react';
import { PlayerAvatar } from './PlayerAvatar';
import { RoundOrderIndicator } from './RoundOrderIndicator';
import type { GameState, PlayerId } from '../game/types';
import './RightSidebar.css';
import './RoundOrderIndicator.css';

interface Props {
  opponentLabel: string;
  isFinished: boolean;
  winner: PlayerId | 'tie' | null;
  game: GameState;
  resolving: boolean;
  actions?: ReactNode;
}

export function RightSidebar({
  opponentLabel,
  isFinished,
  winner,
  game,
  resolving,
  actions,
}: Props) {
  return (
    <aside className="right-sidebar" aria-label="Oyuncu portreleri">
      <header className="right-sidebar-header">
        <RoundOrderIndicator
          game={game}
          resolving={resolving}
          opponentLabel={opponentLabel}
          variant="rail"
        />
      </header>

      <div className="right-sidebar-top">
        <PlayerAvatar
          label={opponentLabel}
          className="right-sidebar-avatar"
          winner={isFinished && winner === 'bot'}
          loser={isFinished && winner === 'player'}
        />
      </div>

      <div className="right-sidebar-actions">
        {actions}
      </div>

      <div className="right-sidebar-bottom">
        <PlayerAvatar
          label="Sen"
          className="right-sidebar-avatar"
          winner={isFinished && winner === 'player'}
          loser={isFinished && winner === 'bot'}
        />
      </div>
    </aside>
  );
}
