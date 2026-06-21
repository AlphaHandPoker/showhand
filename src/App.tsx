import { useState } from 'react';
import type { EffectType } from './game/types';
import { DraftScreen } from './components/DraftScreen';
import { GameBoard } from './components/GameBoard';
import { Lobby } from './components/Lobby';
import { OnlineGameBoard } from './components/OnlineGameBoard';
import { useOnlineGame } from './hooks/useOnlineGame';
import { buildBotDeckSelection } from './game/deckBuilder';
import './App.css';
import './components/Lobby.css';

type Screen = 'home' | 'online' | 'draft' | 'game';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [matchDecks, setMatchDecks] = useState<{ player: EffectType[]; bot: EffectType[] } | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const online = useOnlineGame();

  const handleStartBot = (playerDeck: EffectType[]) => {
    setMatchDecks({ player: playerDeck, bot: buildBotDeckSelection() });
    setGameKey(k => k + 1);
    setScreen('game');
  };

  const handleRestart = () => {
    setMatchDecks(null);
    setScreen('home');
  };

  if (screen === 'online') {
    const rs = online.roomState;
    if (rs && (rs.status === 'playing' || rs.status === 'finished')) {
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
        <Lobby online={online} onBack={() => setScreen('home')} />
      </div>
    );
  }

  if (screen === 'draft') {
    return (
      <div className="app">
        <DraftScreen onStart={handleStartBot} />
      </div>
    );
  }

  if (screen === 'game' && matchDecks) {
    return (
      <div className="app">
        <GameBoard
          key={gameKey}
          playerDeck={matchDecks.player}
          botDeck={matchDecks.bot}
          onRestart={handleRestart}
        />
      </div>
    );
  }

  return (
    <div className="app home-screen">
      <header className="home-header">
        <h1>SHOWHAND</h1>
        <p className="home-tagline">Açık poker elleri, gizli efekt kartları</p>
      </header>
      <div className="home-actions">
        <button type="button" className="home-btn home-btn--primary" onClick={() => setScreen('draft')}>
          Bota karşı oyna
        </button>
        <button type="button" className="home-btn home-btn--online" onClick={() => setScreen('online')}>
          Arkadaşınla oyna
        </button>
      </div>
    </div>
  );
}

export default App;
