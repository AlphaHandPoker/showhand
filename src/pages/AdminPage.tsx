import { useCallback, useEffect, useState } from 'react';
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

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [fetchError, setFetchError] = useState('');

  const fetchStats = useCallback(async (authToken: string) => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setToken('');
        }
        throw new Error('Could not load stats');
      }
      setStats(await res.json() as AdminStats);
    } catch {
      setFetchError('Failed to load stats. Check server connection and password.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void fetchStats(token);
  }, [token, fetchStats]);

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
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void fetchStats(token)}>
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

      {stats && stats.recentUsers.length > 0 && (
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

      {stats && (
        <>
          <section className="admin-section">
            <h2>Funnel</h2>
            <p className="admin-section__hint">
              Every button click and screen view. Finished games only count when a winner is decided.
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
                <span className="admin-card__label">Find Player</span>
                <span className="admin-card__value">{stats.funnel.findPlayerClicks}</span>
                <span className="admin-card__hint">{stats.funnel.findPlayerUsers} unique users</span>
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
                <span className="admin-card__label">Bot game started</span>
                <span className="admin-card__value">{stats.funnel.botGameStarted}</span>
              </div>
              <div className="admin-card">
                <span className="admin-card__label">Queue → bot fallback</span>
                <span className="admin-card__value">{stats.funnel.matchmakingFallbackBot}</span>
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
              <div className="admin-card">
                <span className="admin-card__label">Draft submitted</span>
                <span className="admin-card__value">{stats.funnel.draftSubmitted}</span>
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
                <span className="admin-card__label">Win rate vs player</span>
                <span className="admin-card__value">
                  {stats.gameBalance.winRateVsPlayer.toFixed(1)}%
                </span>
                <span className="admin-card__hint">{stats.gameBalance.playerMatches} matches</span>
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
        </>
      )}
    </div>
  );
}
