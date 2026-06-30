import { useEffect, useRef } from 'react';
import { GAME_NAME } from '../config/brand';
import { OnlinePlayersBadge } from './OnlinePlayersBadge';
import './LandingPage.css';

interface LandingPageProps {
  onPlayBot: () => void;
  onPlayOnline: () => void;
  onPlayFriend: () => void;
  onHowToPlay: () => void;
  onCosmetics: () => void;
}

type Suit = 'spade' | 'heart' | 'diamond' | 'club';

const SUIT_GLYPH: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
};

function PlayingCard({ rank, suit, className }: { rank: string; suit: Suit; className?: string }) {
  const glyph = SUIT_GLYPH[suit];
  const red = suit === 'heart' || suit === 'diamond';
  return (
    <div className={['lp-card', red ? 'lp-card--red' : 'lp-card--black', className].filter(Boolean).join(' ')}>
      <span className="lp-card__corner lp-card__corner--tl">
        <b>{rank}</b>
        <i>{glyph}</i>
      </span>
      <span className="lp-card__pip">{glyph}</span>
      <span className="lp-card__corner lp-card__corner--br">
        <b>{rank}</b>
        <i>{glyph}</i>
      </span>
    </div>
  );
}

const EFFECTS: { icon: string; name: string; desc: string; kind: 'red' | 'green' | 'purple' }[] = [
  { icon: '⇄', name: 'Steal', desc: 'Swap a card straight out of their hand into yours.', kind: 'red' },
  { icon: '❄', name: 'Freeze', desc: 'Lock an enemy card so they can’t protect or move it.', kind: 'red' },
  { icon: '🛡', name: 'Protect', desc: 'Shield your best card from every dirty trick.', kind: 'green' },
  { icon: '✦', name: 'Transform', desc: 'Morph a card’s suit to chase the perfect flush.', kind: 'purple' },
  { icon: '👁', name: 'Spy', desc: 'Peek at a hidden effect before they unleash it.', kind: 'purple' },
  { icon: '↺', name: 'Send Back', desc: 'Bounce their card to the deck and reroll it.', kind: 'red' },
];

