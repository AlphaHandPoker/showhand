import { getPool } from './db.js';
import { getExcludedUserIds, userExclusionClause } from './excludeUsers.js';

export interface RoadmapStep {
  id: string;
  label: string;
  parentId: string | null;
  visits: number;
  uniqueUsers: number;
}

export interface JourneyEvent {
  name: string;
  label: string;
  at: string;
}

export interface UserJourneyRow {
  userId: string;
  firstSeen: string;
  lastSeen: string;
  totalMatches: number;
  status: 'bounced' | 'browser' | 'started_no_finish' | 'played_once' | 'returning';
  statusLabel: string;
  path: string;
  events: JourneyEvent[];
}

export interface RetentionSummary {
  totalUsers: number;
  bouncedUsers: number;
  playedOnce: number;
  returningUsers: number;
  returningPercent: number;
  fivePlusMatches: number;
  finishedMatches: number;
}

export interface RoadmapDashboard {
  meta: {
    excludedUserIds: string[];
    excludedMatchCount: number;
  };
  retention: RetentionSummary;
  steps: RoadmapStep[];
  journeys: UserJourneyRow[];
}

const STEP_DEFS: { id: string; label: string; parentId: string | null }[] = [
  { id: 'main_menu', label: 'Main menu', parentId: null },
  { id: 'play_online', label: 'Play Online', parentId: 'main_menu' },
  { id: 'play_vs_computer', label: 'Play vs Computer', parentId: 'main_menu' },
  { id: 'how_to_play', label: 'How to Play', parentId: 'main_menu' },
  { id: 'cosmetics', label: 'Cosmetics', parentId: 'main_menu' },
  { id: 'matchmaking', label: 'Matchmaking queue', parentId: 'play_online' },
  { id: 'match_found', label: 'Player matched', parentId: 'matchmaking' },
  { id: 'bot_fallback', label: 'Queue → bot', parentId: 'matchmaking' },
  { id: 'game_started', label: 'Game started', parentId: 'main_menu' },
  { id: 'game_finished', label: 'Game finished', parentId: 'game_started' },
  { id: 'match_forfeited', label: 'Forfeit / leave', parentId: 'game_started' },
];

function eventToStepId(eventName: string, props: Record<string, unknown>): string | null {
  switch (eventName) {
    case 'main_menu_view':
      return 'main_menu';
    case 'screen_view':
      return props.screen === 'home' ? 'main_menu' : null;
    case 'cta_click': {
      const action = props.action;
      if (action === 'play_online' || action === 'find_player') return 'play_online';
      if (action === 'play_vs_computer') return 'play_vs_computer';
      if (action === 'how_to_play') return 'how_to_play';
      if (action === 'cosmetics') return 'cosmetics';
      return null;
    }
    case 'matchmaking_started':
      return 'matchmaking';
    case 'match_found':
      return 'match_found';
    case 'matchmaking_fallback_bot':
      return 'bot_fallback';
    case 'game_started':
      return 'game_started';
    case 'game_finished':
      return 'game_finished';
    case 'match_forfeited':
      return 'match_forfeited';
    default:
      return null;
  }
}

function eventLabel(eventName: string, props: Record<string, unknown>): string {
  switch (eventName) {
    case 'main_menu_view':
      return 'Main menu';
    case 'screen_view':
      return `Screen: ${String(props.screen ?? '?')}`;
    case 'cta_click':
      return `Click: ${String(props.action ?? '?').replace(/_/g, ' ')}`;
    case 'matchmaking_started':
      return 'Matchmaking';
    case 'match_found':
      return 'Player matched';
    case 'matchmaking_fallback_bot':
      return 'Bot fallback';
    case 'bot_game_started':
      return props.disguised ? 'Disguised bot game' : 'Bot game';
    case 'game_started':
      return `Game started (${String(props.mode ?? '?')})`;
    case 'game_finished':
      return `Finished (${String(props.mode ?? '?')})`;
    case 'match_forfeited':
      return 'Forfeit';
    case 'online_match_left':
      return 'Left online';
    default:
      return eventName.replace(/_/g, ' ');
  }
}

