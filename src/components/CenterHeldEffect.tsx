import type { EffectCard } from '../game/types';
import { EffectCardView } from './Cards';
import './CenterHeldEffect.css';

interface Props {
  effect: EffectCard;
}

/** Opaque effect card held at the arena cast-center anchor. */
export function CenterHeldEffect({ effect }: Props) {
  return (
    <div className="center-held-effect" data-cast-flight-source aria-hidden>
      <EffectCardView card={effect} readOnly />
    </div>
  );
}
