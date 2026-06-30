import { API_BASE } from '../config/api';

export interface TrackMatchPayload {
  user_id: string;
  opponent_type: 'bot' | 'player';
  winner: 'self' | 'opponent' | 'tie';
  rounds_played: number;
  duration_seconds: number;
  effects_used: string[];
}

/** Fire-and-forget match telemetry to Railway Postgres. */
export function trackMatchToServer(payload: TrackMatchPayload): void {
  const url = `${API_BASE}/api/track-match`;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt gameplay.
  });
}
