import { EffectCardView } from './Cards';
import type { EffectToken } from '../ui/effectTokens';

interface Props {
  tokens: EffectToken[];
}

export function EffectTokenStack({ tokens }: Props) {
  return (
    <div className="token-slot-stack">
      {tokens.map((token, i) => (
        <div
          key={token.id}
          className={[
            'token-slot-card',
            token.leaving && 'token-slot-card--leaving',
          ].filter(Boolean).join(' ')}
          style={{ zIndex: i + 1 }}
        >
          <EffectCardView card={token.effect} disabled boardSize="arena" />
          {token.roundsLeft !== undefined && (
            <span className="token-rounds">{token.roundsLeft}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function TokenSlotPlaceholder() {
  return <div className="token-slot-placeholder" aria-hidden />;
}
