import { getPool } from './db.js';
import { getExcludedUserIds, userExclusionClause } from './excludeUsers.js';

export interface AdminMatchRow {
  id: number;
  userId: string;
  opponentType: 'bot' | 'player';
  winner: 'self' | 'opponent' | 'tie';
  roundsPlayed: number;
  durationSeconds: number;
  effectsUsed: string[];
  createdAt: string;
  excluded: boolean;
}

export async function fetchRecentMatches(limit = 100): Promise<AdminMatchRow[]> {
  const db = getPool();
  if (!db) throw new Error('Analytics database not configured');

  const excluded = getExcludedUserIds();
  const exclusion = userExclusionClause('user_id', excluded);
  const capped = Math.min(Math.max(Math.round(limit), 1), 200);
  const limitParam = exclusion.params.length + 1;

  const result = await db.query<{
    id: number;
    user_id: string;
    opponent_type: 'bot' | 'player';
    winner: 'self' | 'opponent' | 'tie';
    rounds_played: number;
    duration_seconds: number;
    effects_used: string[];
    created_at: Date;
  }>(`
    SELECT
      id,
      user_id,
      opponent_type,
      winner,
      rounds_played,
      duration_seconds,
      effects_used,
      created_at
    FROM match_events
    WHERE 1=1${exclusion.clause}
    ORDER BY created_at DESC
    LIMIT $${limitParam}
  `, [...exclusion.params, capped]);

  const excludedSet = new Set(excluded);

  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    opponentType: row.opponent_type,
    winner: row.winner,
    roundsPlayed: row.rounds_played,
    durationSeconds: row.duration_seconds,
    effectsUsed: row.effects_used ?? [],
    createdAt: row.created_at.toISOString(),
    excluded: excludedSet.has(row.user_id),
  }));
}
