import { API_BASE } from '../config/api';

export interface MatchmakingEstimateResponse {
  estimatedSeconds: number;
  maxWaitSeconds: number;
  queueSize: number;
  source: 'instant' | 'historical' | 'default';
  sampleSize: number;
}

export async function fetchMatchmakingEstimate(
  mode: string,
): Promise<MatchmakingEstimateResponse> {
  const res = await fetch(`${API_BASE}/api/matchmaking-estimate?mode=${encodeURIComponent(mode)}`);
  if (!res.ok) {
    return {
      estimatedSeconds: 15,
      maxWaitSeconds: 15,
      queueSize: 0,
      source: 'default',
      sampleSize: 0,
    };
  }
  return res.json() as Promise<MatchmakingEstimateResponse>;
}
