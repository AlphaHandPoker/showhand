import { useEffect, useRef, type ReactNode } from 'react';
import { GAME_NAME } from '../config/brand';
import {
  ALL_EFFECT_TYPES,
  EFFECT_DESCRIPTIONS,
  EFFECT_NAMES,
  MAX_CARDS_PER_ROUND,
  TOTAL_ROUNDS,
  type EffectType,
} from '../game/types';
import { HAND_RANK_NAMES, HandRank } from '../game/poker';
import { EFFECT_CATEGORY, type EffectCategory } from '../game/effectMeta';
import { EffectIcon } from '../ui/EffectIcon';
import './HowToPlayGuide.css';

interface HowToPlayGuideProps {
  onClose: () => void;
}

const CATEGORY_LABEL: Record<EffectCategory, string> = {
  aggressive: 'Attack',
  defensive: 'Defense',
  utility: 'Utility',
};

const CATEGORY_ORDER: EffectCategory[] = ['aggressive', 'defensive', 'utility'];

const EFFECTS_BY_CATEGORY = CATEGORY_ORDER.map(cat => ({
  category: cat,
  label: CATEGORY_LABEL[cat],
  effects: ALL_EFFECT_TYPES.filter(t => EFFECT_CATEGORY[t] === cat),
}));

const LADDER_DISPLAY = [
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
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="htp-section" id={id}>
      <h3 className="htp-section-title">{title}</h3>
      {children}
    </section>
  );
}

function MiniCard({ rank, suit, faceDown, protected: prot, frozen }: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  protected?: boolean;
  frozen?: boolean;
}) {
  if (faceDown) {
    return <div className="htp-mini-card htp-mini-card--back" aria-hidden>♠</div>;
  }
  return (
    <div className={`htp-mini-card${prot ? ' htp-mini-card--prot' : ''}${frozen ? ' htp-mini-card--frozen' : ''}`} aria-hidden>
      <span className="htp-mini-card-rank">{rank}</span>
      <span className="htp-mini-card-suit">{suit}</span>
      {prot && <span className="htp-mini-badge htp-mini-badge--prot">🛡</span>}
      {frozen && <span className="htp-mini-badge htp-mini-badge--frozen">❄</span>}
    </div>
  );
}

function EffectGuideCard({ type }: { type: EffectType }) {
  const cat = EFFECT_CATEGORY[type];
  return (
    <article className={`htp-effect-card htp-effect-card--${cat}`}>
      <div className="htp-effect-card-icon">
        <EffectIcon type={type} size={20} />
      </div>
      <div className="htp-effect-card-body">
        <h4 className="htp-effect-card-name">{EFFECT_NAMES[type]}</h4>
        <p className="htp-effect-card-desc">{EFFECT_DESCRIPTIONS[type]}</p>
      </div>
    </article>
  );
}

