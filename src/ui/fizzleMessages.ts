import type { EffectType } from '../game/types';
import { EFFECT_NAMES } from '../game/types';

/** Extract reason from fizzle log line. */
export function parseFizzleReason(logMessage?: string): string | null {
  if (!logMessage || !logMessage.includes('geçersiz')) return null;
  const match = logMessage.match(/geçersiz — (.+)/);
  return match?.[1] ?? null;
}

export interface FizzleToastContent {
  title: string;
  body: string;
}

export function formatFizzleToast(effectType: EffectType, reason: string | null): FizzleToastContent {
  const name = EFFECT_NAMES[effectType];

  if (!reason) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Etki uygulanamadı.' };
  }

  if (reason.includes('çoktan oynandı')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Çünkü kart çoktan oynandı.' };
  }
  if (reason.includes('dondurulmuş')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Hedef dondurulmuş — bu karta uygulanamaz.' };
  }
  if (reason.includes('korumalı')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Hedef korumalı — bu karta uygulanamaz.' };
  }
  if (reason.includes('geçerli değil')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Hedef artık geçerli değil.' };
  }
  if (reason.includes('seçilmedi')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Hedef seçilmedi veya eksik.' };
  }
  if (reason.includes('dondurma yok')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Kaldırılacak dondurma efekti yok.' };
  }
  if (reason.includes('pozisyon boş')) {
    return { title: `${name} kartı geçersiz oldu`, body: 'Hedef pozisyon boş.' };
  }

  return {
    title: `${name} kartı geçersiz oldu`,
    body: reason.endsWith('.') ? reason : `${reason}.`,
  };
}