function classifyUser(
  totalMatches: number,
  hasGameStarted: boolean,
  hasCta: boolean,
): { status: UserJourneyRow['status']; statusLabel: string } {
  if (totalMatches >= 5) {
    return { status: 'returning', statusLabel: '5+ games' };
  }
  if (totalMatches > 1) {
    return { status: 'returning', statusLabel: 'Returning player' };
  }
  if (totalMatches === 1) {
    return { status: 'played_once', statusLabel: 'Played 1 game' };
  }
  if (hasGameStarted) {
    return { status: 'started_no_finish', statusLabel: 'Started, no finish' };
  }
  if (hasCta) {
    return { status: 'browser', statusLabel: 'Clicked, left' };
  }
  return { status: 'bounced', statusLabel: 'Left immediately' };
}

async function countStep(
  db: NonNullable<ReturnType<typeof getPool>>,
  whereSql: string,
  params: string[],
): Promise<{ visits: number; users: number }> {
  const result = await db.query<{ visits: string; users: string }>(`
    SELECT COUNT(*)::text AS visits, COUNT(DISTINCT user_id)::text AS users
    FROM analytics_events
    WHERE ${whereSql}
  `, params);
  const row = result.rows[0];
  return {
    visits: Number(row?.visits) || 0,
    users: Number(row?.users) || 0,
  };
}

