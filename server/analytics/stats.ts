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
  funnel: {
    uniqueVisitorsToday: number;
    uniqueVisitorsAllTime: number;
    playVsComputerClicks: number;
    playVsComputerUsers: number;
    findPlayerClicks: number;
    findPlayerUsers: number;
    matchmakingStarted: number;
    matchFound: number;
    botGameStarted: number;
    matchmakingFallbackBot: number;
    roomCreated: number;
    roomJoined: number;
    draftSubmitted: number;
    gameStarted: number;
    gamesFinished: number;
    matchForfeited: number;
    onlineMatchLeft: number;
    howToPlayClicks: number;
    cosmeticsClicks: number;
    screenViews: { screen: string; count: number }[];
  };
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const db = getPool();
  if (!db) throw new Error('Analytics database not configured');

  const excluded = getExcludedUserIds();
  const eventExclusion = userExclusionClause('user_id', excluded);
  const sessionExclusion = userExclusionClause('user_id', excluded);
  const analyticsExclusion = userExclusionClause('user_id', excluded);

  const [
    overviewRes,
    retentionRes,
    effectRes,
    botWinRes,
    playerWinRes,
    dailyRes,
    excludedCountRes,
    recentUsersRes,
    funnelRes,
    screenViewsRes,
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
    db.query<{
      visitors_all: string;
      visitors_today: string;
      play_vs_computer_clicks: string;
      play_vs_computer_users: string;
      find_player_clicks: string;
      find_player_users: string;
      matchmaking_started: string;
      match_found: string;
      bot_game_started: string;
      matchmaking_fallback_bot: string;
      room_created: string;
      room_joined: string;
      draft_submitted: string;
      game_started: string;
      match_forfeited: string;
      online_match_left: string;
      how_to_play_clicks: string;
      cosmetics_clicks: string;
    }>(`
      SELECT
        COUNT(DISTINCT user_id)::text AS visitors_all,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= CURRENT_DATE)::text AS visitors_today,
        COUNT(*) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' = 'play_vs_computer')::text AS play_vs_computer_clicks,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' = 'play_vs_computer')::text AS play_vs_computer_users,
        COUNT(*) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' IN ('find_player', 'play_online'))::text AS find_player_clicks,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' IN ('find_player', 'play_online'))::text AS find_player_users,
        COUNT(*) FILTER (WHERE event_name = 'matchmaking_started')::text AS matchmaking_started,
        COUNT(*) FILTER (WHERE event_name = 'match_found')::text AS match_found,
        COUNT(*) FILTER (WHERE event_name = 'bot_game_started')::text AS bot_game_started,
        COUNT(*) FILTER (WHERE event_name = 'matchmaking_fallback_bot')::text AS matchmaking_fallback_bot,
        COUNT(*) FILTER (WHERE event_name = 'room_created')::text AS room_created,
        COUNT(*) FILTER (WHERE event_name = 'room_joined')::text AS room_joined,
        COUNT(*) FILTER (WHERE event_name = 'draft_submitted')::text AS draft_submitted,
        COUNT(*) FILTER (WHERE event_name = 'game_started')::text AS game_started,
        COUNT(*) FILTER (WHERE event_name = 'match_forfeited')::text AS match_forfeited,
        COUNT(*) FILTER (WHERE event_name = 'online_match_left')::text AS online_match_left,
        COUNT(*) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' = 'how_to_play')::text AS how_to_play_clicks,
        COUNT(*) FILTER (WHERE event_name = 'cta_click' AND properties->>'action' = 'cosmetics')::text AS cosmetics_clicks
      FROM analytics_events
      WHERE 1=1${analyticsExclusion.clause}
    `, analyticsExclusion.params),
    db.query<{ screen: string | null; count: string }>(`
      SELECT properties->>'screen' AS screen, COUNT(*)::text AS count
      FROM analytics_events
      WHERE event_name = 'screen_view'${analyticsExclusion.clause}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `, analyticsExclusion.params),
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

  const f = funnelRes.rows[0]!;
  const gamesFinished = Number(o.matches_all) || 0;
  const screenViews = screenViewsRes.rows
    .filter(row => row.screen)
    .map(row => ({
      screen: row.screen!,
      count: Number(row.count) || 0,
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
    funnel: {
      uniqueVisitorsToday: Number(f.visitors_today) || 0,
      uniqueVisitorsAllTime: Number(f.visitors_all) || 0,
      playVsComputerClicks: Number(f.play_vs_computer_clicks) || 0,
      playVsComputerUsers: Number(f.play_vs_computer_users) || 0,
      findPlayerClicks: Number(f.find_player_clicks) || 0,
      findPlayerUsers: Number(f.find_player_users) || 0,
      matchmakingStarted: Number(f.matchmaking_started) || 0,
      matchFound: Number(f.match_found) || 0,
      botGameStarted: Number(f.bot_game_started) || 0,
      matchmakingFallbackBot: Number(f.matchmaking_fallback_bot) || 0,
      roomCreated: Number(f.room_created) || 0,
      roomJoined: Number(f.room_joined) || 0,
      draftSubmitted: Number(f.draft_submitted) || 0,
      gameStarted: Number(f.game_started) || 0,
      gamesFinished,
      matchForfeited: Number(f.match_forfeited) || 0,
      onlineMatchLeft: Number(f.online_match_left) || 0,
      howToPlayClicks: Number(f.how_to_play_clicks) || 0,
      cosmeticsClicks: Number(f.cosmetics_clicks) || 0,
      screenViews,
    },
  };
}
