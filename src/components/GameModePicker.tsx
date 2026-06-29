import type { GameMode } from '../game/types';
import { DEFAULT_GAME_MODE, DRAFT_MODE_ENABLED, GAME_MODE_INFO } from '../game/gameModes';
import './GameModePicker.css';

interface GameModePickerProps {
  title: string;
  onSelect: (mode: GameMode) => void;
  onBack: () => void;
}

export function GameModePicker({ title, onSelect, onBack }: GameModePickerProps) {
  return (
    <div className="mode-picker-screen">
      <header className="mode-picker-header">
        <h1>{title}</h1>
        <p className="mode-picker-subtitle">Choose game mode</p>
      </header>

      <div className="mode-picker-options">
        {(['full_deck', 'draft'] as GameMode[]).map(mode => {
          const info = GAME_MODE_INFO[mode];
          const isLocked = mode === 'draft' && !DRAFT_MODE_ENABLED;
          const isDefault = mode === DEFAULT_GAME_MODE;

          return (
            <button
              key={mode}
              type="button"
              className={[
                'mode-picker-card',
                isDefault && 'mode-picker-card--active',
                isLocked && 'mode-picker-card--locked',
              ].filter(Boolean).join(' ')}
              disabled={isLocked}
              onClick={() => !isLocked && onSelect(mode)}
            >
              <span className="mode-picker-card-title">
                {info.title}
                {isLocked && <span className="mode-picker-card-badge">Coming Soon</span>}
              </span>
              <span className="mode-picker-card-sub">{info.subtitle}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="mode-picker-back" onClick={onBack}>
        ← Geri
      </button>
    </div>
  );
}
