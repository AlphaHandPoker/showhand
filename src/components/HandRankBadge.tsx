import { evaluateHand, HandRank } from '../game/poker';
import type { PlayingCard } from '../game/types';
import { HAND_SIZE } from '../game/types';
import { cardLabel } from '../game/deck';
import './HandRankBadge.css';

interface HandRankBadgeProps {
  cards: PlayingCard[];
}

const TIER_CLASS: Record<number, string> = {
  [HandRank.HighCard]: 'tier-high-card',
  [HandRank.Pair]: 'tier-pair',
  [HandRank.TwoPair]: 'tier-two-pair',
  [HandRank.ThreeOfAKind]: 'tier-trips',
  [HandRank.Straight]: 'tier-straight',
  [HandRank.Flush]: 'tier-flush',
  [HandRank.FullHouse]: 'tier-full',
  [HandRank.FourOfAKind]: 'tier-quads',
  [HandRank.StraightFlush]: 'tier-sflush',
  [HandRank.RoyalFlush]: 'tier-royal',
};

export function HandRankBadge({ cards }: HandRankBadgeProps) {
  if (cards.length === 0) return null;

  if (cards.length < HAND_SIZE) {
    return (
      <div className="hand-rank-badge tier-partial">
        <span className="hand-rank-name">{cards.length}/{HAND_SIZE} kart</span>
        <span className="hand-rank-detail">(desteden çekiliyor)</span>
      </div>
    );
  }

  const ev = evaluateHand(cards);
  const detail = ev.tiebreakers.slice(0, 3).map(r => cardLabel(r as Parameters<typeof cardLabel>[0])).join(', ');
  const tierClass = TIER_CLASS[ev.rank] ?? 'tier-high-card';

  return (
    <div className={`hand-rank-badge ${tierClass}`}>
      <span className="hand-rank-name">{ev.name}</span>
      <span className="hand-rank-detail">({detail})</span>
    </div>
  );
}
