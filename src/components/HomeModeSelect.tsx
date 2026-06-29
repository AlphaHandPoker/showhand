import { DEFAULT_GAME_MODE, DRAFT_MODE_ENABLED, GAME_MODE_INFO } from '../game/gameModes';
import type { GameMode } from '../game/types';
import './HomeModeSelect.css';

const MODES: GameMode[] = ['full_deck', 'draft'];

export function HomeModeSelect() {
  return (
    <div className="home-mode-select" role="group" aria-label="Game mode">
      {MODES.map(mode => {
        const info = GAME_MODE_INFO[mode];
        const isActive = mode === DEFAULT_GAME_MODE;
        const isLocked = mode === 'draft' && !DRAFT_MODE_ENABLED;

        return (
          <button
            key={mode}
            type="button"
            className={[
              'home-mode-chip',
              isActive && 'home-mode-chip--active',
              isLocked && 'home-mode-chip--locked',
            ].filter(Boolean).join(' ')}
            disabled={isLocked || isActive}
            aria-pressed={isActive}
            aria-disabled={isLocked || isActive}
          >
            <span className="home-mode-chip__title">{info.title}</span>
            {isLocked && (
              <span className="home-mode-chip__badge">Coming Soon</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
