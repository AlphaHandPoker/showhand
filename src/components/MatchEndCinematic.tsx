import { useEffect, useState } from 'react';
import type { GameState } from '../game/types';
import { evaluateHand } from '../game/poker';
import { ConfettiBurst } from './ConfettiBurst';
import './MatchEndCinematic.css';

type Phase = 'reveal' | 'ranks' | 'highlight' | 'banner' | 'done';

interface MatchEndCinematicProps {
  game: GameState;
  online?: boolean;
  onRestart: () => void;
}

export function MatchEndCinematic({ game, online, onRestart }: MatchEndCinematicProps) {
  const [phase, setPhase] = useState<Phase>('reveal');
  const [showButton, setShowButton] = useState(false);

  const playerEv = evaluateHand(game.players.player.pokerHand);
  const botEv = evaluateHand(game.players.bot.pokerHand);
  const playerWon = game.winner === 'player';
  const botWon = game.winner === 'bot';
  const isTie = game.winner === 'tie';

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('ranks'), 800);
    const t2 = window.setTimeout(() => setPhase('highlight'), 800 + 600 + 400);
    const t3 = window.setTimeout(() => setPhase('banner'), 800 + 600 + 400 + 400);
    const t4 = window.setTimeout(() => {
      setPhase('done');
      setShowButton(true);
    }, 800 + 600 + 400 + 400 + 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, []);

  const bannerText = playerWon
    ? 'SEN KAZANDIN!'
    : botWon
      ? (online ? 'KAYBETTİN' : 'BOT KAZANDI')
      : 'BERABERE';

  return (
    <>
      <ConfettiBurst active={phase === 'banner' && playerWon} />

      {(phase === 'ranks' || phase === 'highlight' || phase === 'banner' || phase === 'done') && (
        <div className="match-end-ranks" aria-live="polite">
          <div className={`match-end-rank match-end-rank--bot${botWon ? ' match-end-rank--winner' : ''}${playerWon ? ' match-end-rank--loser' : ''}`}>
            <span className="match-end-rank-label">{online ? 'Rakip' : 'Bot'}</span>
            <span className="match-end-rank-name">{botEv.name}</span>
          </div>
          <div className={`match-end-rank match-end-rank--player${playerWon ? ' match-end-rank--winner' : ''}${botWon ? ' match-end-rank--loser' : ''}`}>
            <span className="match-end-rank-label">Sen</span>
            <span className="match-end-rank-name">{playerEv.name}</span>
          </div>
        </div>
      )}

      {(phase === 'banner' || phase === 'done') && (
        <div className="match-end-banner-wrap">
          <div className={`match-end-banner${isTie ? ' match-end-banner--tie' : ''}`}>
            {bannerText}
          </div>
        </div>
      )}

      {showButton && (
        <div className="match-end-restart-wrap">
          <button type="button" className="btn-restart match-end-restart" onClick={onRestart}>
            {online ? 'Ana Menü' : 'Tekrar Oyna'}
          </button>
        </div>
      )}
    </>
  );
}

export function getMatchEndZoneClass(
  ownerId: 'player' | 'bot',
  winner: GameState['winner'],
  phase: 'idle' | 'highlight' | 'done',
): string {
  if (phase === 'idle' || !winner || winner === 'tie') return '';
  const isWinner = winner === ownerId;
  if (phase === 'highlight' || phase === 'done') {
    return isWinner ? 'zone--match-winner' : 'zone--match-loser';
  }
  return '';
}
