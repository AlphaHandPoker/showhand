import { HandRank, HAND_RANK_NAMES, evaluateHand } from '../game/poker';
import type { PlayingCard } from '../game/types';
import { HAND_SIZE } from '../game/types';
import './HandRankLadder.css';

const LADDER_RANKS: HandRank[] = [
  HandRank.RoyalFlush,
  HandRank.StraightFlush,
  HandRank.FourOfAKind,
  HandRank.FullHouse,
  HandRank.Flush,
  HandRank.Straight,
  HandRank.ThreeOfAKind,
  HandRank.TwoPair,
  HandRank.Pair,
  HandRank.HighCard,
];

const TIER_CLASS: Record<number, string> = {
  [HandRank.HighCard]: 'ladder-tier-base',
  [HandRank.Pair]: 'ladder-tier-base',
  [HandRank.TwoPair]: 'ladder-tier-mid',
  [HandRank.ThreeOfAKind]: 'ladder-tier-mid',
  [HandRank.Straight]: 'ladder-tier-mid',
  [HandRank.Flush]: 'ladder-tier-high',
  [HandRank.FullHouse]: 'ladder-tier-high',
  [HandRank.FourOfAKind]: 'ladder-tier-elite',
  [HandRank.StraightFlush]: 'ladder-tier-elite',
  [HandRank.RoyalFlush]: 'ladder-tier-royal',
};

interface HandRankLadderProps {
  playerHand: PlayingCard[] | null;
  botHand: PlayingCard[] | null;
}

export function HandRankLadder({ playerHand, botHand }: HandRankLadderProps) {
  const playerEv = playerHand && playerHand.length > 0 ? evaluateHand(playerHand) : null;
  const botEv = botHand && botHand.length > 0 ? evaluateHand(botHand) : null;
  const playerRank = playerEv?.rank ?? null;
  const botRank = botEv?.rank ?? null;
  const playerPartial = playerHand !== null && playerHand.length > 0 && playerHand.length < HAND_SIZE;
  const botPartial = botHand !== null && botHand.length > 0 && botHand.length < HAND_SIZE;

  return (
    <div className="hand-rank-ladder" aria-label="El sıralaması">
      <h3 className="ladder-title">El Sırası</h3>
      {(playerPartial || botPartial) && (
        <p className="ladder-subtitle">Tahmini el (kısmi)</p>
      )}
      <ol className="ladder-list">
        {LADDER_RANKS.map(rank => {
          const isPlayer = playerRank !== null && playerRank === rank;
          const isBot = botRank !== null && botRank === rank;
          const tierClass = TIER_CLASS[rank] ?? 'ladder-tier-base';

          return (
            <li
              key={rank}
              className={[
                'ladder-rung',
                tierClass,
                isPlayer && 'has-player',
                isBot && 'has-bot',
                isPlayer && playerPartial && 'has-player-partial',
                isBot && botPartial && 'has-bot-partial',
              ].filter(Boolean).join(' ')}
            >
              <span className="ladder-label">{HAND_RANK_NAMES[rank]}</span>
              <span className="ladder-markers">
                {isPlayer && (
                  <span
                    className="ladder-marker marker-player"
                    title={playerPartial ? `Sen — tahmini (${playerHand!.length}/${HAND_SIZE})` : 'Sen'}
                  >
                    {playerPartial ? `~${playerHand!.length}` : 'SEN'}
                  </span>
                )}
                {isBot && (
                  <span
                    className="ladder-marker marker-bot"
                    title={botPartial ? `Bot — tahmini (${botHand!.length}/${HAND_SIZE})` : 'Bot'}
                  >
                    {botPartial ? `~${botHand!.length}` : 'BOT'}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
