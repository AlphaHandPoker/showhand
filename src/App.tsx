import { useCallback, useEffect, useState } from 'react';
import type { GameMode } from './game/types';
import { GameBoard } from './components/GameBoard';
import { OnlineGameBoard } from './components/OnlineGameBoard';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { HomeModeSelect } from './components/HomeModeSelect';
import { CosmeticsMenu } from './components/CosmeticsMenu';
import { HowToPlayGuide } from './components/HowToPlayGuide';
import { useOnlineGame } from './hooks/useOnlineGame';
import { buildFullEffectDeck } from './game/deckBuilder';
import { DEFAULT_GAME_MODE } from './game/gameModes';
import { GAME_NAME } from './config/brand';
import { OnlinePlayersBadge } from './components/OnlinePlayersBadge';
import { AnalyticsEvents, trackScreen } from './analytics';
import './App.css';
import './components/CosmeticsMenu.css';
import './components/MatchmakingScreen.css';
import './components/HomeModeSelect.css';
import './components/OnlinePlayersBadge.css';

type Screen = 'home' | 'searching' | 'online' | 'game';

interface MatchConfig {
  mode: GameMode;
  disguisedOpponent: boolean;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [matchConfig, setMatchConfig] = useState<MatchConfig | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const online = useOnlineGame();

  const startBotMatch = useCallback((disguised: boolean) => {
    AnalyticsEvents.botGameStarted(disguised, DEFAULT_GAME_MODE);
    setMatchConfig({ mode: DEFAULT_GAME_MODE, disguisedOpponent: disguised });
    setGameKey(k => k + 1);
    setScreen('game');
  }, []);

  const handleRestart = () => {
    setMatchConfig(null);
    setScreen('home');
  };

  const handlePlayVsComputer = () => {
    AnalyticsEvents.ctaClick('play_vs_computer');
    startBotMatch(false);
  };

  const handleFindPlayer = () => {
    AnalyticsEvents.ctaClick('find_player');
    online.cancelFindMatch();
    online.leaveRoom();
    setScreen('searching');
  };

  const handleMatchFound = useCallback(() => {
    AnalyticsEvents.matchFound(DEFAULT_GAME_MODE);
    setScreen('online');
  }, []);

  const handleMatchmakingFallback = useCallback(() => {
    AnalyticsEvents.matchmakingFallbackBot();
    startBotMatch(true);
  }, [startBotMatch]);

  useEffect(() => {
    trackScreen(screen);
  }, [screen]);

  const rs = online.roomState;
  const onlineNeedsHome = screen === 'online'
    && rs
    && rs.status !== 'playing'
    && rs.status !== 'finished'
    && online.gamePayload === null;

  useEffect(() => {
    if (onlineNeedsHome) {
      online.leaveRoom();
      setScreen('home');
    }
  }, [onlineNeedsHome, online]);

  if (screen === 'searching') {
    return (
      <div className="app">
        <MatchmakingScreen
          online={online}
          onMatched={handleMatchFound}
          onFallbackToBot={handleMatchmakingFallback}
        />
      </div>
    );
  }

  if (screen === 'online') {
    const roomState = online.roomState;
    const inMatch = roomState && (
      roomState.status === 'playing'
      || roomState.status === 'finished'
      || online.gamePayload !== null
    );

    if (inMatch) {
      return (
        <OnlineGameBoard
          online={online}
          onLeave={() => {
            AnalyticsEvents.onlineMatchLeft();
            online.leaveRoom();
            setScreen('home');
          }}
        />
      );
    }

    return null;
  }

  if (screen === 'game' && matchConfig) {
    const fullDeck = buildFullEffectDeck();
    return (
      <div className="app">
        <GameBoard
          key={gameKey}
          playerDeck={fullDeck}
          botDeck={fullDeck}
          gameMode={matchConfig.mode}
          disguisedOpponent={matchConfig.disguisedOpponent}
          onRestart={handleRestart}
        />
      </div>
    );
  }

  return (
    <div className="app home-screen">
      {showCosmetics && <CosmeticsMenu onClose={() => setShowCosmetics(false)} />}
      {showHowToPlay && <HowToPlayGuide onClose={() => setShowHowToPlay(false)} />}
      <header className="home-header">
        <h1>{GAME_NAME}</h1>
        <p className="home-tagline">Open poker hands, hidden effect cards</p>
        <OnlinePlayersBadge />
      </header>
      <HomeModeSelect />
      <div className="home-actions">
        <button type="button" className="home-btn home-btn--primary" onClick={handlePlayVsComputer}>
          Play vs Computer
        </button>
        <button type="button" className="home-btn home-btn--search" onClick={handleFindPlayer}>
          Find Player
        </button>
        <button type="button" className="home-btn home-btn--guide" onClick={() => {
          AnalyticsEvents.ctaClick('how_to_play');
          setShowHowToPlay(true);
        }}>
          How to Play
        </button>
        <button type="button" className="home-btn home-btn--cosmetics" onClick={() => {
          AnalyticsEvents.ctaClick('cosmetics');
          setShowCosmetics(true);
        }}>
          Cosmetics
        </button>
      </div>
    </div>
  );
}

export default App;
