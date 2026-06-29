import { useEffect } from 'react';
import type { EffectCard, PlayingCard } from '../game/types';
import { EFFECT_NAMES } from '../game/types';
import { cardLabel, suitSymbol, suitColor } from '../game/deck';
import { getEffectDescription, EFFECT_CATEGORY } from '../game/effectMeta';
import { EffectIcon } from '../ui/EffectIcon';
import { Snowflake, Shield, Eye } from 'lucide-react';
import './CardInspectOverlay.css';
import './Card.css';

export type InspectTarget =
  | { kind: 'poker'; card: PlayingCard; ownerId: 'player' | 'bot'; ownerLabel: string }
  | { kind: 'effect'; card: EffectCard; ownerId: 'player' | 'bot'; ownerLabel: string };

interface CardInspectOverlayProps {
  target: InspectTarget;
  currentTurn: number;
  onClose: () => void;
}

export function CardInspectOverlay({ target, currentTurn, onClose }: CardInspectOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="card-inspect-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Card details"
      onClick={onClose}
    >
      <div className="card-inspect-panel" onClick={e => e.stopPropagation()}>
        <button type="button" className="card-inspect-close" onClick={onClose} aria-label="Close">×</button>

        <p className="card-inspect-owner">{target.ownerLabel}</p>

        {target.kind === 'poker' ? (
          <PokerInspect card={target.card} currentTurn={currentTurn} />
        ) : (
          <EffectInspect card={target.card} ownerId={target.ownerId} />
        )}

        <p className="card-inspect-hint">Tap outside to close</p>
      </div>
    </div>
  );
}

function PokerInspect({ card, currentTurn }: { card: PlayingCard; currentTurn: number }) {
  const color = suitColor(card.suit);
  const isFrozen = card.frozenUntilTurn >= currentTurn;
  const isProtected = card.protectedUntilTurn >= currentTurn;
  const freezeTurns = isFrozen ? card.frozenUntilTurn - currentTurn + 1 : 0;
  const protectTurns = isProtected ? card.protectedUntilTurn - currentTurn + 1 : 0;

  return (
    <div className="card-inspect-poker-wrap">
      <div
        className={[
          'playing-card',
          'card-inspect-poker',
          color,
          isFrozen && 'playing-card--frozen',
          isProtected && 'playing-card--protected',
        ].filter(Boolean).join(' ')}
      >
        <span className="card-corner card-corner-tl">
          <span className="card-rank">{cardLabel(card.rank)}</span>
          <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
        </span>
        <span className="card-suit-center">{suitSymbol(card.suit)}</span>
        <span className="card-corner card-corner-br">
          <span className="card-rank">{cardLabel(card.rank)}</span>
          <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
        </span>

        {isFrozen && (
          <>
            <div className="frost-overlay frost-overlay--persistent" aria-hidden />
            <div className="card-status-badge card-status-badge--freeze">
              <Snowflake size={12} strokeWidth={2.2} />
              <span>{freezeTurns}</span>
            </div>
          </>
        )}
        {isProtected && (
          <div className="card-status-badge card-status-badge--protect">
            <Shield size={12} strokeWidth={2.2} />
            <span>{protectTurns}</span>
          </div>
        )}
      </div>
      <p className="card-inspect-title">
        {cardLabel(card.rank)}{suitSymbol(card.suit)}
        <span className="card-inspect-slot"> · Slot {card.slotIndex + 1}</span>
      </p>
    </div>
  );
}

function EffectInspect({ card, ownerId }: { card: EffectCard; ownerId: 'player' | 'bot' }) {
  const description = getEffectDescription(card.type);
  const category = EFFECT_CATEGORY[card.type];

  return (
    <div className="card-inspect-effect-wrap">
      <div className={`effect-card effect-card-large card-inspect-effect effect-cat-${category}`}>
        <div className="effect-card-frame card-inspect-effect-frame">
          <div className="effect-card-header">
            <span className="effect-card-name">{EFFECT_NAMES[card.type]}</span>
          </div>
          <div className="effect-card-art">
            <div className="effect-card-icon-badge card-inspect-effect-icon">
              <EffectIcon type={card.type} size={36} className="effect-card-icon" />
            </div>
          </div>
          <div className="effect-card-desc card-inspect-effect-desc">{description}</div>
          <div className="effect-card-gem" />
        </div>
      </div>
      <p className="card-inspect-title">{EFFECT_NAMES[card.type]}</p>
      {ownerId === 'bot' && (
        <p className="card-inspect-note">
          <Eye size={14} /> Opponent effect card
        </p>
      )}
    </div>
  );
}
