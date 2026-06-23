import type { GameLogEntry, PlayingCard } from '../game/types';
import { HandRankLadder } from './HandRankLadder';
import { GameLogPanel } from './GameLogPanel';
import './LeftSidebar.css';

interface Props {
  playerHand: PlayingCard[] | null;
  botHand: PlayingCard[] | null;
  logEntries: GameLogEntry[];
}

export function LeftSidebar({ playerHand, botHand, logEntries }: Props) {
  return (
    <aside className="left-sidebar" aria-label="El sırası ve olaylar">
      <HandRankLadder playerHand={playerHand} botHand={botHand} />
      <GameLogPanel entries={logEntries} />
    </aside>
  );
}
