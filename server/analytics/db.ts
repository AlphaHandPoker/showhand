import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function isAnalyticsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function initAnalyticsSchema(): Promise<void> {
  const db = getPool();
  if (!db) {
    console.log('[analytics] DATABASE_URL not set — match tracking disabled');
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS match_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      opponent_type TEXT NOT NULL,
      winner TEXT NOT NULL,
      rounds_played INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      effects_used TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      user_id TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      total_matches INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_match_events_created_at ON match_events (created_at);
    CREATE INDEX IF NOT EXISTS idx_match_events_user_id ON match_events (user_id);

    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      properties JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events (created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events (event_name);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events (user_id);
  `);

  console.log('[analytics] schema ready');
}

export interface TrackMatchInput {
  userId: string;
  opponentType: 'bot' | 'player' | 'friend';
  winner: 'self' | 'opponent' | 'tie';
  roundsPlayed: number;
  durationSeconds: number;
  effectsUsed: string[];
}

export async function insertMatchEvent(input: TrackMatchInput): Promise<void> {
  const db = getPool();
  if (!db) return;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO match_events
        (user_id, opponent_type, winner, rounds_played, duration_seconds, effects_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId,
        input.opponentType,
        input.winner,
        input.roundsPlayed,
        input.durationSeconds,
        input.effectsUsed,
      ],
    );
    await client.query(
      `INSERT INTO user_sessions (user_id, first_seen, last_seen, total_matches)
       VALUES ($1, NOW(), NOW(), 1)
       ON CONFLICT (user_id) DO UPDATE SET
         last_seen = NOW(),
         total_matches = user_sessions.total_matches + 1`,
      [input.userId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface TrackAnalyticsEventInput {
  userId: string;
  eventName: string;
  properties: Record<string, string | number | boolean>;
}

export async function insertAnalyticsEvent(input: TrackAnalyticsEventInput): Promise<void> {
  const db = getPool();
  if (!db) return;

  await db.query(
    `INSERT INTO analytics_events (user_id, event_name, properties)
     VALUES ($1, $2, $3::jsonb)`,
    [input.userId, input.eventName, JSON.stringify(input.properties)],
  );

  await db.query(
    `INSERT INTO user_sessions (user_id, first_seen, last_seen, total_matches)
     VALUES ($1, NOW(), NOW(), 0)
     ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW()`,
    [input.userId],
  );
}
