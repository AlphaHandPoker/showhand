import type { EffectType } from '../game/types';
import { GameBoard } from './GameBoard';
import type { UseOnlineGame } from '../hooks/useOnlineGame';

interface OnlineGameBoardProps {
  online: UseOnlineGame;
  onLeave: () => void;
}

export function OnlineGameBoard({ online, onLeave }: OnlineGameBoardProps) {
  const payload = online.gamePayload;
  const room = online.roomState;

  if (!payload || !room) {
    return (
      <div className="app online-loading">
        <p>Loading match…</p>
        {online.error && <p className="online-error">{online.error}</p>}
      </div>
    );
  }

  const playerDeck = payload.game.players.player.effectHand.map(c => c.type) as EffectType[];
  const opponentDeck = payload.game.players.bot.effectHand.map(c => c.type) as EffectType[];

  const commit = room.commit;

  return (
    <div className="app">
      {online.error && (
        <div className="online-error-banner" role="alert">
          {online.error}
          <button type="button" onClick={online.clearError}>×</button>
        </div>
      )}
      <GameBoard
        key={room.code}
        playerDeck={playerDeck}
        botDeck={opponentDeck}
        onRestart={onLeave}
        online={{
          youLocked: commit?.youLocked ?? payload.youLocked,
          opponentLocked: commit?.opponentLocked ?? payload.opponentLocked,
          onLockCommit: online.lockCommit,
          onForfeit: online.forfeitMatch,
          onRequestSync: online.requestSync,
          syncedGame: payload.game,
          opponentLabel: 'Opponent',
        }}
      />
    </div>
  );
}
