import { Snowflake, Shield, Eye } from 'lucide-react';
import type { HighlightGroup } from '../game/poker';
import type { PlayingCard, EffectCard, PlayerId } from '../game/types';
import { cardLabel, suitSymbol, suitColor } from '../game/deck';
import { EFFECT_NAMES } from '../game/types';
import { EFFECT_CATEGORY, getEffectDescription } from '../game/effectMeta';
import { EffectIcon } from '../ui/EffectIcon';
import { getEffectDrawClass } from '../ui/detectAnimations';
import { EffectCardLanes } from './MobileCardLanes';
import { useTheme } from '../theme/ThemeContext';
import type { EffectToken } from '../ui/effectTokens';
import './Card.css';

interface PlayingCardViewProps {
  card: PlayingCard;
  hidden?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  small?: boolean;
  currentTurn?: number;
  animClass?: string | null;
  shiftDisplayRank?: number;
  flipping?: boolean;
  highlightGroup?: HighlightGroup | null;
  slotAnchor?: string;
  untargetable?: boolean;
  targeted?: boolean;
  tokens?: EffectToken[];
  tokenSlotKey?: string;
}

export function PlayingCardSlot({
  card,
  hidden,
  selected,
  onClick,
  currentTurn = 1,
  animClass,
  shiftDisplayRank,
  flipping,
  highlightGroup,
  slotAnchor,
  untargetable,
  targeted,
  tokens = [],
  tokenSlotKey,
}: PlayingCardViewProps) {
  const { theme } = useTheme();
  const slotClass = ['playing-card-slot', targeted && 'playing-card-slot--targeted'].filter(Boolean).join(' ');

  if (hidden) {
    return (
      <div className={slotClass} data-slot-anchor={slotAnchor} data-token-slot-anchor={tokenSlotKey}>
        <button
          type="button"
          className={['playing-card', 'playing-card-back-face', selected && 'selected', animClass].filter(Boolean).join(' ')}
          onClick={onClick}
          disabled={!onClick}
        >
          <span className="playing-back-emblem">{theme.cardBackEmblem}</span>
        </button>
      </div>
    );
  }

  const color = suitColor(card.suit);
  const displayRank = shiftDisplayRank ?? card.rank;
  const isFrozen = card.frozenUntilTurn >= currentTurn;
  const isProtected = card.protectedUntilTurn >= currentTurn;
  const freezeTurns = isFrozen ? card.frozenUntilTurn - currentTurn + 1 : 0;
  const protectTurns = isProtected ? card.protectedUntilTurn - currentTurn + 1 : 0;

  return (
    <div className={slotClass} data-slot-anchor={slotAnchor} data-token-slot-anchor={tokenSlotKey}>
      {/* Tokens peek out from under the card */}
      {tokens.length > 0 && (
        <div className="card-under-tokens" aria-hidden>
          {tokens.map((tok, i) => (
            <div
              key={tok.id}
              className={['card-under-token', tok.leaving && 'card-under-token--leaving'].filter(Boolean).join(' ')}
              style={{ zIndex: i + 1 }}
              title={EFFECT_NAMES[tok.effect.type]}
            >
              <EffectIcon type={tok.effect.type} size={11} className="card-under-token-icon" />
              {tok.roundsLeft !== undefined && (
                <span className="card-under-token-rounds">{tok.roundsLeft}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className={[
          'playing-card',
          color,
          selected && 'selected',
          animClass,
          flipping && 'flipping',
          isFrozen && 'playing-card--frozen',
          isProtected && 'playing-card--protected',
          untargetable && 'playing-card--blocked',
          highlightGroup === 'primary' && 'highlight-primary',
          highlightGroup === 'secondary' && 'highlight-secondary',
          highlightGroup === 'premium' && 'highlight-premium',
        ].filter(Boolean).join(' ')}
        onClick={onClick}
        disabled={!onClick}
      >
        <span className="card-corner card-corner-tl">
          <span className="card-rank">{cardLabel(displayRank as PlayingCard['rank'])}</span>
          <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
        </span>
        <span className="card-suit-center">{suitSymbol(card.suit)}</span>
        <span className="card-corner card-corner-br">
          <span className="card-rank">{cardLabel(displayRank as PlayingCard['rank'])}</span>
          <span className="card-suit-sm">{suitSymbol(card.suit)}</span>
        </span>

        {isFrozen && (
          <>
            <div className="frost-overlay frost-overlay--persistent" aria-hidden />
            <div className="card-status-badge card-status-badge--freeze" title={`${freezeTurns} tur donduruldu`}>
              <Snowflake size={10} strokeWidth={2.2} />
              <span>{freezeTurns}</span>
            </div>
          </>
        )}

        {isProtected && (
          <div className="card-status-badge card-status-badge--protect" title={`${protectTurns} tur korumalı`}>
            <Shield size={10} strokeWidth={2.2} />
            <span>{protectTurns}</span>
          </div>
        )}
      </button>
    </div>
  );
}

interface EffectCardViewProps {
  card: EffectCard;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  animClass?: string | null;
  large?: boolean;
  castGlow?: boolean;
  compact?: boolean;
  boardSize?: 'bot' | 'player' | 'arena';
  spyRevealed?: boolean;
  spyFlipping?: boolean;
  targeted?: boolean;
  readOnly?: boolean;
}

export function EffectCardView({
  card,
  hidden,
  selected,
  onClick,
  disabled,
  animClass,
  large,
  castGlow,
  compact,
  boardSize,
  spyRevealed,
  spyFlipping,
  targeted,
  readOnly,
}: EffectCardViewProps) {
  if (hidden) {
    return <EffectCardBack onClick={onClick} disabled={disabled} selected={selected} compact={compact} readOnly={readOnly} />;
  }

  const category = EFFECT_CATEGORY[card.type];
  const description = getEffectDescription(card.type);
  const iconSize = large ? 28 : compact ? 16 : boardSize ? 20 : 22;

  const className = [
    'effect-card',
    `effect-cat-${category}`,
    selected && 'selected',
    animClass,
    large && 'effect-card-large',
    compact && 'effect-card-compact',
    boardSize === 'bot' && 'effect-card--board-bot',
    boardSize === 'player' && 'effect-card--board-player',
    boardSize === 'arena' && 'effect-card--board',
    castGlow && 'cast-glow',
    spyRevealed && 'effect-card--spy-revealed',
    spyFlipping && 'effect-card--spy-flip',
    targeted && 'effect-card--targeted',
    readOnly && 'effect-card--readonly',
  ].filter(Boolean).join(' ');

  const frame = (
    <div className="effect-card-frame">
      <div className="effect-card-header">
        <span className="effect-card-name">{EFFECT_NAMES[card.type]}</span>
      </div>
      <div className="effect-card-art">
        <div className="effect-card-icon-badge">
          <EffectIcon type={card.type} size={iconSize} className="effect-card-icon" />
        </div>
      </div>
      {!compact && <div className="effect-card-desc">{description}</div>}
      <div className="effect-card-gem" />
      {spyRevealed && (
        <>
          <div className="card-status-badge card-status-badge--spy" title="Rakip bu kartı gördü">
            <Eye size={10} strokeWidth={2.2} />
          </div>
          <div className="effect-spy-exposed-ribbon" aria-hidden>
            Rakip görüyor
          </div>
        </>
      )}
    </div>
  );

  if (readOnly) {
    return (
      <div className={className} aria-hidden>
        {frame}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={description}
    >
      {frame}
    </button>
  );
}

interface EffectCardBackProps {
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
  compact?: boolean;
  animClass?: string | null;
  effectAnchor?: string;
  spyFlipping?: boolean;
  targeted?: boolean;
  readOnly?: boolean;
}

export function EffectCardBack({
  onClick,
  disabled,
  selected,
  small,
  compact,
  animClass,
  effectAnchor,
  spyFlipping,
  targeted,
  readOnly,
}: EffectCardBackProps) {
  const { theme } = useTheme();
  const className = [
    'effect-card-back',
    selected && 'selected',
    small && 'small',
    compact && 'compact',
    spyFlipping && 'effect-card-back--spy-flip',
    targeted && 'effect-card-back--targeted',
    readOnly && 'effect-card-back--readonly',
    animClass,
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      <div className="effect-back-pattern" />
      <span className="effect-back-emblem">{theme.cardBackEmblem}</span>
    </>
  );

  if (readOnly || !onClick) {
    return (
      <div className={className} data-effect-anchor={effectAnchor} aria-hidden>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      data-effect-anchor={effectAnchor}
    >
      {inner}
    </button>
  );
}

interface OpponentEffectStackProps {
  effects: EffectCard[];
  ownerId: PlayerId;
  onCardClick?: (effectId: string, revealed: boolean) => void;
  selectable?: boolean;
  inspectable?: boolean;
  drawingEffectIds?: string[];
  revealedSpyIds?: Set<string>;
  spyFlipEffectId?: string | null;
  targetEffectId?: string | null;
  hiddenEffectIds?: Set<string>;
  overlayMaskEffectId?: string | null;
  mobileLanes?: boolean;
}

export function OpponentEffectStack({
  effects,
  ownerId,
  onCardClick,
  selectable,
  inspectable = false,
  drawingEffectIds = [],
  revealedSpyIds = new Set(),
  spyFlipEffectId = null,
  targetEffectId = null,
  hiddenEffectIds = new Set(),
  overlayMaskEffectId = null,
  mobileLanes = false,
}: OpponentEffectStackProps) {
  const cards = effects.map(effect => {
    if (hiddenEffectIds.has(effect.id)) return null;
    const isFlipping = spyFlipEffectId === effect.id;
    const isRevealed = revealedSpyIds.has(effect.id) && !isFlipping;
    const isTargeted = targetEffectId === effect.id;
    const overlayMasked = overlayMaskEffectId === effect.id;
    const tappable = onCardClick && (selectable || (inspectable && isRevealed));

    if (isRevealed) {
      return (
        <div
          key={effect.id}
          className={`effect-flight-anchor${overlayMasked ? ' effect-flight-anchor--overlay-active' : ''}`}
          data-effect-anchor={`${ownerId}-${effect.id}`}
        >
          <EffectCardView
            card={effect}
            spyRevealed
            spyFlipping={isFlipping}
            targeted={isTargeted}
            onClick={tappable ? () => onCardClick(effect.id, true) : undefined}
            disabled={!tappable}
          />
        </div>
      );
    }

    return (
      <div
        key={effect.id}
        className={`effect-flight-anchor${overlayMasked ? ' effect-flight-anchor--overlay-active' : ''}`}
        data-effect-anchor={`${ownerId}-${effect.id}`}
      >
        <EffectCardBack
          spyFlipping={isFlipping}
          targeted={isTargeted}
          animClass={getEffectDrawClass(effect.id, drawingEffectIds)}
          onClick={selectable && onCardClick ? () => onCardClick(effect.id, false) : undefined}
          disabled={!selectable}
        />
      </div>
    );
  });

  if (mobileLanes) {
    return <EffectCardLanes>{cards}</EffectCardLanes>;
  }

  return (
    <div className="effect-row">
      {cards}
    </div>
  );
}

export function DeckPile({ count }: { count: number }) {
  return (
    <div className="deck-pile" data-deck-anchor title={`${count} kart destede`}>
      <div className="deck-pile-card deck-pile-card-3" />
      <div className="deck-pile-card deck-pile-card-2" />
      <div className="deck-pile-card deck-pile-card-1" />
      <span className="deck-pile-count">{count}</span>
    </div>
  );
}

export function PokerCardEmptySlot({ slotAnchor, targeted, tokenSlotKey }: { slotAnchor?: string; targeted?: boolean; tokenSlotKey?: string }) {
  const slotClass = ['playing-card-slot', targeted && 'playing-card-slot--targeted'].filter(Boolean).join(' ');
  return (
    <div className={slotClass} data-slot-anchor={slotAnchor} data-token-slot-anchor={tokenSlotKey}>
      <div className="playing-card playing-card-empty-slot" aria-hidden>
        <span className="playing-empty-icon">+</span>
      </div>
    </div>
  );
}

export function PlayingCardView(props: PlayingCardViewProps) {
  return <PlayingCardSlot {...props} />;
}

export function CardBack({ small }: { small?: boolean }) {
  return <EffectCardBack small={small} />;
}
