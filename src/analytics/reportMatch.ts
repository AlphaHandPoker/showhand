import type { GameState } from '../game/types';
import { EFFECT_NAMES, type EffectType } from '../game/types';
import { getOrCreateUserId } from './userId';
import { trackMatchToServer } from './trackMatch';

const NAME_TO_TYPE = Object.fromEntries(
  Object.entries(EFFECT_NAMES).map(([type, name]) => [name, type]),
) as Record<string, EffectType>;

function collectEffectsUsed(game: GameState): string[] {
  const used: string[] = [];
  for (const entry of game.log) {
    if (entry.kind !== 'effect' || entry.playerId !== 'player') continue;
    if (entry.detail?.startsWith('fizzled')) continue;
    const name = entry.effectName;
    if (!name) continue;
    const type = NAME_TO_TYPE[name];
    if (type) used.push(type);
  }
  return used;
}

function toWinnerField(winner: GameState['winner']): 'self' | 'opponent' | 'tie' | null {
  if (!winner) return null;
  if (winner === 'player') return 'self';
  if (winner === 'bot') return 'opponent';
  return 'tie';
}

export function reportMatchToServer(
  game: GameState,
  options: {
    online: boolean;
    disguisedOpponent?: boolean;
    matchStartedAt: number;
  },
): void {
  const winner = toWinnerField(game.winner);
  if (!winner) return;

  const opponentType: 'bot' | 'player' = options.online && !options.disguisedOpponent
    ? 'player'
    : 'bot';

  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - options.matchStartedAt) / 1000),
  );

  trackMatchToServer({
    user_id: getOrCreateUserId(),
    opponent_type: opponentType,
    winner,
    rounds_played: game.currentRound,
    duration_seconds: durationSeconds,
    effects_used: collectEffectsUsed(game),
  });
}
