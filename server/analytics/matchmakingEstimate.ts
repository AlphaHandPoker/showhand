import type { GameMode } from '../../src/game/types.js';
import { getPool } from './db.js';

const DEFAULT_WAIT_SEC = 15;
const INSTANT_WAIT_SEC = 5;

export interface MatchmakingEstimate {
  estimatedSeconds: number;
  maxWaitSeconds: number;
  queueSize: number;
  source: 'instant' | 'historical' | 'default';
  sampleSize: number;
}

export async function fetchMatchmakingEstimate(
  queueSize: number,
  _gameMode: GameMode = 'full_deck',
): Promise<MatchmakingEstimate> {
  const maxWaitSeconds = DEFAULT_WAIT_SEC;

  if (queueSize >= 2) {
    return {
      estimatedSeconds: INSTANT_WAIT_SEC,
      maxWaitSeconds,
      queueSize,
      source: 'instant',
      sampleSize: 0,
    };
  }

  const db = getPool();
  if (!db) {
    return {
      estimatedSeconds: DEFAULT_WAIT_SEC,
      maxWaitSeconds,
      queueSize,
      source: 'default',
      sampleSize: 0,
    };
  }

  const result = await db.query<{ median: string | null; count: string }>(`
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY (properties->>'wait_seconds')::numeric
      )::text AS median,
      COUNT(*)::text AS count
    FROM analytics_events
    WHERE event_name = 'match_found'
      AND properties->>'wait_seconds' ~ '^[0-9]+$'
      AND created_at >= NOW() - INTERVAL '30 days'
  `);

  const sampleSize = Number(result.rows[0]?.count) || 0;
  const median = Number(result.rows[0]?.median);
  if (sampleSize >= 3 && Number.isFinite(median) && median > 0) {
    return {
      estimatedSeconds: Math.max(INSTANT_WAIT_SEC, Math.min(maxWaitSeconds, Math.round(median))),
      maxWaitSeconds,
      queueSize,
      source: 'historical',
      sampleSize,
    };
  }

  return {
    estimatedSeconds: DEFAULT_WAIT_SEC,
    maxWaitSeconds,
    queueSize,
    source: 'default',
    sampleSize,
  };
}
