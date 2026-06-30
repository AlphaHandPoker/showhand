import { getPool } from './db.js';
import { getExcludedUserIds, userExclusionClause } from './excludeUsers.js';

export interface ActivityEvent {
  userId: string;
  label: string;
  at: string;
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

const PATH_LABELS: Record<string, string> = {
  main_menu: 'Main menu',
  play_online: 'Play Online',
  play_with_friend: 'Play with a Friend',
  play_vs_computer: 'Play vs Computer',
  how_to_play: 'How to Play',
  cosmetics: 'Cosmetics',
  matchmaking: 'Matchmaking queue',
  friend_room: 'Room created / joined',
  match_found: 'Player matched',
  bot_fallback: 'Queue → bot',
  game_started: 'Game started',
  game_finished: 'Game finished',
  match_forfeited: 'Forfeit / leave',
};

function eventToStepId(eventName: string, props: Record<string, unknown>): string | null {
  switch (eventName) {
    case 'main_menu_view':
      return 'main_menu';
    case 'screen_view':
      return props.screen === 'home' ? 'main_menu' : null;
    case 'cta_click': {
      const action = props.action;
      if (action === 'play_online' || action === 'find_player') return 'play_online';
      if (action === 'play_with_friend') return 'play_with_friend';
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
    case 'room_created':
    case 'room_joined':
      return 'friend_room';
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

export function eventLabel(eventName: string, props: Record<string, unknown>): string {
  switch (eventName) {
    case 'main_menu_view':
      return 'Main menu';
    case 'screen_view':
      return `Screen: ${String(props.screen ?? '?')}`;
    case 'cta_click':
      return `Click: ${String(props.action ?? '?').replace(/_/g, ' ')}`;
    case 'matchmaking_started':
      return 'Matchmaking started';
    case 'match_found':
      return 'Player matched';
    case 'matchmaking_fallback_bot':
      return 'Queue → bot fallback';
    case 'bot_game_started':
      return props.disguised ? 'Disguised bot game' : 'Bot game started';
    case 'room_created':
      return 'Room created';
    case 'room_joined':
      return 'Room joined';
    case 'game_started':
      return `Game started (${String(props.mode ?? '?')})`;
    case 'game_finished':
      return `Game finished (${String(props.mode ?? '?')})`;
    case 'match_forfeited':
      return 'Forfeit';
    case 'online_match_left':
      return 'Left online match';
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

export interface ActivityFeed {
  recentEvents: ActivityEvent[];
  journeys: UserJourneyRow[];
}

export async function fetchActivityFeed(): Promise<ActivityFeed> {
  const db = getPool();
  if (!db) throw new Error('Analytics database not configured');

  const excluded = getExcludedUserIds();
  const ex = userExclusionClause('user_id', excluded);
  const sessionEx = userExclusionClause('user_id', excluded);

  const [recentRes, sessionsRes, eventsRes] = await Promise.all([
    db.query<{
      user_id: string;
      event_name: string;
      properties: Record<string, unknown>;
      created_at: Date;
    }>(`
      SELECT user_id, event_name, properties, created_at
      FROM analytics_events
      WHERE created_at >= NOW() - INTERVAL '14 days' ${ex.clause}
      ORDER BY created_at DESC
      LIMIT 80
    `, ex.params),
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
  ]);

  const recentEvents: ActivityEvent[] = recentRes.rows.map(row => ({
    userId: row.user_id,
    label: eventLabel(row.event_name, row.properties ?? {}),
    at: row.created_at.toISOString(),
  }));

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
      const label = PATH_LABELS[stepId] ?? stepId;
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
      firstSeen: (firstAt ?? new Date()).toISOString(),
      lastSeen: (lastAt ?? new Date()).toISOString(),
      totalMatches,
      status,
      statusLabel,
      path: pathSteps.length > 0 ? pathSteps.join(' → ') : 'Main menu only',
      events: journeyEvents.slice(-12),
    });
  }

  journeys.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  return {
    recentEvents,
    journeys: journeys.slice(0, 100),
  };
}
