import { useState } from 'react';
import type { EffectType, GameMode } from './game/types';
import { DraftScreen } from './components/DraftScreen';
import { GameBoard } from './components/GameBoard';
import { Lobby } from './components/Lobby';
import { OnlineGameBoard } from './components/OnlineGameBoard';
import { GameModePicker } from './components/GameModePicker';
import { CosmeticsMenu } from './components/CosmeticsMenu';
import { HowToPlayGuide } from './components/HowToPlayGuide';
import { useOnlineGame } from './hooks/useOnlineGame';
import { buildBotDeckSelection, buildFullEffectDeck } from './game/deckBuilder';
import './App.css';
import './components/Lobby.css';
import './components/GameModePicker.css';
import './components/CosmeticsMenu.css';

type Screen = 'home' | 'pick-mode-bot' | 'pick-mode-online' | 'online' | 'draft' | 'game';

interface MatchConfig {
  player: EffectType[];
  bot: EffectType[];
  mode: GameMode;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [matchConfig, setMatchConfig] = useState<MatchConfig | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [onlineRoomMode, setOnlineRoomMode] = useState<GameMode>('draft');
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const online = useOnlineGame();

  const startBotMatch = (mode: GameMode, playerDeck: EffectType[]) => {
    const botDeck = mode === 'full_deck' ? buildFullEffectDeck() : buildBotDeckSelection();
    setMatchConfig({ player: playerDeck, bot: botDeck, mode });
    setGameKey(k => k + 1);
    setScreen('game');
  };

  const handleBotModeSelect = (mode: GameMode) => {
    if (mode === 'full_deck') {
      startBotMatch('full_deck', buildFullEffectDeck());
    } else {
      setMatchConfig(null);
      setScreen('draft');
    }
  };

  const handleStartBotDraft = (playerDeck: EffectType[]) => {
    startBotMatch('draft', playerDeck);
  };

  const handleRestart = () => {
    setMatchConfig(null);
    setScreen('home');
  };

  if (screen === 'pick-mode-bot') {
    return (
      <div className="app">
        <GameModePicker
          title="Bota karşı"
          onSelect={handleBotModeSelect}
          onBack={() => setScreen('home')}
        />
      </div>
    );
  }

  if (screen === 'pick-mode-online') {
    return (
      <div className="app">
        <GameModePicker
          title="Arkadaşınla oyna"
          onSelect={mode => {
            setOnlineRoomMode(mode);
            setScreen('online');
          }}
          onBack={() => setScreen('home')}
        />
      </div>
    );
  }

  if (screen === 'online') {
    const rs = online.roomState;
    const inMatch = rs && (
      rs.status === 'playing'
      || rs.status === 'finished'
      || online.gamePayload !== null
    );

    if (inMatch) {
      return (
        <OnlineGameBoard
          online={online}
          onLeave={() => {
            online.leaveRoom();
            setScreen('home');
          }}
        />
      );
    }
    if (rs && (rs.status === 'drafting' || rs.status === 'draft_ready')) {
      return (
        <div className="app">
          <DraftScreen
            onStart={() => {}}
            online={{
              submitted: rs.draft?.youSubmitted ?? false,
              opponentSubmitted: rs.draft?.opponentSubmitted ?? false,
              bothReady: rs.draft?.bothReady ?? false,
              roomCode: rs.code,
              statusMessage: rs.message,
              serverError: online.error,
              onSubmit: selection => online.submitDraft(selection),
              onLeave: () => {
                online.leaveRoom();
                setScreen('home');
              },
            }}
          />
        </div>
      );
    }

    return (
      <div className="app">
        <Lobby
          online={online}
          createMode={onlineRoomMode}
          onBack={() => setScreen('home')}
        />
      </div>
    );
  }

  if (screen === 'draft') {
    return (
      <div className="app">
        <DraftScreen onStart={handleStartBotDraft} />
      </div>
    );
  }

  if (screen === 'game' && matchConfig) {
    return (
      <div className="app">
        <GameBoard
          key={gameKey}
          playerDeck={matchConfig.player}
          botDeck={matchConfig.bot}
          gameMode={matchConfig.mode}
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
        <h1>SHOWHAND</h1>
        <p className="home-tagline">Açık poker elleri, gizli efekt kartları</p>
      </header>
      <div className="home-actions">
        <button type="button" className="home-btn home-btn--primary" onClick={() => setScreen('pick-mode-bot')}>
          Bota karşı oyna
        </button>
        <button type="button" className="home-btn home-btn--online" onClick={() => setScreen('pick-mode-online')}>
          Arkadaşınla oyna
        </button>
        <button type="button" className="home-btn home-btn--guide" onClick={() => setShowHowToPlay(true)}>
          Nasıl oynanır?
        </button>
        <button type="button" className="home-btn home-btn--cosmetics" onClick={() => setShowCosmetics(true)}>
          Kozmetikler
        </button>
      </div>
    </div>
  );
}

export default App;
