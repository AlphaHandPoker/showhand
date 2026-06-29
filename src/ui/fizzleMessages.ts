import type { EffectType } from '../game/types';
import { EFFECT_NAMES } from '../game/types';

/** Extract reason from fizzle log line. */
export function parseFizzleReason(logMessage?: string): string | null {
  if (!logMessage || !logMessage.includes('fizzled')) return null;
  const match = logMessage.match(/fizzled — (.+)/);
  return match?.[1] ?? null;
}

export interface FizzleToastContent {
  title: string;
  body: string;
}

export function formatFizzleToast(effectType: EffectType, reason: string | null): FizzleToastContent {
  const name = EFFECT_NAMES[effectType];

  if (!reason) {
    return { title: `${name} fizzled`, body: 'The effect could not be applied.' };
  }

  if (reason.includes('already played')) {
    return { title: `${name} fizzled`, body: 'The target card was already played.' };
  }
  if (reason.includes('frozen')) {
    return { title: `${name} fizzled`, body: 'Target is frozen — cannot apply to this card.' };
  }
  if (reason.includes('protected')) {
    return { title: `${name} fizzled`, body: 'Target is protected — cannot apply to this card.' };
  }
  if (reason.includes('no longer valid') || reason.includes('invalid')) {
    return { title: `${name} fizzled`, body: 'Target is no longer valid.' };
  }
  if (reason.includes('not selected') || reason.includes('missing')) {
    return { title: `${name} fizzled`, body: 'Target was not selected or is incomplete.' };
  }
  if (reason.includes('nothing to cleanse') || reason.includes('no freeze')) {
    return { title: `${name} fizzled`, body: 'No freeze effect to remove.' };
  }
  if (reason.includes('empty')) {
    return { title: `${name} fizzled`, body: 'Target slot is empty.' };
  }

  return {
    title: `${name} fizzled`,
    body: reason.endsWith('.') ? reason : `${reason}.`,
  };
}
