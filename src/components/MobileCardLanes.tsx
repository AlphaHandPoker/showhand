import type { ReactNode } from 'react';

const CARDS_PER_LANE = 5;

interface EffectCardLanesProps {
  children: ReactNode;
  className?: string;
}

/** Split effect cards into two lanes of 5 on mobile. */
export function EffectCardLanes({ children, className }: EffectCardLanesProps) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
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
}

/** Five poker slots in a single grid lane on mobile. */
export function PokerCardLanes({ children }: PokerCardLanesProps) {
  return (
    <div className="poker-lanes">
      <div className="poker-lane">{children}</div>
    </div>
  );
}
