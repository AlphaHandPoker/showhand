import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { GAME_NAME } from '../config/brand';
import { getOrCreateUserId } from '../analytics/userId';
import { EFFECT_NAMES, type EffectType } from '../game/types';
import './AdminPage.css';

const ADMIN_TOKEN_KEY = 'pd_admin_token';

interface AdminStats {
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
    winRateVsFriend: number;
    botMatches: number;
    playerMatches: number;
    friendMatches: number;
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
    playWithFriendClicks: number;
    playWithFriendUsers: number;
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
  activity?: {
    recentEvents: ActivityEvent[];
    journeys: UserJourney[];
  };
}

interface ActivityEvent {
  userId: string;
  label: string;
  at: string;
}

interface JourneyEvent {
  name: string;
  label: string;
  at: string;
}

interface UserJourney {
  userId: string;
  firstSeen: string;
  lastSeen: string;
  totalMatches: number;
  status: 'bounced' | 'browser' | 'started_no_finish' | 'played_once' | 'returning';
  statusLabel: string;
  path: string;
  events: JourneyEvent[];
}

interface AdminMatch {
  id: number;
  userId: string;
  opponentType: 'bot' | 'player' | 'friend';
  winner: 'self' | 'opponent' | 'tie';
  roundsPlayed: number;
  durationSeconds: number;
  effectsUsed: string[];
  createdAt: string;
  excluded: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function effectLabel(type: string): string {
  return EFFECT_NAMES[type as EffectType] ?? type;
}

function shortUserId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function formatLastSeen(iso: string): string {
  return new Date(iso).toLocaleString();
}

function modeLabel(type: 'bot' | 'player' | 'friend'): string {
  if (type === 'friend') return 'Friend';
  if (type === 'player') return 'Online';
  return 'Bot';
}

function winnerLabel(winner: 'self' | 'opponent' | 'tie'): string {
  if (winner === 'self') return 'Won';
  if (winner === 'opponent') return 'Lost';
  return 'Tie';
}

function winnerClass(winner: 'self' | 'opponent' | 'tie'): string {
  if (winner === 'self') return 'admin-match-winner--win';
  if (winner === 'opponent') return 'admin-match-winner--loss';
  return 'admin-match-winner--tie';
}

function statusClass(status: UserJourney['status']): string {
  return `admin-journey-status--${status}`;
}

function isAdminStats(data: unknown): data is AdminStats {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.overview === 'object'
    && d.overview !== null
    && typeof d.funnel === 'object'
    && d.funnel !== null
    && typeof d.gameBalance === 'object'
    && d.gameBalance !== null;
}

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [journeyFilter, setJourneyFilter] = useState<UserJourney['status'] | 'all'>('all');

  const filteredJourneys = useMemo(() => {
    const journeys = stats?.activity?.journeys ?? [];
    if (journeyFilter === 'all') return journeys;
    return journeys.filter(j => j.status === journeyFilter);
  }, [stats, journeyFilter]);

  const queueNoMatch = stats
    ? Math.max(
      0,
      stats.funnel.matchmakingStarted
        - stats.funnel.matchFound
        - stats.funnel.matchmakingFallbackBot,
    )
    : 0;

