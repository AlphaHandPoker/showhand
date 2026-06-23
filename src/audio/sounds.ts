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
const HIT_POOL_SIZE = 6;

class OneShotPool {
  private readonly pool: HTMLAudioElement[];
  private next = 0;

  constructor(url: string, size: number) {
    this.pool = Array.from({ length: size }, () => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      return audio;
    });
  }

  play(volume = DEFAULT_VOLUME): void {
    const audio = this.pool[this.next % this.pool.length]!;
    this.next += 1;
    try {
      if (!audio.paused) audio.pause();
      audio.currentTime = 0;
      audio.volume = volume;
      void audio.play().catch(() => {
        /* autoplay policy — ignore silently */
      });
    } catch {
      /* ignore */
    }
  }

  /** Prime decode + unlock autoplay after the first user-visible interaction. */
  warmUp(): void {
    for (const audio of this.pool) {
      const prevVolume = audio.volume;
      audio.volume = 0;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = prevVolume || DEFAULT_VOLUME;
        })
        .catch(() => {
          audio.volume = prevVolume || DEFAULT_VOLUME;
        });
    }
  }
}

const hitPool = new OneShotPool(hitCardUrl, HIT_POOL_SIZE);
const shufflePool = new OneShotPool(shuffleCardUrl, 2);

export function playShuffleSound(): void {
  shufflePool.play();
}

export function playHitCardSound(): void {
  hitPool.play();
}

/** Call once at game start (shuffle intro) so later card hits are reliable. */
export function warmUpGameAudio(): void {
  hitPool.warmUp();
}
