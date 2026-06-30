import { track } from '@vercel/analytics';
import { trackEventToServer } from './trackEvent';

export type AppScreen = 'home' | 'searching' | 'online' | 'game';

/** Fire an analytics event (Vercel + self-hosted admin). */
export function trackEvent(
  name: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (data) {
    track(name, data);
    trackEventToServer(name, data);
  } else {
    track(name);
    trackEventToServer(name);
  }
}

const lastScreenRef = { current: '' as AppScreen | '' };

/** Track SPA screen changes — this app has no file-based routes. */
export function trackScreen(screen: AppScreen): void {
  if (lastScreenRef.current === screen) return;
  lastScreenRef.current = screen;
  trackEvent('screen_view', { screen });
}

export const AnalyticsEvents = {
  ctaClick: (action: 'play_vs_computer' | 'find_player' | 'how_to_play' | 'cosmetics') =>
    trackEvent('cta_click', { action }),
  matchmakingStarted: () => trackEvent('matchmaking_started'),
  matchFound: (mode: string) => trackEvent('match_found', { mode }),
  matchmakingFallbackBot: () => trackEvent('matchmaking_fallback_bot'),
  botGameStarted: (disguised: boolean, mode: string) =>
    trackEvent('bot_game_started', { disguised, mode }),
  onlineMatchLeft: () => trackEvent('online_match_left'),
  gameFinished: (mode: 'online' | 'bot', winner: string, round: number) =>
    trackEvent('game_finished', { mode, winner, round }),
  roomCreated: (mode: string) => trackEvent('room_created', { mode }),
  roomJoined: () => trackEvent('room_joined'),
  draftSubmitted: (mode: 'online' | 'bot') => trackEvent('draft_submitted', { mode }),
  gameStarted: (mode: 'online' | 'bot', disguised: boolean) =>
    trackEvent('game_started', { mode, disguised }),
  matchForfeited: (mode: 'online' | 'bot') => trackEvent('match_forfeited', { mode }),
} as const;
