import { useTheme } from '../theme/ThemeContext';
import { CARD_THEMES } from '../theme/cardThemes';
import './CosmeticsMenu.css';

interface CosmeticsMenuProps {
  onClose: () => void;
}

export function CosmeticsMenu({ onClose }: CosmeticsMenuProps) {
  const { theme, setThemeId } = useTheme();

  return (
    <div className="cosmetics-overlay" role="dialog" aria-label="Cosmetics">
      <div className="cosmetics-backdrop" onClick={onClose} aria-hidden />
      <div className="cosmetics-panel">
        <header className="cosmetics-header">
          <h2>Cosmetics</h2>
          <button type="button" className="cosmetics-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p className="cosmetics-sub">Pick a theme — cards, arena, and frames update instantly.</p>
        <div className="cosmetics-grid">
          {CARD_THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              className={`cosmetics-theme-card${theme.id === t.id ? ' cosmetics-theme-card--active' : ''}`}
              onClick={() => setThemeId(t.id)}
            >
              <div
                className="cosmetics-preview"
                style={{
                  background: t.cardFaceBackground,
                  borderColor: t.cardFaceBorder,
                  color: t.redSuitColor,
                }}
              >
                <span className="cosmetics-preview-rank">A</span>
                <span className="cosmetics-preview-suit">♥</span>
                <span className="cosmetics-preview-back" style={{ background: t.cardBackBackground }}>
                  {t.cardBackEmblem}
                </span>
              </div>
              <span className="cosmetics-theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
