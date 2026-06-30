import { getPool } from './db.js';
import { getExcludedUserIds, userExclusionClause } from './excludeUsers.js';

export interface AdminStats {
  meta: {
    excludedUserIds: string[];
    excludedMatchCount: number;
  };
  overview: {
    matchesToday: number;
    matchesThisWeek: number;
    matchesAllTime: number;
    uniqueUsersToday: number;
    uniqueUsersThisWeek: number;
    uniqueUsersAllTime: number;
    avgRoundsPerMatch: number;
    avgMatchDurationSeconds: number;
  };
  retention: {
    returningUsersPercent: number;
    usersWithFivePlusMatches: number;
    usersPlayedOnce: number;
    totalUsers: number;
  };
  gameBalance: {
    effectUsage: { effect: string; count: number }[];
    winRateVsBot: number;
    winRateVsPlayer: number;
    botMatches: number;
    playerMatches: number;
  };
  matchesPerDay: { date: string; count: number }[];
  recentUsers: {
    userId: string;
    totalMatches: number;
    lastSeen: string;
    excluded: boolean;
  }[];
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const db = getPool();
  if (!db) throw new Error('Analytics database not configured');

  const excluded = getExcludedUserIds();
  const eventExclusion = userExclusionClause('user_id', excluded);
  const sessionExclusion = userExclusionClause('user_id', excluded);

  const [
    overviewRes,
    retentionRes,
    effectRes,
    botWinRes,
    playerWinRes,
    dailyRes,
    excludedCountRes,
    recentUsersRes,
  ] = await Promise.all([
    db.query<{
      matches_today: string;
      matches_week: string;
      matches_all: string;
      users_today: string;
      users_week: string;
      users_all: string;
      avg_rounds: string | null;
      avg_duration: string | null;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::text AS matches_today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::text AS matches_week,
        COUNT(*)::text AS matches_all,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= CURRENT_DATE)::text AS users_today,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::text AS users_week,
        COUNT(DISTINCT user_id)::text AS users_all,
        AVG(rounds_played)::text AS avg_rounds,
        AVG(duration_seconds)::text AS avg_duration
      FROM match_events
      WHERE 1=1${eventExclusion.clause}
    `, eventExclusion.params),
    db.query<{
      total_users: string;
      returning_users: string;
      five_plus: string;
      played_once: string;
    }>(`
      SELECT
        COUNT(*)::text AS total_users,
        COUNT(*) FILTER (WHERE total_matches > 1)::text AS returning_users,
        COUNT(*) FILTER (WHERE total_matches >= 5)::text AS five_plus,
        COUNT(*) FILTER (WHERE total_matches = 1)::text AS played_once
      FROM user_sessions
      WHERE 1=1${sessionExclusion.clause}
    `, sessionExclusion.params),
    db.query<{ effect: string; count: string }>(`
      SELECT effect, COUNT(*)::text AS count
      FROM match_events, unnest(effects_used) AS effect
      WHERE 1=1${eventExclusion.clause}
      GROUP BY effect
      ORDER BY COUNT(*) DESC
    `, eventExclusion.params),
    db.query<{ total: string; wins: string }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE winner = 'self')::text AS wins
      FROM match_events
      WHERE opponent_type = 'bot'${eventExclusion.clause}
    `, eventExclusion.params),
    db.query<{ total: string; wins: string }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE winner = 'self')::text AS wins
      FROM match_events
      WHERE opponent_type = 'player'${eventExclusion.clause}
    `, eventExclusion.params),
    db.query<{ day: string; count: string }>(`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::text AS count
      FROM match_events
      WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'${eventExclusion.clause}
      GROUP BY 1
      ORDER BY 1
    `, eventExclusion.params),
    excluded.length > 0
      ? db.query<{ count: string }>(`
          SELECT COUNT(*)::text AS count
          FROM match_events
          WHERE user_id IN (${excluded.map((_, i) => `$${i + 1}`).join(', ')})
        `, excluded)
      : Promise.resolve({ rows: [{ count: '0' }] }),
    db.query<{
      user_id: string;
      total_matches: string;
      last_seen: Date;
    }>(`
      SELECT user_id, total_matches::text, last_seen
      FROM user_sessions
      ORDER BY total_matches DESC, last_seen DESC
      LIMIT 20
    `),
  ]);

  const o = overviewRes.rows[0]!;
  const r = retentionRes.rows[0]!;
  const totalUsers = Number(r.total_users) || 0;
  const returningUsers = Number(r.returning_users) || 0;

  const botTotal = Number(botWinRes.rows[0]?.total) || 0;
  const botWins = Number(botWinRes.rows[0]?.wins) || 0;
  const playerTotal = Number(playerWinRes.rows[0]?.total) || 0;
  const playerWins = Number(playerWinRes.rows[0]?.wins) || 0;

  const dailyMap = new Map(dailyRes.rows.map(row => [row.day, Number(row.count)]));
  const matchesPerDay: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    matchesPerDay.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  const effectUsage = effectRes.rows.map(row => ({
    effect: row.effect,
    count: Number(row.count),
  }));

  const excludedSet = new Set(excluded);
  const recentUsers = recentUsersRes.rows.map(row => ({
    userId: row.user_id,
    totalMatches: Number(row.total_matches) || 0,
    lastSeen: row.last_seen.toISOString(),
    excluded: excludedSet.has(row.user_id),
  }));

  return {
    meta: {
      excludedUserIds: excluded,
      excludedMatchCount: Number(excludedCountRes.rows[0]?.count) || 0,
    },
    overview: {
      matchesToday: Number(o.matches_today) || 0,
      matchesThisWeek: Number(o.matches_week) || 0,
      matchesAllTime: Number(o.matches_all) || 0,
      uniqueUsersToday: Number(o.users_today) || 0,
      uniqueUsersThisWeek: Number(o.users_week) || 0,
      uniqueUsersAllTime: Number(o.users_all) || 0,
      avgRoundsPerMatch: Number(o.avg_rounds) || 0,
      avgMatchDurationSeconds: Number(o.avg_duration) || 0,
    },
    retention: {
      returningUsersPercent: totalUsers > 0 ? (returningUsers / totalUsers) * 100 : 0,
      usersWithFivePlusMatches: Number(r.five_plus) || 0,
      usersPlayedOnce: Number(r.played_once) || 0,
      totalUsers,
    },
    gameBalance: {
      effectUsage,
      winRateVsBot: botTotal > 0 ? (botWins / botTotal) * 100 : 0,
      winRateVsPlayer: playerTotal > 0 ? (playerWins / playerTotal) * 100 : 0,
      botMatches: botTotal,
      playerMatches: playerTotal,
    },
    matchesPerDay,
    recentUsers,
  };
}
