export interface CardTheme {
  id: string;
  name: string;
  cardFaceBackground: string;
  cardFaceBorder: string;
  cardFaceRadius: string;
  redSuitColor: string;
  blackSuitColor: string;
  rankFontFamily?: string;
  cardBackBackground: string;
  cardBackPattern?: string;
  cardBackBorderColor: string;
  cardBackEmblem: string;
  effectCardBaseBackground: string;
  effectCardBorderStyle: string;
  avatarFrameStyle: string;
  avatarFrameColor: string;
  arenaTopHalf: string;
  arenaBottomHalf: string;
  arenaDividerColor: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'classic',
    name: 'Klasik',
    cardFaceBackground: '#f8f6f0',
    cardFaceBorder: 'rgba(0,0,0,0.1)',
    cardFaceRadius: '8px',
    redSuitColor: '#C0392B',
    blackSuitColor: '#1a1a2e',
    cardBackBackground: 'linear-gradient(150deg, #152a45, #1c3758)',
    cardBackBorderColor: 'rgba(212,168,67,0.3)',
    cardBackEmblem: 'SH',
    effectCardBaseBackground: '#12102a',
    effectCardBorderStyle: '1.5px solid',
    avatarFrameColor: '#d4a843',
    avatarFrameStyle: '3px solid #d4a843',
    arenaTopHalf: '#1a3a2a',
    arenaBottomHalf: '#0d2018',
    arenaDividerColor: 'rgba(212,168,67,0.5)',
  },
  {
    id: 'noir',
    name: 'Noir',
    cardFaceBackground: '#1a1a1a',
    cardFaceBorder: 'rgba(255,255,255,0.15)',
    cardFaceRadius: '8px',
    redSuitColor: '#ff4444',
    blackSuitColor: '#ffffff',
    cardBackBackground: 'linear-gradient(150deg, #0a0a0a, #1a1a1a)',
    cardBackBorderColor: 'rgba(255,255,255,0.2)',
    cardBackEmblem: '◆',
    effectCardBaseBackground: '#0a0a0a',
    effectCardBorderStyle: '1.5px solid',
    avatarFrameColor: '#ffffff',
    avatarFrameStyle: '3px solid #ffffff',
    arenaTopHalf: '#111111',
    arenaBottomHalf: '#0a0a0a',
    arenaDividerColor: 'rgba(255,255,255,0.3)',
  },
  {
    id: 'golden',
    name: 'Altın Çağ',
    cardFaceBackground: '#fdf8e8',
    cardFaceBorder: 'rgba(212,168,67,0.4)',
    cardFaceRadius: '8px',
    redSuitColor: '#8B0000',
    blackSuitColor: '#1a0a00',
    cardBackBackground: 'linear-gradient(150deg, #2a1a00, #1a0f00)',
    cardBackBorderColor: 'rgba(212,168,67,0.6)',
    cardBackEmblem: '♔',
    effectCardBaseBackground: '#1a1000',
    effectCardBorderStyle: '1.5px solid',
    avatarFrameColor: '#d4a843',
    avatarFrameStyle: '3px solid #d4a843',
    arenaTopHalf: '#1a1200',
    arenaBottomHalf: '#0f0a00',
    arenaDividerColor: 'rgba(212,168,67,0.8)',
  },
  {
    id: 'neon',
    name: 'Neon',
    cardFaceBackground: '#0a0a1a',
    cardFaceBorder: 'rgba(0,255,255,0.3)',
    cardFaceRadius: '8px',
    redSuitColor: '#ff0080',
    blackSuitColor: '#00ffff',
    cardBackBackground: 'linear-gradient(150deg, #0a0020, #000a1a)',
    cardBackBorderColor: 'rgba(139,92,246,0.5)',
    cardBackEmblem: '⬡',
    effectCardBaseBackground: '#050010',
    effectCardBorderStyle: '1.5px solid',
    avatarFrameColor: '#7F77DD',
    avatarFrameStyle: '3px solid #7F77DD',
    arenaTopHalf: 'linear-gradient(180deg, #0a0020, #000a1a)',
    arenaBottomHalf: 'linear-gradient(180deg, #000a0a, #0a0015)',
    arenaDividerColor: 'rgba(0,255,255,0.4)',
  },
  {
    id: 'crimson',
    name: 'Bordo',
    cardFaceBackground: '#f5f0f0',
    cardFaceBorder: 'rgba(139,0,0,0.2)',
    cardFaceRadius: '8px',
    redSuitColor: '#8B0000',
    blackSuitColor: '#2a0a0a',
    cardBackBackground: 'linear-gradient(150deg, #3a0000, #1a0000)',
    cardBackBorderColor: 'rgba(139,0,0,0.6)',
    cardBackEmblem: '♠',
    effectCardBaseBackground: '#1a0000',
    effectCardBorderStyle: '1.5px solid',
    avatarFrameColor: '#8B0000',
    avatarFrameStyle: '3px solid #8B0000',
    arenaTopHalf: '#2a0000',
    arenaBottomHalf: '#1a0000',
    arenaDividerColor: 'rgba(192,57,43,0.6)',
  },
];

export const DEFAULT_THEME_ID = 'classic';
export const THEME_STORAGE_KEY = 'showhand-theme';

export function getThemeById(id: string): CardTheme {
  return CARD_THEMES.find(t => t.id === id) ?? CARD_THEMES[0]!;
}

export function applyThemeToDocument(theme: CardTheme): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-card-face-bg', theme.cardFaceBackground);
  root.style.setProperty('--theme-card-face-border', theme.cardFaceBorder);
  root.style.setProperty('--theme-card-face-radius', theme.cardFaceRadius);
  root.style.setProperty('--theme-red-suit', theme.redSuitColor);
  root.style.setProperty('--theme-black-suit', theme.blackSuitColor);
  root.style.setProperty('--theme-card-back-bg', theme.cardBackBackground);
  root.style.setProperty('--theme-card-back-border', theme.cardBackBorderColor);
  root.style.setProperty('--theme-effect-card-bg', theme.effectCardBaseBackground);
  root.style.setProperty('--theme-effect-card-border', theme.effectCardBorderStyle);
  root.style.setProperty('--theme-avatar-frame', theme.avatarFrameStyle);
  root.style.setProperty('--theme-avatar-frame-color', theme.avatarFrameColor);
  root.style.setProperty('--arena-top', theme.arenaTopHalf);
  root.style.setProperty('--arena-bottom', theme.arenaBottomHalf);
  root.style.setProperty('--arena-divider', theme.arenaDividerColor);
  root.style.setProperty('--card-bg', theme.cardFaceBackground);
  root.style.setProperty('--effect-card-bg', theme.effectCardBaseBackground);
  if (theme.rankFontFamily) {
    root.style.setProperty('--theme-rank-font', theme.rankFontFamily);
  } else {
    root.style.removeProperty('--theme-rank-font');
  }
}
