import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Undo2,
  Shield,
  Shuffle,
  Dices,
  Snowflake,
  Eye,
  XCircle,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import type { EffectType } from '../game/types';

const EFFECT_LUCIDE_ICONS: Record<EffectType, LucideIcon> = {
  steal_card: ArrowLeftRight,
  send_back: Undo2,
  protect: Shield,
  transform: Shuffle,
  shift_chance: Dices,
  freeze: Snowflake,
  spy: Eye,
  force_delete: XCircle,
  cleanse: Sparkles,
  last_draw: RotateCcw,
};

interface EffectIconProps {
  type: EffectType;
  size?: number;
  className?: string;
}

export function EffectIcon({ type, size = 22, className }: EffectIconProps) {
  const Icon = EFFECT_LUCIDE_ICONS[type];
  return (
    <Icon
      size={size}
      strokeWidth={2}
      className={className}
      aria-hidden
    />
  );
}
