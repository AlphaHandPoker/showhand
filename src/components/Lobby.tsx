import { useState } from 'react';
import type { GameMode } from '../game/types';
import { GAME_MODE_INFO } from '../game/gameModes';
import type { UseOnlineGame } from '../hooks/useOnlineGame';
import './Lobby.css';
import './GameModePicker.css';

interface LobbyProps {
  online: UseOnlineGame;
  createMode: GameMode;
  onBack: () => void;
}

export function Lobby({ online, createMode, onBack }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const { socketConnected, roomState, error, createRoom, joinRoom, leaveRoom, clearError } = online;

  const connectedCount = roomState?.players.filter(p => p.connected).length ?? 0;
  const bothConnected = connectedCount >= 2;
  const inMatch = roomState?.status === 'playing' || roomState?.status === 'finished';
  const inDraft = roomState?.status === 'drafting' || roomState?.status === 'draft_ready';
  const roomMode = roomState?.gameMode ?? createMode;
  const modeInfo = GAME_MODE_INFO[roomMode];

  if (roomState) {
    if (inMatch) {
      return (
        <div className="lobby-screen">
          <header className="lobby-header">
            <h1>SHOWHAND</h1>
            <p className="lobby-subtitle">Loading match…</p>
          </header>
          <p className="lobby-status-message">{roomState.message}</p>
          <p className="lobby-next-step">If the board does not load, hard refresh (Ctrl+Shift+R).</p>
        </div>
      );
    }

    return (
      <div className="lobby-screen">
        <header className="lobby-header">
          <h1>SHOWHAND</h1>
          <p className="lobby-subtitle">Online room</p>
        </header>

        <div className="lobby-room-card">
          <span className="lobby-room-label">Room code</span>
          <code className="lobby-room-code">{roomState.code}</code>
          <span className="lobby-mode-badge">{modeInfo.title}</span>
          <p className="lobby-room-hint">Send this code to your friend</p>
        </div>

        <div className={`lobby-status ${bothConnected ? 'lobby-status--ready' : ''}`}>
          <p className="lobby-status-message">{roomState.message}</p>
          <div className="lobby-players">
            {roomState.players.map(player => (
              <div
                key={player.slot}
                className={[
                  'lobby-player',
                  player.connected ? 'lobby-player--connected' : 'lobby-player--empty',
                  player.slot === roomState.yourSlot ? 'lobby-player--you' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="lobby-player-dot" aria-hidden />
                <span className="lobby-player-label">
                  {player.slot === roomState.yourSlot ? 'You' : 'Opponent'}
                  {player.slot === 0 ? ' (host)' : ''}
                </span>
                <span className="lobby-player-state">
                  {player.connected ? 'Connected' : 'Waiting…'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {bothConnected && inDraft && (
          <p className="lobby-next-step">
            Both connected — ready to pick your effect decks.
          </p>
        )}

        {bothConnected && roomState.status === 'waiting' && roomMode === 'full_deck' && (
          <p className="lobby-next-step">
            Both connected — match starting…
          </p>
        )}

        {bothConnected && roomState.status === 'waiting' && roomMode === 'draft' && (
          <p className="lobby-next-step">
            Both connected. Draft starts next.
          </p>
        )}

        <div className="lobby-actions">
          <button type="button" className="lobby-btn lobby-btn--ghost" onClick={() => { leaveRoom(); onBack(); }}>
            Leave room
          </button>
        </div>

        {!socketConnected && (
          <p className="lobby-error">Server disconnected — reconnecting…</p>
        )}
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <h1>SHOWHAND</h1>
        <p className="lobby-subtitle">Play with a friend</p>
      </header>

      <div className="lobby-panel">
        <div className={`lobby-server-pill ${socketConnected ? 'lobby-server-pill--ok' : ''}`}>
          {socketConnected ? 'Connected to server' : 'Connecting to server…'}
        </div>

        <div className="lobby-mode-select">
          <span className="lobby-mode-label">Selected mode</span>
          <span className="lobby-mode-badge">{modeInfo.title}</span>
          <span className="lobby-room-hint">{modeInfo.subtitle}</span>
        </div>

        <button
          type="button"
          className="lobby-btn lobby-btn--primary"
          disabled={!socketConnected}
          onClick={() => createRoom(createMode)}
        >
          Create room
        </button>

        <div className="lobby-divider">
          <span>or</span>
        </div>

        <label className="lobby-join-label" htmlFor="join-code">
          Join with room code
        </label>
        <div className="lobby-join-row">
          <input
            id="join-code"
            className="lobby-join-input"
            type="text"
            placeholder="SHOW-AB12"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); clearError(); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && joinCode.trim()) joinRoom(joinCode);
            }}
            disabled={!socketConnected}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="lobby-btn lobby-btn--secondary"
            disabled={!socketConnected || !joinCode.trim()}
            onClick={() => joinRoom(joinCode)}
          >
            Join
          </button>
        </div>

        {error && <p className="lobby-error" role="alert">{error}</p>}
      </div>

      <button type="button" className="lobby-btn lobby-btn--ghost lobby-back" onClick={onBack}>
        ← Back to bot match
      </button>
    </div>
  );
}
