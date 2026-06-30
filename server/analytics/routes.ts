import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createAdminToken,
  getAdminPassword,
  verifyAdminPassword,
  verifyAdminToken,
} from './adminAuth.js';
import { fetchAdminStats } from './stats.js';
import { fetchRecentMatches } from './matches.js';
import { insertMatchEvent, insertAnalyticsEvent, isAnalyticsEnabled, type TrackMatchInput } from './db.js';

export const analyticsRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function parseTrackBody(body: unknown): TrackMatchInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const userId = typeof b.user_id === 'string' ? b.user_id.trim() : '';
  const opponentType = b.opponent_type === 'bot'
    || b.opponent_type === 'player'
    || b.opponent_type === 'friend'
    ? b.opponent_type
    : null;
  const winner = b.winner === 'self' || b.winner === 'opponent' || b.winner === 'tie'
    ? b.winner
    : null;
  const roundsPlayed = Number(b.rounds_played);
  const durationSeconds = Number(b.duration_seconds);
  const effectsUsed = Array.isArray(b.effects_used)
    ? b.effects_used.filter((e): e is string => typeof e === 'string')
    : [];

  if (!userId || !opponentType || !winner) return null;
  if (!Number.isFinite(roundsPlayed) || roundsPlayed < 1) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return null;

  return {
    userId,
    opponentType,
    winner,
    roundsPlayed: Math.round(roundsPlayed),
    durationSeconds: Math.round(durationSeconds),
    effectsUsed,
  };
}

function parseEventProperties(value: unknown): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

function parseTrackEventBody(body: unknown): { userId: string; eventName: string; properties: Record<string, string | number | boolean> } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const userId = typeof b.user_id === 'string' ? b.user_id.trim() : '';
  const eventName = typeof b.event_name === 'string' ? b.event_name.trim() : '';
  if (!userId || !eventName || eventName.length > 64) return null;
  const properties = parseEventProperties(b.properties);
  if (properties === null) return null;
  return { userId, eventName, properties };
}

analyticsRouter.post('/track-match', async (req, res) => {
  if (!isAnalyticsEnabled()) {
    res.status(503).json({ error: 'Analytics not configured' });
    return;
  }

  const input = parseTrackBody(req.body);
  if (!input) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    await insertMatchEvent(input);
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics] track-match failed', err);
    res.status(500).json({ error: 'Could not record match' });
  }
});

analyticsRouter.post('/track-event', async (req, res) => {
  if (!isAnalyticsEnabled()) {
    res.status(503).json({ error: 'Analytics not configured' });
    return;
  }

  const input = parseTrackEventBody(req.body);
  if (!input) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    await insertAnalyticsEvent({
      userId: input.userId,
      eventName: input.eventName,
      properties: input.properties,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics] track-event failed', err);
    res.status(500).json({ error: 'Could not record event' });
  }
});

analyticsRouter.post('/admin/login', (req, res) => {
  if (!getAdminPassword()) {
    res.status(503).json({ error: 'Admin not configured' });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyAdminPassword(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = createAdminToken();
  if (!token) {
    res.status(503).json({ error: 'Admin not configured' });
    return;
  }

  res.json({ token });
});

analyticsRouter.get('/admin/stats', requireAdmin, async (_req, res) => {
  if (!isAnalyticsEnabled()) {
    res.status(503).json({ error: 'Analytics not configured' });
    return;
  }

  try {
    const stats = await fetchAdminStats();
    res.json(stats);
  } catch (err) {
    console.error('[analytics] stats failed', err);
    res.status(500).json({ error: 'Could not load dashboard' });
  }
});

analyticsRouter.get('/admin/matches', requireAdmin, async (req, res) => {
  if (!isAnalyticsEnabled()) {
    res.status(503).json({ error: 'Analytics not configured' });
    return;
  }

  const limit = Number(req.query.limit ?? 100);

  try {
    const matches = await fetchRecentMatches(limit);
    res.json({ matches });
  } catch (err) {
    console.error('[analytics] matches failed', err);
    res.status(500).json({ error: 'Could not load matches' });
  }
});
