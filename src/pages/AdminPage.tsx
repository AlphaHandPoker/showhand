import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_BASE } from '../config/api';
import { GAME_NAME } from '../config/brand';
import { EFFECT_NAMES, type EffectType } from '../game/types';
import './AdminPage.css';

const ADMIN_TOKEN_KEY = 'pd_admin_token';

interface RoadmapStep {
  id: string;
  label: string;
  parentId: string | null;
  visits: number;
  uniqueUsers: number;
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

interface RetentionSummary {
  totalUsers: number;
  bouncedUsers: number;
  playedOnce: number;
  returningUsers: number;
  returningPercent: number;
  fivePlusMatches: number;
  finishedMatches: number;
}

interface RoadmapDashboard {
  meta: {
    excludedUserIds: string[];
    excludedMatchCount: number;
  };
  retention: RetentionSummary;
  steps: RoadmapStep[];
  journeys: UserJourney[];
}

interface AdminMatch {
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function modeLabel(type: 'bot' | 'player'): string {
  return type === 'player' ? 'Online' : 'Bot';
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

function RoadmapTree({ steps }: { steps: RoadmapStep[] }) {
  const byParent = useMemo(() => {
    const map = new Map<string | null, RoadmapStep[]>();
    for (const step of steps) {
      const key = step.parentId;
      const list = map.get(key) ?? [];
      list.push(step);
      map.set(key, list);
    }
    return map;
  }, [steps]);

  const renderBranch = (parentId: string | null, depth = 0): ReactNode => {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0) return null;

    return (
      <ul className={`admin-roadmap__branch admin-roadmap__branch--depth-${depth}`}>
        {children.map(step => (
          <li key={step.id} className="admin-roadmap__node">
            <div className="admin-roadmap__card">
              <span className="admin-roadmap__label">{step.label}</span>
              <span className="admin-roadmap__counts">
                {step.visits} visits · {step.uniqueUsers} users
              </span>
            </div>
            {renderBranch(step.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  };

  return <div className="admin-roadmap">{renderBranch(null)}</div>;
}

export function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<RoadmapDashboard | null>(null);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [journeyFilter, setJourneyFilter] = useState<UserJourney['status'] | 'all'>('all');

  const fetchDashboard = useCallback(async (authToken: string) => {
    setLoading(true);
    setFetchError('');
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [dashRes, matchesRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers }),
        fetch(`${API_BASE}/api/admin/matches?limit=100`, { headers }),
      ]);
      if (!dashRes.ok || !matchesRes.ok) {
        if (dashRes.status === 401 || matchesRes.status === 401) {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setToken('');
        }
        throw new Error('Could not load dashboard');
      }
      setDashboard(await dashRes.json() as RoadmapDashboard);
      const matchesData = await matchesRes.json() as { matches: AdminMatch[] };
      setMatches(matchesData.matches);
    } catch {
      setFetchError('Failed to load dashboard. Check server connection and password.');
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
    setDashboard(null);
    setMatches([]);
  };

  const filteredJourneys = useMemo(() => {
    if (!dashboard) return [];
    if (journeyFilter === 'all') return dashboard.journeys;
    return dashboard.journeys.filter(j => j.status === journeyFilter);
  }, [dashboard, journeyFilter]);

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

  const retention = dashboard?.retention;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>{GAME_NAME} Analytics</h1>
          <p className="admin-header__sub">Player roadmap · journeys · retention</p>
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

      {loading && !dashboard && <p className="admin-loading">Loading…</p>}
      {fetchError && <p className="admin-error">{fetchError}</p>}

      {dashboard && dashboard.meta.excludedUserIds.length > 0 && (
        <p className="admin-filter-note">
          Hiding {dashboard.meta.excludedUserIds.length} test user IDs from stats
          ({dashboard.meta.excludedMatchCount} matches excluded).
        </p>
      )}

      {retention && (
        <section className="admin-section">
          <h2>Retention</h2>
          <div className="admin-cards admin-cards--retention">
            <div className="admin-card">
              <span className="admin-card__label">Total visitors</span>
              <span className="admin-card__value">{retention.totalUsers}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Left immediately</span>
              <span className="admin-card__value">{retention.bouncedUsers}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Played once</span>
              <span className="admin-card__value">{retention.playedOnce}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Returning</span>
              <span className="admin-card__value">{retention.returningUsers}</span>
              <span className="admin-card__hint">{retention.returningPercent.toFixed(0)}%</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">5+ games</span>
              <span className="admin-card__value">{retention.fivePlusMatches}</span>
            </div>
            <div className="admin-card">
              <span className="admin-card__label">Finished matches</span>
              <span className="admin-card__value">{retention.finishedMatches}</span>
            </div>
          </div>
        </section>
      )}

      {dashboard && (
        <section className="admin-section">
          <h2>Player roadmap</h2>
          <p className="admin-section__hint">
            Each step links to the next. Counts show total visits and unique users.
          </p>
          <RoadmapTree steps={dashboard.steps} />
        </section>
      )}

      {dashboard && (
        <section className="admin-section">
          <h2>User journeys</h2>
          <p className="admin-section__hint">
            Who went where — bounced, clicked and left, started but didn&apos;t finish, or kept playing.
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
                    <td className="admin-match-table__time">{formatTime(journey.lastSeen)}</td>
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

      <section className="admin-section">
        <h2>Recent matches</h2>
        {matches.length === 0 ? (
          <p className="admin-section__hint">No finished matches recorded yet.</p>
        ) : (
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
                    <td className="admin-match-table__time">{formatTime(match.createdAt)}</td>
                    <td><code title={match.userId}>{shortUserId(match.userId)}</code></td>
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
        )}
      </section>
    </div>
  );
}
