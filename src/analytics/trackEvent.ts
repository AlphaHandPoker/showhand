import { API_BASE } from '../config/api';
import { getOrCreateUserId } from './userId';

export type TrackEventProperties = Record<string, string | number | boolean>;

/** Fire-and-forget funnel telemetry to Railway Postgres. */
export function trackEventToServer(
  eventName: string,
  properties: TrackEventProperties = {},
): void {
  const url = `${API_BASE}/api/track-event`;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: getOrCreateUserId(),
      event_name: eventName,
      properties,
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt gameplay.
  });
}
