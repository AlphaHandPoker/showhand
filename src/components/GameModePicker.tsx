import type { GameMode } from '../game/types';
import { GAME_MODE_INFO } from '../game/gameModes';
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
        <p className="mode-picker-subtitle">Oyun modunu seç</p>
      </header>

      <div className="mode-picker-options">
        {(['draft', 'full_deck'] as GameMode[]).map(mode => {
          const info = GAME_MODE_INFO[mode];
          return (
            <button
              key={mode}
              type="button"
              className="mode-picker-card"
              onClick={() => onSelect(mode)}
            >
              <span className="mode-picker-card-title">{info.title}</span>
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
