import type { PlayingCard } from '../game/types';
import { cardLabel, suitSymbol, suitColor } from '../game/deck';

interface PlayingCardFaceProps {
  card: PlayingCard;
  className?: string;
}

export function PlayingCardFace({ card, className }: PlayingCardFaceProps) {
  const color = suitColor(card.suit);
  return (
    <div className={['playing-card-face-mini', color, className].filter(Boolean).join(' ')}>
      <span className="card-corner card-corner-tl">
        <span className="card-rank">{cardLabel(card.rank)}</span>
        <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
      </span>
      <span className="card-suit-center">{suitSymbol(card.suit)}</span>
      <span className="card-corner card-corner-br">
        <span className="card-rank">{cardLabel(card.rank)}</span>
        <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
      </span>
    </div>
  );
}