export async function fetchRoadmapDashboard(): Promise<RoadmapDashboard> {
  const db = getPool();
  if (!db) throw new Error('Analytics database not configured');

  const excluded = getExcludedUserIds();
  const ex = userExclusionClause('user_id', excluded);
  const sessionEx = userExclusionClause('user_id', excluded);
  const matchEx = userExclusionClause('user_id', excluded);
  const exTail = ex.clause;

  const stepQueries: Record<string, { sql: string; params: string[] }> = {
    main_menu: {
      sql: `(event_name = 'main_menu_view' OR (event_name = 'screen_view' AND properties->>'screen' = 'home'))${exTail}`,
      params: ex.params,
    },
    play_online: {
      sql: `event_name = 'cta_click' AND properties->>'action' IN ('play_online', 'find_player')${exTail}`,
      params: ex.params,
    },
    play_vs_computer: {
      sql: `event_name = 'cta_click' AND properties->>'action' = 'play_vs_computer'${exTail}`,
      params: ex.params,
    },
    how_to_play: {
      sql: `event_name = 'cta_click' AND properties->>'action' = 'how_to_play'${exTail}`,
      params: ex.params,
    },
    cosmetics: {
      sql: `event_name = 'cta_click' AND properties->>'action' = 'cosmetics'${exTail}`,
      params: ex.params,
    },
    matchmaking: {
      sql: `event_name = 'matchmaking_started'${exTail}`,
      params: ex.params,
    },
    match_found: {
      sql: `event_name = 'match_found'${exTail}`,
      params: ex.params,
    },
    bot_fallback: {
      sql: `event_name = 'matchmaking_fallback_bot'${exTail}`,
      params: ex.params,
    },
    game_started: {
      sql: `event_name = 'game_started'${exTail}`,
      params: ex.params,
    },
    game_finished: {
      sql: `event_name = 'game_finished'${exTail}`,
      params: ex.params,
    },
    match_forfeited: {
      sql: `event_name = 'match_forfeited'${exTail}`,
      params: ex.params,
    },
  };

  const stepCounts = await Promise.all(
    STEP_DEFS.map(async def => {
      const q = stepQueries[def.id];
      const counts = q ? await countStep(db, q.sql, q.params) : { visits: 0, users: 0 };
      return { ...def, ...counts };
    }),
  );

  const [sessionsRes, eventsRes, matchCountRes, excludedCountRes] = await Promise.all([
    db.query<{
      user_id: string;
      first_seen: Date;
      last_seen: Date;
      total_matches: string;
    }>(`
      SELECT user_id, first_seen, last_seen, total_matches::text
      FROM user_sessions
      WHERE 1=1${sessionEx.clause}
      ORDER BY last_seen DESC
      LIMIT 150
    `, sessionEx.params),
    db.query<{
      user_id: string;
      event_name: string;
      properties: Record<string, unknown>;
      created_at: Date;
    }>(`
      SELECT user_id, event_name, properties, created_at
      FROM analytics_events
      WHERE created_at >= NOW() - INTERVAL '30 days' ${ex.clause}
      ORDER BY user_id, created_at ASC
    `, ex.params),
    db.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM match_events WHERE 1=1${matchEx.clause}
    `, matchEx.params),
    excluded.length > 0
      ? db.query<{ count: string }>(`
          SELECT COUNT(*)::text AS count FROM match_events
          WHERE user_id IN (${excluded.map((_, i) => `$${i + 1}`).join(', ')})
        `, excluded)
      : Promise.resolve({ rows: [{ count: '0' }] }),
  ]);

  const eventsByUser = new Map<string, typeof eventsRes.rows>();
  for (const row of eventsRes.rows) {
    const list = eventsByUser.get(row.user_id) ?? [];
    list.push(row);
    eventsByUser.set(row.user_id, list);
  }

  const sessionMap = new Map(sessionsRes.rows.map(row => [row.user_id, row]));
  const journeyUserIds = new Set([
    ...sessionsRes.rows.map(r => r.user_id),
    ...eventsByUser.keys(),
  ]);

  const journeys: UserJourneyRow[] = [];

  for (const userId of journeyUserIds) {
    const session = sessionMap.get(userId);
    const rawEvents = eventsByUser.get(userId) ?? [];
    const totalMatches = Number(session?.total_matches) || 0;

    const journeyEvents: JourneyEvent[] = rawEvents.map(row => ({
      name: row.event_name,
      label: eventLabel(row.event_name, row.properties ?? {}),
      at: row.created_at.toISOString(),
    }));

    const pathSteps: string[] = [];
    for (const row of rawEvents) {
      const stepId = eventToStepId(row.event_name, row.properties ?? {});
      if (!stepId) continue;
      const def = STEP_DEFS.find(s => s.id === stepId);
      const label = def?.label ?? stepId;
      if (pathSteps[pathSteps.length - 1] !== label) {
        pathSteps.push(label);
      }
    }

    const hasGameStarted = rawEvents.some(r => r.event_name === 'game_started');
    const hasCta = rawEvents.some(
      r => r.event_name === 'cta_click' || r.event_name === 'matchmaking_started',
    );
    const { status, statusLabel } = classifyUser(totalMatches, hasGameStarted, hasCta);

    const firstAt = session?.first_seen ?? rawEvents[0]?.created_at;
    const lastAt = session?.last_seen ?? rawEvents[rawEvents.length - 1]?.created_at;

    journeys.push({
      userId,
      firstSeen: (firstAt ?? new Date()).toString(),
      lastSeen: (lastAt ?? new Date()).toString(),
      totalMatches,
      status,
      statusLabel,
      path: pathSteps.length > 0 ? pathSteps.join(' → ') : 'Main menu only',
      events: journeyEvents.slice(-12),
    });
  }

  journeys.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  const bouncedUsers = journeys.filter(j => j.status === 'bounced').length;
  const playedOnce = journeys.filter(j => j.status === 'played_once').length;
  const returningUsers = journeys.filter(j => j.status === 'returning').length;
  const totalUsers = sessionsRes.rows.length;
  const fivePlus = sessionsRes.rows.filter(r => Number(r.total_matches) >= 5).length;
  const cappedJourneys = journeys.slice(0, 100);

  return {
    meta: {
      excludedUserIds: excluded,
      excludedMatchCount: Number(excludedCountRes.rows[0]?.count) || 0,
    },
    retention: {
      totalUsers,
      bouncedUsers,
      playedOnce,
      returningUsers,
      returningPercent: totalUsers > 0 ? (returningUsers / totalUsers) * 100 : 0,
      fivePlusMatches: fivePlus,
      finishedMatches: Number(matchCountRes.rows[0]?.count) || 0,
    },
    steps: stepCounts,
    journeys: cappedJourneys,
  };
}
