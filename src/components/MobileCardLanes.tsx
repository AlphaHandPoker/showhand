import { Children, type ReactNode } from 'react';

const CARDS_PER_LANE = 5;

interface EffectCardLanesProps {
  children: ReactNode;
  className?: string;
}

/** Split effect cards into two lanes of 5 on mobile. */
export function EffectCardLanes({ children, className }: EffectCardLanesProps) {
  const items = Children.toArray(children);
  const lane1 = items.slice(0, CARDS_PER_LANE);
  const lane2 = items.slice(CARDS_PER_LANE);

  return (
    <div className={['effect-lanes', className].filter(Boolean).join(' ')}>
      <div className="effect-lane">{lane1}</div>
      {lane2.length > 0 && <div className="effect-lane effect-lane--second">{lane2}</div>}
    </div>
  );
}

interface PokerCardLanesProps {
  children: ReactNode;
  variant?: 'player' | 'bot';
}

/** Five poker slots in a fanned row on mobile — player row is larger. */
export function PokerCardLanes({ children, variant = 'bot' }: PokerCardLanesProps) {
  const rowClass = ['poker-lane', 'hand-row', variant === 'player' ? 'hand-row--player' : 'hand-row--bot'].join(' ');
  return (
    <div className={`poker-lanes poker-lanes--${variant}`}>
      <div className={rowClass}>{children}</div>
    </div>
  );
}
