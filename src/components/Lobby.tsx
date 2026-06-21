import { useState } from 'react';
import type { UseOnlineGame } from '../hooks/useOnlineGame';
import './Lobby.css';

interface LobbyProps {
  online: UseOnlineGame;
  onBack: () => void;
}

export function Lobby({ online, onBack }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const { socketConnected, roomState, error, createRoom, joinRoom, leaveRoom, clearError } = online;

  const connectedCount = roomState?.players.filter(p => p.connected).length ?? 0;
  const bothConnected = connectedCount >= 2;
  const inMatch = roomState?.status === 'playing' || roomState?.status === 'finished';
  const inDraft = roomState?.status === 'drafting' || roomState?.status === 'draft_ready';

  if (roomState) {
    if (inMatch) {
      return (
        <div className="lobby-screen">
          <header className="lobby-header">
            <h1>SHOWHAND</h1>
            <p className="lobby-subtitle">Maç yükleniyor…</p>
          </header>
          <p className="lobby-status-message">{roomState.message}</p>
          <p className="lobby-next-step">Oyun tahtası açılmazsa sayfayı yenile (Ctrl+Shift+R).</p>
        </div>
      );
    }

    return (
      <div className="lobby-screen">
        <header className="lobby-header">
          <h1>SHOWHAND</h1>
          <p className="lobby-subtitle">Çevrimiçi oda</p>
        </header>

        <div className="lobby-room-card">
          <span className="lobby-room-label">Oda kodu</span>
          <code className="lobby-room-code">{roomState.code}</code>
          <p className="lobby-room-hint">Arkadaşına bu kodu gönder</p>
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
                  {player.slot === roomState.yourSlot ? 'Sen' : 'Rakip'}
                  {player.slot === 0 ? ' (oda sahibi)' : ''}
                </span>
                <span className="lobby-player-state">
                  {player.connected ? 'Bağlı' : 'Bekleniyor…'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {bothConnected && inDraft && (
          <p className="lobby-next-step">
            İkiniz de bağlandınız — efekt desteni seçmeye hazırsınız.
          </p>
        )}

        {bothConnected && roomState.status === 'waiting' && (
          <p className="lobby-next-step">
            İkiniz de bağlandınız. Draft bir sonraki adımda başlayacak.
          </p>
        )}

        <div className="lobby-actions">
          <button type="button" className="lobby-btn lobby-btn--ghost" onClick={() => { leaveRoom(); onBack(); }}>
            Odadan çık
          </button>
        </div>

        {!socketConnected && (
          <p className="lobby-error">Sunucu bağlantısı kesildi — yeniden bağlanılıyor…</p>
        )}
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      <header className="lobby-header">
        <h1>SHOWHAND</h1>
        <p className="lobby-subtitle">Arkadaşınla oyna</p>
      </header>

      <div className="lobby-panel">
        <div className={`lobby-server-pill ${socketConnected ? 'lobby-server-pill--ok' : ''}`}>
          {socketConnected ? 'Sunucuya bağlı' : 'Sunucuya bağlanılıyor…'}
        </div>

        <button
          type="button"
          className="lobby-btn lobby-btn--primary"
          disabled={!socketConnected}
          onClick={createRoom}
        >
          Oda oluştur
        </button>

        <div className="lobby-divider">
          <span>veya</span>
        </div>

        <label className="lobby-join-label" htmlFor="join-code">
          Oda kodu ile katıl
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
            Katıl
          </button>
        </div>

        {error && <p className="lobby-error" role="alert">{error}</p>}
      </div>

      <button type="button" className="lobby-btn lobby-btn--ghost lobby-back" onClick={onBack}>
        ← Bot maçına dön
      </button>
    </div>
  );
}