export function HowToPlayGuide({ onClose }: HowToPlayGuideProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="htp-overlay" role="dialog" aria-modal="true" aria-labelledby="htp-title">
      <div className="htp-backdrop" onClick={onClose} aria-hidden />
      <div className="htp-panel" ref={panelRef} tabIndex={-1}>
        <header className="htp-header">
          <div className="htp-header-brand">
            <span className="htp-header-mark">♠</span>
            <div>
              <h2 id="htp-title">How to Play</h2>
              <p className="htp-header-sub">{GAME_NAME} — Open poker, hidden effects</p>
            </div>
          </div>
          <button type="button" className="htp-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <nav className="htp-nav" aria-label="Guide sections">
          <a href="#htp-goal">Goal</a>
          <a href="#htp-loop">Loop</a>
          <a href="#htp-board">Board</a>
          <a href="#htp-turn">Turn</a>
          <a href="#htp-play">Play</a>
          <a href="#htp-effects">Effects</a>
          <a href="#htp-status">Statuses</a>
          <a href="#htp-fizzle">Fizzle</a>
          <a href="#htp-showdown">Showdown</a>
        </nav>

        <div className="htp-body">
          {/* ── Hero ── */}
          <div className="htp-hero">
            <p className="htp-lead">
              A two-player poker duel: your poker cards are <strong>face-up</strong>, your effect cards are{' '}
              <strong>hidden</strong>. Each turn you commit blindly; effects resolve one by one in order.
              After 5 rounds, the best poker hand wins.
            </p>
          </div>

          <Section id="htp-goal" title="🎯 Goal">
            <div className="htp-callout htp-callout--gold">
              <div className="htp-callout-visual">
                <div className="htp-slot-row">
                  {['A♠', 'K♠', 'Q♠', 'J♠', '10♠'].map((c, i) => (
                    <MiniCard key={i} rank={c.slice(0, -1)} suit={c.slice(-1)} />
                  ))}
                </div>
              </div>
              <p>
                Each round you draw 1 poker card over 5 rounds. After Round 5, if your <strong>5-card poker hand</strong>{' '}
                beats your opponent's, you win. Effects steal, freeze, and transform cards — constantly reshaping the board.
              </p>
            </div>
          </Section>

          <Section id="htp-loop" title="🔄 Game loop">
            <div className="htp-flow">
              <div className="htp-flow-step">
                <span className="htp-flow-num">1</span>
                <span className="htp-flow-label">Draft</span>
                <span className="htp-flow-detail">Pick 5 effects</span>
              </div>
              <span className="htp-flow-arrow" aria-hidden>→</span>
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <div key={i} className="htp-flow-step htp-flow-step--round">
                  <span className="htp-flow-num">{i + 1}</span>
                  <span className="htp-flow-label">Round {i + 1}</span>
                  <span className="htp-flow-detail">Lock → Resolve → Draw</span>
                </div>
              ))}
              <span className="htp-flow-arrow" aria-hidden>→</span>
              <div className="htp-flow-step htp-flow-step--final">
                <span className="htp-flow-num">★</span>
                <span className="htp-flow-label">Showdown</span>
                <span className="htp-flow-detail">Compare hands</span>
              </div>
            </div>
            <p className="htp-note">
              No new effects are drawn during the match — your initial 5 effect cards stay in hand for the whole game (removed when played).
            </p>
          </Section>

          <Section id="htp-board" title="🖥 Board layout">
            <div className="htp-board-diagram">
              <div className="htp-board-col htp-board-col--left">
                <span className="htp-board-label">Left panel</span>
                <ul>
                  <li>Hand ranking (ladder)</li>
                  <li>Event log</li>
                </ul>
              </div>
              <div className="htp-board-col htp-board-col--center">
                <span className="htp-board-label">Play area</span>
                <div className="htp-board-arena">
                  <div className="htp-board-zone htp-board-zone--bot">
                    <span>Opponent poker + effect backs</span>
                  </div>
                  <div className="htp-board-midline">← commit lane | lane →</div>
                  <div className="htp-board-zone htp-board-zone--player">
                    <span>Your poker + effect cards</span>
                  </div>
                </div>
              </div>
              <div className="htp-board-col htp-board-col--right">
                <span className="htp-board-label">Right panel</span>
                <ul>
                  <li>Resolution order</li>
                  <li>Avatars</li>
                  <li>Pass / Lock</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="htp-slots" title="📍 Slot system">
            <p>Each poker card sits in a fixed <strong>position</strong> (slots 1–5, left to right). Effects target <strong>slot numbers</strong>, not card IDs.</p>
            <div className="htp-slot-demo">
              <div className="htp-slot-labels">
                {['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Slot 5'].map(s => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <div className="htp-slot-row">
                <MiniCard rank="K" suit="♥" />
                <MiniCard rank="9" suit="♦" />
                <div className="htp-mini-card htp-mini-card--empty">+</div>
                <div className="htp-mini-card htp-mini-card--empty">+</div>
                <div className="htp-mini-card htp-mini-card--empty">+</div>
              </div>
              <p className="htp-note">Round 2: undrawn slots are empty and cannot be targeted.</p>
            </div>
          </Section>

          <Section id="htp-turn" title="⏱ What happens in a turn?">
            <ol className="htp-steps">
              <li>
                <strong>Commit (lock-in)</strong>
                <p>Select 0–{MAX_CARDS_PER_ROUND} effects, set targets, then <em>Lock</em> or <em>Pass</em>. Your opponent commits blindly at the same time.</p>
                <div className="htp-inline-visual">
                  <div className="htp-lane-demo">
                    <span className="htp-lane-tag htp-lane-tag--left">Left lane</span>
                    <MiniCard rank="?" faceDown />
                    <span className="htp-lane-tag htp-lane-tag--right">Right lane</span>
                  </div>
                  <span className="htp-note">When locked, cards fly to the sides — they disappear from your hand.</span>
                </div>
              </li>
              <li>
                <strong>Resolution</strong>
                <p>Effects reveal and apply one by one. You watch each one animate in sequence.</p>
                <div className="htp-order-visual">
                  <div className="htp-order-row">
                    <span className="htp-order-badge htp-order-badge--odd">Odd round</span>
                    <span>Starting player goes first</span>
                  </div>
                  <div className="htp-order-row">
                    <span className="htp-order-badge htp-order-badge--even">Even round</span>
                    <span>Other player goes first</span>
                  </div>
                </div>
              </li>
              <li>
                <strong>End of round</strong>
                <p>Protection and freeze durations update. Each player draws one more poker card. A new commit phase begins.</p>
              </li>
            </ol>
          </Section>

          <Section id="htp-play" title="🎮 How to play step by step">
            <div className="htp-play-steps">
              {[
                { n: '1', t: 'Click an effect card', d: 'Select the effect you want to play (up to 2 per turn).' },
                { n: '2', t: 'Choose a target', d: 'Your slot, an opponent slot, or an opponent effect back — depends on the effect type.' },
                { n: '3', t: 'Second effect (optional)', d: 'Add another effect or lock in right away.' },
                { n: '4', t: 'Lock or Pass', d: 'The gold button on screen. Pass = lock in with 0 effects.' },
                { n: '5', t: 'Watch resolution', d: 'Effects play out in order; follow along in the event log.' },
              ].map(step => (
                <div key={step.n} className="htp-play-step">
                  <span className="htp-play-num">{step.n}</span>
                  <div>
                    <strong>{step.t}</strong>
                    <p>{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="htp-effects" title="✨ Effect cards">
            <p className="htp-note">In the draft you pick 5 cards from 10 types (max 2 of the same type). In Full Deck mode you get all 10.</p>
            {EFFECTS_BY_CATEGORY.map(({ category, label, effects }) => (
              <div key={category} className="htp-effect-group">
                <h4 className={`htp-effect-group-title htp-effect-group-title--${category}`}>{label}</h4>
                <div className="htp-effect-grid">
                  {effects.map(type => (
                    <EffectGuideCard key={type} type={type} />
                  ))}
                </div>
              </div>
            ))}
          </Section>

          <Section id="htp-status" title="🛡 Statuses">
            <div className="htp-status-grid">
              <div className="htp-status-card">
                <MiniCard rank="A" suit="♣" protected />
                <h4>Protect 🛡</h4>
                <p>Opponent effects cannot target this slot. Lasts this round and the next.</p>
              </div>
              <div className="htp-status-card">
                <MiniCard rank="7" suit="♠" frozen />
                <h4>Freeze ❄</h4>
                <p>Nobody can target it (2 rounds). Can be removed with Clear.</p>
              </div>
            </div>
          </Section>

          <Section id="htp-fizzle" title="💨 Fizzle">
            <div className="htp-callout htp-callout--warn">
              <p>
                Blind commits are risky! If the target is invalid at resolution, the effect is <strong>spent but does nothing</strong>:
              </p>
              <ul className="htp-bullet-list">
                <li>Target is protected or frozen</li>
                <li>Slot is empty or not yet drawn</li>
                <li>Opponent effect was already removed</li>
                <li>No suitable card in the deck for transform / shift</li>
              </ul>
            </div>
          </Section>

          <Section id="htp-showdown" title="🏆 Showdown & hand ranking">
            <p>After Round 5, hands are compared by standard poker rules (high to low):</p>
            <ol className="htp-ladder">
              {LADDER_DISPLAY.map((rank, i) => (
                <li key={rank} className={i < 3 ? 'htp-ladder--top' : ''}>
                  <span className="htp-ladder-rank">{10 - i}</span>
                  <span>{HAND_RANK_NAMES[rank]}</span>
                </li>
              ))}
            </ol>
            <p className="htp-note">During Rounds 1–4, the left-panel ladder shows <em>estimated</em> hand strength (~ marker).</p>
          </Section>
        </div>

        <footer className="htp-footer">
          <button type="button" className="htp-footer-btn" onClick={onClose}>Got it, close</button>
        </footer>
      </div>
    </div>
  );
}

export function HowToPlayFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="htp-fab"
      onClick={onClick}
      aria-label="How to play guide"
      title="How to play"
    >
      i
    </button>
  );
}
