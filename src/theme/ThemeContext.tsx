import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyThemeToDocument,
  DEFAULT_THEME_ID,
  getThemeById,
  THEME_STORAGE_KEY,
  type CardTheme,
} from './cardThemes';

interface ThemeContextValue {
  theme: CardTheme;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadStoredThemeId(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && getThemeById(stored).id === stored) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(loadStoredThemeId);
  const theme = useMemo(() => getThemeById(themeId), [themeId]);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme, setThemeId }), [theme, setThemeId]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
