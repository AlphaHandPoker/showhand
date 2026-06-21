import shuffleCardUrl from '../assets/sounds/shuffle_card.wav';
import hitCardUrl from '../assets/sounds/hit_card.wav';

/** Matches shuffle_card.wav length — keep animation + audio in sync */
export const SHUFFLE_DURATION_MS = 864;

/** Deck → slot travel (ease-out arrive) */
export const CARD_TRAVEL_MS = 280;

/** Horizontal scale-flip at destination after travel */
export const CARD_DECK_FLIP_MS = 260;

/** Full deck-origin reveal — hit plays when flip completes and face is visible */
export const CARD_DECK_REVEAL_MS = CARD_TRAVEL_MS + CARD_DECK_FLIP_MS;

/** Reduced-motion fallback — fade-in at target, no travel */
export const CARD_REVEAL_REDUCED_MS = 120;

const DEFAULT_VOLUME = 0.45;

function playOneShot(url: string, volume = DEFAULT_VOLUME): void {
  const audio = new Audio(url);
  audio.volume = volume;
  void audio.play().catch(() => {
    /* autoplay policy — ignore silently */
  });
}

export function playShuffleSound(): void {
  playOneShot(shuffleCardUrl);
}

export function playHitCardSound(): void {
  playOneShot(hitCardUrl);
}