  const fetchDashboard = useCallback(async (authToken: string) => {
    setLoading(true);
    setFetchError('');
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [statsRes, matchesRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers }),
        fetch(`${API_BASE}/api/admin/matches?limit=100`, { headers }),
      ]);

      if (statsRes.status === 401 || matchesRes.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken('');
        throw new Error('Session expired — sign in again');
      }

      if (matchesRes.ok) {
        const matchesData = await matchesRes.json() as { matches: AdminMatch[] };
        setMatches(matchesData.matches ?? []);
      }

      if (!statsRes.ok) {
        throw new Error(`Stats API returned ${statsRes.status}. Redeploy Railway if you just pushed server changes.`);
      }

      const statsData: unknown = await statsRes.json();
      if (!isAdminStats(statsData)) {
        throw new Error(
          'Server returned an unexpected stats format. The Railway server may still be on an old build — try Refresh in a minute.',
        );
      }
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setFetchError(`${message}. Check server connection and password.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void fetchDashboard(token);
  }, [token, fetchDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setLoginError('Invalid password');
        return;
      }
      const data = await res.json() as { token: string };
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
      setPassword('');
    } catch {
      setLoginError('Could not reach server');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken('');
    setStats(null);
    setMatches([]);
  };

  const myDeviceId = getOrCreateUserId();

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be blocked
    }
  };

  if (!token) {
    return (
      <div className="admin-page">
        <form className="admin-login" onSubmit={handleLogin}>
          <h1>{GAME_NAME} Admin</h1>
          <p className="admin-login__hint">Enter the Railway ADMIN_PASSWORD</p>
          <input
            type="password"
            className="admin-login__input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
          />
          {loginError && <p className="admin-login__error">{loginError}</p>}
          <button type="submit" className="admin-login__btn" disabled={loading || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  const maxDaily = Math.max(1, ...(stats?.matchesPerDay.map(d => d.count) ?? [1]));
  const topEffects = stats?.gameBalance.effectUsage ?? [];
  const leastEffect = topEffects.length > 0 ? topEffects[topEffects.length - 1] : null;
  const mostEffect = topEffects[0] ?? null;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>{GAME_NAME} Analytics</h1>
          <p className="admin-header__sub">Self-hosted · Railway Postgres</p>
        </div>
        <div className="admin-header__actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void fetchDashboard(token)}>
            Refresh
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {loading && !stats && <p className="admin-loading">Loading…</p>}
      {fetchError && <p className="admin-error">{fetchError}</p>}

      {stats && stats.meta.excludedUserIds.length > 0 && (
        <p className="admin-filter-note">
          Hiding {stats.meta.excludedUserIds.length} test user
          {stats.meta.excludedUserIds.length === 1 ? '' : 's'}
          {' '}({stats.meta.excludedMatchCount} match
          {stats.meta.excludedMatchCount === 1 ? '' : 'es'} not counted).
        </p>
      )}

      <details className="admin-exclude-help">
        <summary>Exclude your own test plays</summary>
        <p>
          Your PC and phone each get a separate anonymous ID. Pick yours from the list below
          (marked &quot;this device&quot; when you open admin on that browser), copy the IDs,
          and add them to <code>ANALYTICS_EXCLUDE_USER_IDS</code> on Railway.
        </p>
        <p>
          This browser: <code>{myDeviceId}</code>{' '}
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void copyText(myDeviceId)}>
            Copy
          </button>
        </p>
      </details>

      {stats && stats.activity && stats.activity.recentEvents.length > 0 && (
        <section className="admin-section">
          <h2>Live activity</h2>
          <p className="admin-section__hint">
            Latest player actions — matchmaking, friend rooms, games started/finished.
          </p>
          <ul className="admin-activity-feed">
            {stats.activity.recentEvents.map((ev, i) => (
              <li key={`${ev.userId}-${ev.at}-${i}`} className="admin-activity-feed__item">
                <span className="admin-activity-feed__time">{formatLastSeen(ev.at)}</span>
                <code className="admin-activity-feed__user" title={ev.userId}>{shortUserId(ev.userId)}</code>
                <span className="admin-activity-feed__label">{ev.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && (
        <section className="admin-section">
          <h2>Matchmaking snapshot</h2>
          <div className="admin-cards admin-cards--3">
            <div className="admin-card">
              <span className="admin-card__label">Queue started</span>
              <span className="admin-card__value">{stats.funnel.matchmakingStarted}</span>
            </div>
            <div className="admin-card admin-card--highlight">
              <span className="admin-card__label">Player matched</span>
              <span className="admin-card__value">{stats.funnel.matchFound}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Queue → bot</span>
              <span className="admin-card__value">{stats.funnel.matchmakingFallbackBot}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Left queue (est.)</span>
              <span className="admin-card__value">{queueNoMatch}</span>
              <span className="admin-card__hint">Started but no match / bot</span>
            </div>
            <div className="admin-card admin-card--highlight">
              <span className="admin-card__label">Friend room created</span>
              <span className="admin-card__value">{stats.funnel.roomCreated}</span>
            </div>
            <div className="admin-card admin-card--highlight">
              <span className="admin-card__label">Friend room joined</span>
              <span className="admin-card__value">{stats.funnel.roomJoined}</span>
            </div>
          </div>
        </section>
      )}

      {stats?.activity && stats.activity.journeys.length > 0 && (
        <section className="admin-section">
          <h2>User activity</h2>
          <p className="admin-section__hint">
            Who clicked what — bounced, matchmaking, friend rooms, or finished games.
          </p>
          <div className="admin-journey-filters">
            {(['all', 'bounced', 'browser', 'started_no_finish', 'played_once', 'returning'] as const).map(f => (
              <button
                key={f}
                type="button"
                className={`admin-btn admin-btn--ghost${journeyFilter === f ? ' admin-btn--active' : ''}`}
                onClick={() => setJourneyFilter(f)}
              >
                {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="admin-user-table-wrap">
            <table className="admin-user-table admin-journey-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Path</th>
                  <th>Games</th>
                  <th>Last seen</th>
                  <th>Recent steps</th>
                </tr>
              </thead>
              <tbody>
                {filteredJourneys.map(journey => (
                  <tr key={journey.userId}>
                    <td><code title={journey.userId}>{shortUserId(journey.userId)}</code></td>
                    <td>
                      <span className={`admin-journey-status ${statusClass(journey.status)}`}>
                        {journey.statusLabel}
                      </span>
                    </td>
                    <td className="admin-journey-path">{journey.path}</td>
                    <td>{journey.totalMatches}</td>
                    <td className="admin-match-table__time">{formatLastSeen(journey.lastSeen)}</td>
                    <td>
                      <ul className="admin-journey-events">
                        {journey.events.map((ev, i) => (
                          <li key={`${journey.userId}-${i}`}>{ev.label}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats && (
        <>
          <section className="admin-section">
            <h2>Overview</h2>
            <div className="admin-cards">
              <div className="admin-card">
                <span className="admin-card__label">Matches today</span>
                <span className="admin-card__value">{stats.overview.matchesToday}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Matches this week</span>
                <span className="admin-card__value">{stats.overview.matchesThisWeek}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Matches all time</span>
                <span className="admin-card__value">{stats.overview.matchesAllTime}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Unique users today</span>
                <span className="admin-card__value">{stats.overview.uniqueUsersToday}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Unique users this week</span>
                <span className="admin-card__value">{stats.overview.uniqueUsersThisWeek}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Unique users all time</span>
                <span className="admin-card__value">{stats.overview.uniqueUsersAllTime}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Avg rounds / match</span>
                <span className="admin-card__value">{stats.overview.avgRoundsPerMatch.toFixed(1)}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Avg match duration</span>
                <span className="admin-card__value">
                  {formatDuration(stats.overview.avgMatchDurationSeconds)}
                </span>
              </div>
            </div>
          </section>

          <section className="admin-section">
            <h2>Funnel</h2>
            <p className="admin-section__hint">
              Button clicks and screen views. Finished games only count when a winner is decided.
            </p>
            <div className="admin-cards">
              <div className="admin-card">
                <span className="admin-card__label">Visitors today</span>
                <span className="admin-card__value">{stats.funnel.uniqueVisitorsToday}</span>
                <span className="admin-card__hint">{stats.funnel.uniqueVisitorsAllTime} all time</span>
              </div>
              <div className="admin-card admin-card--highlight">
                <span className="admin-card__label">Play vs Computer</span>
                <span className="admin-card__value">{stats.funnel.playVsComputerClicks}</span>
                <span className="admin-card__hint">{stats.funnel.playVsComputerUsers} unique users</span>
              </div>
              <div className="admin-card admin-card--highlight">
                <span className="admin-card__label">Play Online</span>
                <span className="admin-card__value">{stats.funnel.findPlayerClicks}</span>
                <span className="admin-card__hint">{stats.funnel.findPlayerUsers} unique users</span>
              </div>
              <div className="admin-card admin-card--highlight">
                <span className="admin-card__label">Play with a Friend</span>
                <span className="admin-card__value">{stats.funnel.playWithFriendClicks}</span>
                <span className="admin-card__hint">{stats.funnel.playWithFriendUsers} unique users</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Matchmaking started</span>
                <span className="admin-card__value">{stats.funnel.matchmakingStarted}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Player match found</span>
                <span className="admin-card__value">{stats.funnel.matchFound}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Room created</span>
                <span className="admin-card__value">{stats.funnel.roomCreated}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Room joined</span>
                <span className="admin-card__value">{stats.funnel.roomJoined}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Bot game started</span>
                <span className="admin-card__value">{stats.funnel.botGameStarted}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Queue → bot fallback</span>
                <span className="admin-card__value">{stats.funnel.matchmakingFallbackBot}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Game board opened</span>
                <span className="admin-card__value">{stats.funnel.gameStarted}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Games finished</span>
                <span className="admin-card__value">{stats.funnel.gamesFinished}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Forfeits / early leaves</span>
                <span className="admin-card__value">{stats.funnel.matchForfeited}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Online match left</span>
                <span className="admin-card__value">{stats.funnel.onlineMatchLeft}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">How to Play opens</span>
                <span className="admin-card__value">{stats.funnel.howToPlayClicks}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Cosmetics opens</span>
                <span className="admin-card__value">{stats.funnel.cosmeticsClicks}</span>
              </div>
            </div>
            {stats.funnel.screenViews.length > 0 && (
              <div className="admin-effect-list">
                <h3>Screen views</h3>
                <ul>
                  {stats.funnel.screenViews.map(row => (
                    <li key={row.screen}>
                      <span>{row.screen}</span>
                      <span className="admin-effect-list__count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2>Retention</h2>
            <div className="admin-cards admin-cards--3">
              <div className="admin-card">
                <span className="admin-card__label">Returning users</span>
                <span className="admin-card__value">
                  {stats.retention.returningUsersPercent.toFixed(1)}%
                </span>
                <span className="admin-card__hint">
                  {stats.retention.totalUsers - stats.retention.usersPlayedOnce} of {stats.retention.totalUsers}
                </span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">5+ matches</span>
                <span className="admin-card__value">{stats.retention.usersWithFivePlusMatches}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Played once (churn)</span>
                <span className="admin-card__value">{stats.retention.usersPlayedOnce}</span>
              </div>
            </div>
          </section>

          <section className="admin-section">
            <h2>Game balance</h2>
            <div className="admin-cards admin-cards--3">
              <div className="admin-card">
                <span className="admin-card__label">Win rate vs bot</span>
                <span className="admin-card__value">
                  {stats.gameBalance.winRateVsBot.toFixed(1)}%
                </span>
                <span className="admin-card__hint">{stats.gameBalance.botMatches} matches</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Win rate vs online</span>
                <span className="admin-card__value">
                  {stats.gameBalance.winRateVsPlayer.toFixed(1)}%
                </span>
                <span className="admin-card__hint">{stats.gameBalance.playerMatches} matchmaking</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Win rate vs friend</span>
                <span className="admin-card__value">
                  {stats.gameBalance.winRateVsFriend.toFixed(1)}%
                </span>
                <span className="admin-card__hint">{stats.gameBalance.friendMatches} friend rooms</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Most used effect</span>
                <span className="admin-card__value admin-card__value--sm">
                  {mostEffect ? effectLabel(mostEffect.effect) : '—'}
                </span>
                {mostEffect && (
                  <span className="admin-card__hint">{mostEffect.count} plays</span>
                )}
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Least used effect</span>
                <span className="admin-card__value admin-card__value--sm">
                  {leastEffect ? effectLabel(leastEffect.effect) : '—'}
                </span>
                {leastEffect && (
                  <span className="admin-card__hint">{leastEffect.count} plays</span>
                )}
              </div>
            </div>

            {topEffects.length > 0 && (
              <div className="admin-effect-list">
                <h3>Effect usage</h3>
                <ul>
                  {topEffects.map(row => (
                    <li key={row.effect}>
                      <span>{effectLabel(row.effect)}</span>
                      <span className="admin-effect-list__count">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2>Matches per day (14 days)</h2>
            <div className="admin-chart">
              {stats.matchesPerDay.map(day => (
                <div key={day.date} className="admin-chart__col">
                  <div
                    className="admin-chart__bar"
                    style={{ height: `${(day.count / maxDaily) * 100}%` }}
                    title={`${day.date}: ${day.count}`}
                  />
                  <span className="admin-chart__label">{day.date.slice(5)}</span>
                  <span className="admin-chart__count">{day.count}</span>
                </div>
              ))}
            </div>
          </section>

          {stats.recentUsers.length > 0 && (
            <section className="admin-section">
              <h2>Recent players</h2>
              <p className="admin-section__hint">
                Likely your test devices are the ones with the most matches. Copy their IDs into Railway.
              </p>
              <div className="admin-user-table-wrap">
                <table className="admin-user-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Matches</th>
                      <th>Last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentUsers.map(row => (
                      <tr
                        key={row.userId}
                        className={row.userId === myDeviceId ? 'admin-user-table__row--mine' : undefined}
                      >
                        <td>
                          <code title={row.userId}>{shortUserId(row.userId)}</code>
                          {row.userId === myDeviceId && (
                            <span className="admin-user-table__badge">this device</span>
                          )}
                          {row.excluded && (
                            <span className="admin-user-table__badge admin-user-table__badge--muted">excluded</span>
                          )}
                        </td>
                        <td>{row.totalMatches}</td>
                        <td>{formatLastSeen(row.lastSeen)}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={() => void copyText(row.userId)}
                          >
                            Copy ID
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <section className="admin-section">
        <h2>Recent matches</h2>
        {matches.length === 0 ? (
          <p className="admin-section__hint">No finished matches recorded yet.</p>
        ) : (
          <>
            <p className="admin-section__hint">
              Last {matches.length} finished games. Mode shows Bot, Online (matchmaking), or Friend (private room).
            </p>
            <div className="admin-user-table-wrap">
              <table className="admin-user-table admin-match-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Mode</th>
                    <th>Result</th>
                    <th>Rounds</th>
                    <th>Duration</th>
                    <th>Effects used</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(match => (
                    <tr key={match.id}>
                      <td className="admin-match-table__time">{formatLastSeen(match.createdAt)}</td>
                      <td>
                        <code title={match.userId}>{shortUserId(match.userId)}</code>
                      </td>
                      <td>{modeLabel(match.opponentType)}</td>
                      <td>
                        <span className={`admin-match-winner ${winnerClass(match.winner)}`}>
                          {winnerLabel(match.winner)}
                        </span>
                      </td>
                      <td>{match.roundsPlayed}</td>
                      <td>{formatDuration(match.durationSeconds)}</td>
                      <td>
                        {match.effectsUsed.length === 0 ? (
                          <span className="admin-match-table__muted">—</span>
                        ) : (
                          <div className="admin-match-effects">
                            {match.effectsUsed.map((effect, i) => (
                              <span key={`${match.id}-${effect}-${i}`} className="admin-match-effect">
                                {effectLabel(effect)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
