import { useCallback, useEffect, useRef } from 'react';
import type { UseOnlineGame } from '../hooks/useOnlineGame';
import { DEFAULT_GAME_MODE } from '../game/gameModes';
import { GAME_NAME } from '../config/brand';
import './MatchmakingScreen.css';

/** Time in queue after socket is connected (not from screen mount). */
const SEARCH_DURATION_MS = 15000;

interface MatchmakingScreenProps {
  online: UseOnlineGame;
  onMatched: () => void;
  onFallbackToBot: () => void;
}

export function MatchmakingScreen({ online, onMatched, onFallbackToBot }: MatchmakingScreenProps) {
  const resolvedRef = useRef(false);
  const searchStartedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const clearSearchTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const scheduleFallback = useCallback(() => {
    clearSearchTimeout();
    timeoutRef.current = window.setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      onlineRef.current.cancelFindMatch();
      onFallbackToBot();
    }, SEARCH_DURATION_MS);
  }, [clearSearchTimeout, onFallbackToBot]);

  useEffect(() => {
    if (!online.socketConnected) {
      searchStartedRef.current = false;
      clearSearchTimeout();
      return;
    }
    if (searchStartedRef.current) return;
    searchStartedRef.current = true;
    onlineRef.current.findMatch(DEFAULT_GAME_MODE);
    scheduleFallback();
  }, [online.socketConnected, scheduleFallback, clearSearchTimeout]);

  useEffect(() => {
    if (resolvedRef.current) return;

    const rs = online.roomState;
    if (!rs) return;

    const bothConnected = rs.players.filter(p => p.connected).length >= 2;
    if (!bothConnected) return;

    if (rs.status === 'playing' || rs.status === 'drafting' || rs.status === 'draft_ready') {
      resolvedRef.current = true;
      clearSearchTimeout();
      onMatched();
    }
  }, [online.roomState, onMatched, clearSearchTimeout]);

  useEffect(() => {
    return () => {
      clearSearchTimeout();
      if (!resolvedRef.current) {
        onlineRef.current.cancelFindMatch();
      }
    };
  }, [clearSearchTimeout]);

  return (
    <div className="matchmaking-screen">
      <header className="matchmaking-header">
        <h1>{GAME_NAME}</h1>
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