export function LandingPage({
  onPlayBot,
  onPlayOnline,
  onPlayFriend,
  onHowToPlay,
  onCosmetics,
}: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.lp-reveal');
    if (!els || els.length === 0) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <div className="lp-bg" aria-hidden />

      <nav className="lp-nav">
        <div className="lp-nav__brand">
          <span className="lp-nav__logo">♠</span>
          <span className="lp-nav__name">{GAME_NAME}</span>
        </div>
        <div className="lp-nav__right">
          <OnlinePlayersBadge />
          <button type="button" className="lp-btn lp-btn--ghost lp-nav__cta" onClick={onPlayBot}>
            Play
          </button>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow">Free · No signup · Plays in your browser</span>
          <h1 className="lp-title">
            Poker where you can <span className="lp-title__accent">cheat</span>.
          </h1>
          <p className="lp-sub">
            Both hands are face-up. Your weapons aren’t. Steal, freeze, and transform cards
            across five blind rounds — then reveal the best hand to win the duel.
          </p>
          <div className="lp-cta-row">
            <button type="button" className="lp-btn lp-btn--primary lp-btn--xl" onClick={onPlayBot}>
              Play Free Now
              <span className="lp-btn__hint">instant · vs AI</span>
            </button>
            <button type="button" className="lp-btn lp-btn--outline lp-btn--xl" onClick={onPlayFriend}>
              Challenge a Friend
            </button>
          </div>
          <div className="lp-trust">
            <span>⚡ 2-minute matches</span>
            <span>🎴 No download</span>
            <span>🌐 Play live or vs AI</span>
          </div>
        </div>

        <div className="lp-hero__art" aria-hidden>
          <div className="lp-fan">
            <PlayingCard rank="10" suit="spade" className="lp-fan__c lp-fan__c1" />
            <PlayingCard rank="J" suit="spade" className="lp-fan__c lp-fan__c2" />
            <PlayingCard rank="Q" suit="spade" className="lp-fan__c lp-fan__c3" />
            <PlayingCard rank="K" suit="spade" className="lp-fan__c lp-fan__c4" />
            <PlayingCard rank="A" suit="spade" className="lp-fan__c lp-fan__c5" />
          </div>
          <div className="lp-chip lp-chip--red lp-chip--a">⇄ Steal</div>
          <div className="lp-chip lp-chip--green lp-chip--b">🛡 Protect</div>
          <div className="lp-chip lp-chip--purple lp-chip--c">✦ Transform</div>
        </div>
      </header>

      <section className="lp-section lp-reveal">
        <p className="lp-kicker">The twist</p>
        <h2 className="lp-h2">Every card on the table is a target</h2>
        <p className="lp-section-sub">
          Ten effect cards. Pick five before the duel, then play them blind. Mind games, not luck.
        </p>
        <div className="lp-effects">
          {EFFECTS.map((e, i) => (
            <div
              key={e.name}
              className={`lp-effect lp-effect--${e.kind} lp-reveal`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <span className="lp-effect__icon">{e.icon}</span>
              <span className="lp-effect__name">{e.name}</span>
              <span className="lp-effect__desc">{e.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-reveal">
        <p className="lp-kicker">How it works</p>
        <h2 className="lp-h2">Learn it in one match</h2>
        <div className="lp-steps">
          <div className="lp-step lp-reveal">
            <span className="lp-step__num">1</span>
            <h3>Draw &amp; scheme</h3>
            <p>Each round you draw a poker card into a fixed slot. Plan around what you both can see.</p>
          </div>
          <div className="lp-step lp-reveal" style={{ transitionDelay: '80ms' }}>
            <span className="lp-step__num">2</span>
            <h3>Commit blind</h3>
            <p>Secretly lock up to two effects and their targets. Your opponent does the same.</p>
          </div>
          <div className="lp-step lp-reveal" style={{ transitionDelay: '160ms' }}>
            <span className="lp-step__num">3</span>
            <h3>Reveal &amp; win</h3>
            <p>Effects resolve in order, cards fly, and after five rounds the best hand takes it.</p>
          </div>
        </div>
      </section>

      <section className="lp-section lp-reveal">
        <p className="lp-kicker">Three ways to play</p>
        <h2 className="lp-h2">Jump in however you want</h2>
        <div className="lp-modes">
          <button type="button" className="lp-mode lp-mode--primary lp-reveal" onClick={onPlayBot}>
            <span className="lp-mode__tag">Instant</span>
            <h3>Play vs Computer</h3>
            <p>No waiting. Face a sharp AI right now and learn the ropes.</p>
            <span className="lp-mode__go">Start playing →</span>
          </button>
          <button type="button" className="lp-mode lp-reveal" style={{ transitionDelay: '80ms' }} onClick={onPlayOnline}>
            <span className="lp-mode__tag">Live</span>
            <h3>Play Online</h3>
            <p>Get matched with a real opponent and prove who’s the better cheat.</p>
            <span className="lp-mode__go">Find a match →</span>
          </button>
          <button type="button" className="lp-mode lp-reveal" style={{ transitionDelay: '160ms' }} onClick={onPlayFriend}>
            <span className="lp-mode__tag">Private</span>
            <h3>Play with a Friend</h3>
            <p>Create a room, share the code, and settle it head-to-head.</p>
            <span className="lp-mode__go">Create a room →</span>
          </button>
        </div>
      </section>

      <section className="lp-final lp-reveal">
        <h2 className="lp-final__title">Ready to outplay everyone?</h2>
        <p className="lp-final__sub">One match and you’re hooked. No account, no install.</p>
        <button type="button" className="lp-btn lp-btn--primary lp-btn--xl" onClick={onPlayBot}>
          Play Free Now
        </button>
        <div className="lp-final__mini">
          <button type="button" className="lp-link" onClick={onHowToPlay}>How to play</button>
          <span className="lp-final__dot">·</span>
          <button type="button" className="lp-link" onClick={onCosmetics}>Cosmetics</button>
        </div>
      </section>

      <footer className="lp-footer">
        <span>{GAME_NAME}</span>
        <span className="lp-footer__muted">Open hands. Hidden weapons.</span>
      </footer>
    </div>
  );
}
