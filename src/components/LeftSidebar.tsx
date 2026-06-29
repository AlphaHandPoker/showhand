import type { GameLogEntry, PlayingCard } from '../game/types';
import { HandRankLadder } from './HandRankLadder';
import { GameLogPanel } from './GameLogPanel';
import './LeftSidebar.css';
import './GameLogPanel.css';

interface Props {
  playerHand: PlayingCard[] | null;
  botHand: PlayingCard[] | null;
  logEntries: GameLogEntry[];
}

export function LeftSidebar({
  playerHand,
  botHand,
  logEntries,
}: Props) {
  return (
    <aside className="left-sidebar" aria-label="Hand ranks and event log">
      <header className="rail-brand">
        <span className="rail-brand-mark">♠</span>
        <span className="rail-brand-word">SHOWHAND</span>
      </header>

      <div className="left-sidebar-top">
        <HandRankLadder playerHand={playerHand} botHand={botHand} />
      </div>

      <div className="sidebar-divider" aria-hidden />

      <div className="left-sidebar-bottom">
        <GameLogPanel entries={logEntries} />
      </div>
    </aside>
  );
}
