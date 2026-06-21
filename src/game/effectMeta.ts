import type { EffectType } from './types';
import { EFFECT_DESCRIPTIONS } from './types';

export type EffectCategory = 'aggressive' | 'defensive' | 'utility';

export const EFFECT_CATEGORY: Record<EffectType, EffectCategory> = {
  steal_card: 'aggressive',
  send_back: 'aggressive',
  freeze: 'aggressive',
  force_delete: 'aggressive',
  protect: 'defensive',
  cleanse: 'defensive',
  last_draw: 'defensive',
  spy: 'utility',
  transform: 'utility',
  shift_chance: 'utility',
};

export function getEffectDescription(type: EffectType): string {
  return EFFECT_DESCRIPTIONS[type];
}
