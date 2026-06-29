import { useEffect, useRef } from 'react';
import type { UseOnlineGame } from '../hooks/useOnlineGame';
import { DEFAULT_GAME_MODE } from '../game/gameModes';
import './MatchmakingScreen.css';

const SEARCH_DURATION_MS = 8000;

interface MatchmakingScreenProps {
  online: UseOnlineGame;
  onMatched: () => void;
  onFallbackToBot: () => void;
}

export function MatchmakingScreen({ online, onMatched, onFallbackToBot }: MatchmakingScreenProps) {
  const resolvedRef = useRef(false);
  const searchStartedRef = useRef(false);

  useEffect(() => {
    if (!online.socketConnected || searchStartedRef.current) return;
    searchStartedRef.current = true;
    online.findMatch(DEFAULT_GAME_MODE);
  }, [online, online.socketConnected]);

  useEffect(() => {
    if (resolvedRef.current) return;

    const rs = online.roomState;
    if (!rs) return;

    const bothConnected = rs.players.filter(p => p.connected).length >= 2;
    if (!bothConnected) return;

    if (rs.status === 'playing' || rs.status === 'drafting' || rs.status === 'draft_ready') {
      resolvedRef.current = true;
      onMatched();
    }
  }, [online.roomState, onMatched]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      online.cancelFindMatch();
      onFallbackToBot();
    }, SEARCH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [online, onFallbackToBot]);

  useEffect(() => {
    return () => {
      if (!resolvedRef.current) {
        online.cancelFindMatch();
      }
    };
  }, [online]);

  return (
    <div className="matchmaking-screen">
      <header className="matchmaking-header">
        <h1>SHOWHAND</h1>
      </header>

      <div className="matchmaking-body">
        <div className="matchmaking-radar" aria-hidden>
          <span className="matchmaking-radar-ring matchmaking-radar-ring--1" />
          <span className="matchmaking-radar-ring matchmaking-radar-ring--2" />
          <span className="matchmaking-radar-ring matchmaking-radar-ring--3" />
          <span className="matchmaking-radar-core" />
        </div>

        <p className="matchmaking-status">Searching for opponent…</p>

        <div className="matchmaking-dots" aria-hidden>
          <span className="matchmaking-dot" />
          <span className="matchmaking-dot" />
          <span className="matchmaking-dot" />
        </div>
      </div>
    </div>
  );
}
