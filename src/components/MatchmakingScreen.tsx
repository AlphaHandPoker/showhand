import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseOnlineGame } from '../hooks/useOnlineGame';
import { DEFAULT_GAME_MODE } from '../game/gameModes';
import { GAME_NAME } from '../config/brand';
import { AnalyticsEvents } from '../analytics';
import { fetchMatchmakingEstimate, type MatchmakingEstimateResponse } from '../api/matchmakingEstimate';
import './MatchmakingScreen.css';

/** Time in queue after socket is connected (not from screen mount). */
export const MATCHMAKING_MAX_WAIT_SEC = 15;
const SEARCH_DURATION_MS = MATCHMAKING_MAX_WAIT_SEC * 1000;

interface MatchmakingScreenProps {
  online: UseOnlineGame;
  onMatched: () => void;
  onFallbackToBot: () => void;
}

function formatEstimateText(estimate: MatchmakingEstimateResponse | null): string {
  if (!estimate) return 'Calculating…';

  if (estimate.source === 'instant') {
    return 'Another player is waiting — match should be instant';
  }

  const sec = estimate.estimatedSeconds;
  if (sec <= 10) return `Estimated wait: ~${sec} seconds`;
  if (sec < 60) return `Estimated wait: ~${sec} seconds`;
  const min = Math.round(sec / 60);
  return `Estimated wait: ~${min} min`;
}

export function MatchmakingScreen({ online, onMatched, onFallbackToBot }: MatchmakingScreenProps) {
  const resolvedRef = useRef(false);
  const searchStartedRef = useRef(false);
  const searchStartedAtRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const [estimate, setEstimate] = useState<MatchmakingEstimateResponse | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

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

  const refreshEstimate = useCallback(() => {
    void fetchMatchmakingEstimate(DEFAULT_GAME_MODE).then(setEstimate);
  }, []);

  useEffect(() => {
    if (!online.socketConnected) {
      searchStartedRef.current = false;
      searchStartedAtRef.current = null;
      clearSearchTimeout();
      return;
    }
    if (searchStartedRef.current) return;
    searchStartedRef.current = true;
    searchStartedAtRef.current = Date.now();
    AnalyticsEvents.matchmakingStarted();
    onlineRef.current.findMatch(DEFAULT_GAME_MODE);
    scheduleFallback();
    refreshEstimate();
  }, [online.socketConnected, scheduleFallback, clearSearchTimeout, refreshEstimate]);

  useEffect(() => {
    if (!searchStartedAtRef.current || resolvedRef.current) return;

    const tick = () => {
      const started = searchStartedAtRef.current;
      if (!started) return;
      setElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [online.socketConnected]);

  useEffect(() => {
    if (!online.socketConnected || resolvedRef.current) return;
    const id = window.setInterval(refreshEstimate, 5000);
    return () => window.clearInterval(id);
  }, [online.socketConnected, refreshEstimate]);

  useEffect(() => {
    if (resolvedRef.current) return;

    const rs = online.roomState;
    if (!rs) return;

    const bothConnected = rs.players.filter(p => p.connected).length >= 2;
    if (!bothConnected) return;

    if (rs.status === 'playing' || rs.status === 'drafting' || rs.status === 'draft_ready') {
      resolvedRef.current = true;
      clearSearchTimeout();
      const started = searchStartedAtRef.current ?? Date.now();
      const waitSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));
      AnalyticsEvents.matchFound(DEFAULT_GAME_MODE, waitSeconds);
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

  const maxWait = estimate?.maxWaitSeconds ?? MATCHMAKING_MAX_WAIT_SEC;

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
        <p className="matchmaking-estimate">{formatEstimateText(estimate)}</p>
        <p className="matchmaking-estimate-meta">
          {elapsedSec > 0 && <span>{elapsedSec}s elapsed · </span>}
          If no player in {maxWait}s, you&apos;ll play vs bot
        </p>

        <div className="matchmaking-dots" aria-hidden>
          <span className="matchmaking-dot" />
          <span className="matchmaking-dot" />
          <span className="matchmaking-dot" />
        </div>
      </div>
    </div>
  );
}
