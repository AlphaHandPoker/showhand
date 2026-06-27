import { useEffect, useRef, type ReactNode } from 'react';
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
  aggressive: 'Saldırı',
  defensive: 'Savunma',
  utility: 'Araç',
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
              <h2 id="htp-title">Nasıl Oynanır?</h2>
              <p className="htp-header-sub">SHOWHAND — Açık poker, gizli efektler</p>
            </div>
          </div>
          <button type="button" className="htp-close" onClick={onClose} aria-label="Kapat">×</button>
        </header>

        <nav className="htp-nav" aria-label="Rehber bölümleri">
          <a href="#htp-goal">Amaç</a>
          <a href="#htp-loop">Döngü</a>
          <a href="#htp-board">Tahta</a>
          <a href="#htp-turn">Tur</a>
          <a href="#htp-play">Oyna</a>
          <a href="#htp-effects">Efektler</a>
          <a href="#htp-status">Durumlar</a>
          <a href="#htp-fizzle">Etkisiz</a>
          <a href="#htp-showdown">Showdown</a>
        </nav>

        <div className="htp-body">
          {/* ── Hero ── */}
          <div className="htp-hero">
            <p className="htp-lead">
              İki oyunculu bir poker düellosu: poker kartların <strong>açık</strong>, efekt kartların{' '}
              <strong>gizli</strong>. Her tur kör hamle yaparsın; çözülme sırasıyla efektler tek tek uygulanır.
              5 tur sonunda en iyi poker eli kazanır.
            </p>
          </div>

          <Section id="htp-goal" title="🎯 Amaç">
            <div className="htp-callout htp-callout--gold">
              <div className="htp-callout-visual">
                <div className="htp-slot-row">
                  {['A♠', 'K♠', 'Q♠', 'J♠', '10♠'].map((c, i) => (
                    <MiniCard key={i} rank={c.slice(0, -1)} suit={c.slice(-1)} />
                  ))}
                </div>
              </div>
              <p>
                5 round boyunca her tur 1 poker kartı çekilir. Round 5 sonunda elindeki <strong>5 kartlık poker eli</strong>{' '}
                rakibinkinden güçlüyse kazanırsın. Efektler kartları çalar, dondurur, dönüştürür — tahtayı sürekli değiştirir.
              </p>
            </div>
          </Section>

          <Section id="htp-loop" title="🔄 Oyun döngüsü">
            <div className="htp-flow">
              <div className="htp-flow-step">
                <span className="htp-flow-num">1</span>
                <span className="htp-flow-label">Taslak</span>
                <span className="htp-flow-detail">5 efekt seç</span>
              </div>
              <span className="htp-flow-arrow" aria-hidden>→</span>
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <div key={i} className="htp-flow-step htp-flow-step--round">
                  <span className="htp-flow-num">{i + 1}</span>
                  <span className="htp-flow-label">Round {i + 1}</span>
                  <span className="htp-flow-detail">Kilitle → Çöz → Çek</span>
                </div>
              ))}
              <span className="htp-flow-arrow" aria-hidden>→</span>
              <div className="htp-flow-step htp-flow-step--final">
                <span className="htp-flow-num">★</span>
                <span className="htp-flow-label">Showdown</span>
                <span className="htp-flow-detail">El karşılaştır</span>
              </div>
            </div>
            <p className="htp-note">
              Maç boyunca yeni efekt çekilmez — baştaki 5 efekt kartın tüm maç için elinde kalır (kullanılınca gider).
            </p>
          </Section>

          <Section id="htp-board" title="🖥 Tahta düzeni">
            <div className="htp-board-diagram">
              <div className="htp-board-col htp-board-col--left">
                <span className="htp-board-label">Sol panel</span>
                <ul>
                  <li>El sıralaması (merdiven)</li>
                  <li>Olay günlüğü</li>
                </ul>
              </div>
              <div className="htp-board-col htp-board-col--center">
                <span className="htp-board-label">Oyun alanı</span>
                <div className="htp-board-arena">
                  <div className="htp-board-zone htp-board-zone--bot">
                    <span>Rakip poker + efekt sırtları</span>
                  </div>
                  <div className="htp-board-midline">← commit lane | lane →</div>
                  <div className="htp-board-zone htp-board-zone--player">
                    <span>Senin poker + efekt kartların</span>
                  </div>
                </div>
              </div>
              <div className="htp-board-col htp-board-col--right">
                <span className="htp-board-label">Sağ panel</span>
                <ul>
                  <li>Çözülme sırası</li>
                  <li>Avatarlar</li>
                  <li>Pas Geç / Kilitle</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="htp-slots" title="📍 Slot sistemi">
            <p>Her poker kartı sabit bir <strong>pozisyonda</strong> durur (slot 1–5, soldan sağa). Efektler kart ID’si değil, <strong>slot numarası</strong> hedefler.</p>
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
              <p className="htp-note">Round 2: henüz çekilmemiş slotlar boştur ve hedef alınamaz.</p>
            </div>
          </Section>

          <Section id="htp-turn" title="⏱ Bir turda ne olur?">
            <ol className="htp-steps">
              <li>
                <strong>Commit (kilitleme)</strong>
                <p>0–{MAX_CARDS_PER_ROUND} efekt seç, hedeflerini belirle, <em>Kilitle</em> veya <em>Pas Geç</em>. Rakip de aynı anda kör commit yapar.</p>
                <div className="htp-inline-visual">
                  <div className="htp-lane-demo">
                    <span className="htp-lane-tag htp-lane-tag--left">Sol lane</span>
                    <MiniCard rank="?" faceDown />
                    <span className="htp-lane-tag htp-lane-tag--right">Sağ lane</span>
                  </div>
                  <span className="htp-note">Kilitlenince kartlar yanlara uçar — elinde görünmez.</span>
                </div>
              </li>
              <li>
                <strong>Çözülme</strong>
                <p>Efektler sırayla açılır ve uygulanır. Tek tek animasyonla izlersin.</p>
                <div className="htp-order-visual">
                  <div className="htp-order-row">
                    <span className="htp-order-badge htp-order-badge--odd">Tek round</span>
                    <span>Başlayan oyuncu önce</span>
                  </div>
                  <div className="htp-order-row">
                    <span className="htp-order-badge htp-order-badge--even">Çift round</span>
                    <span>Diğer oyuncu önce</span>
                  </div>
                </div>
              </li>
              <li>
                <strong>Round sonu</strong>
                <p>Koruma/dondurma süreleri güncellenir. Her oyuncu bir poker kartı daha çeker. Yeni commit fazına geçilir.</p>
              </li>
            </ol>
          </Section>

          <Section id="htp-play" title="🎮 Adım adım nasıl oynarsın?">
            <div className="htp-play-steps">
              {[
                { n: '1', t: 'Efekt kartına tıkla', d: 'Oynamak istediğin efekti seç (tur başına en fazla 2).' },
                { n: '2', t: 'Hedef seç', d: 'Kendi slotun, rakip slotu veya rakip efekt sırtı — efekt türüne göre değişir.' },
                { n: '3', t: 'İkinci efekt (isteğe bağlı)', d: 'Başka efekt ekleyebilir veya doğrudan kilitleyebilirsin.' },
                { n: '4', t: 'Kilitle veya Pas Geç', d: 'Sağ paneldeki altın buton. Pas = 0 efekt ile kilitle.' },
                { n: '5', t: 'Çözülmeyi izle', d: 'Efektler sırayla oynanır; olay günlüğünden takip et.' },
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

          <Section id="htp-effects" title="✨ Efekt kartları">
            <p className="htp-note">Taslakta 10 türden 5 kart seçersin (aynı türden en fazla 2). Tam Deste modunda tüm 10 kartın olur.</p>
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

          <Section id="htp-status" title="🛡 Durumlar">
            <div className="htp-status-grid">
              <div className="htp-status-card">
                <MiniCard rank="A" suit="♣" protected />
                <h4>Koru 🛡</h4>
                <p>Rakip efektleri bu slota uygulanamaz. Bu round + sonraki round geçerli.</p>
              </div>
              <div className="htp-status-card">
                <MiniCard rank="7" suit="♠" frozen />
                <h4>Dondur ❄</h4>
                <p>Kimse hedef alamaz (2 round). Temizle ile kaldırılabilir.</p>
              </div>
            </div>
          </Section>

          <Section id="htp-fizzle" title="💨 Etkisiz kalma (fizzle)">
            <div className="htp-callout htp-callout--warn">
              <p>
                Kör commit risklidir! Çözülme anında hedef geçersizse efekt <strong>tüketilir ama hiçbir şey olmaz</strong>:
              </p>
              <ul className="htp-bullet-list">
                <li>Hedef korumalı veya dondurulmuş</li>
                <li>Slot boş veya henüz çekilmemiş</li>
                <li>Rakip efekti zaten silinmiş</li>
                <li>Dönüştürme / kaydırma için destede uygun kart yok</li>
              </ul>
            </div>
          </Section>

          <Section id="htp-showdown" title="🏆 Showdown & el sıralaması">
            <p>Round 5 bittikten sonra standart poker kurallarıyla el karşılaştırılır (yüksekten düşüğe):</p>
            <ol className="htp-ladder">
              {LADDER_DISPLAY.map((rank, i) => (
                <li key={rank} className={i < 3 ? 'htp-ladder--top' : ''}>
                  <span className="htp-ladder-rank">{10 - i}</span>
                  <span>{HAND_RANK_NAMES[rank]}</span>
                </li>
              ))}
            </ol>
            <p className="htp-note">Round 1–4 arasında sol paneldeki merdiven <em>tahmini</em> el gücünü gösterir (~ işareti).</p>
          </Section>
        </div>

        <footer className="htp-footer">
          <button type="button" className="htp-footer-btn" onClick={onClose}>Anladım, kapat</button>
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
      aria-label="Nasıl oynanır rehberi"
      title="Nasıl oynanır"
    >
      i
    </button>
  );
}
