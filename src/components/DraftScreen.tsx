import { useState } from 'react';
import type { EffectType } from '../game/types';
import {
  ALL_EFFECT_TYPES, DECK_SIZE, MAX_PER_EFFECT_TYPE,
  EFFECT_NAMES, EFFECT_DESCRIPTIONS,
} from '../game/types';
import { validateDeckSelection } from '../game/deckBuilder';
import { EffectCardView } from './Cards';
import './DraftScreen.css';

export interface DraftOnlineProps {
  submitted: boolean;
  opponentSubmitted: boolean;
  bothReady: boolean;
  roomCode: string;
  statusMessage: string;
  serverError: string | null;
  onSubmit: (selection: EffectType[]) => void;
  onLeave: () => void;
}

interface DraftScreenProps {
  onStart: (selection: EffectType[]) => void;
  online?: DraftOnlineProps;
}

export function DraftScreen({ onStart, online }: DraftScreenProps) {
  const [selection, setSelection] = useState<EffectType[]>([]);
  const locked = online?.submitted ?? false;

  const counts = selection.reduce((acc, t) => {
    acc.set(t, (acc.get(t) ?? 0) + 1);
    return acc;
  }, new Map<EffectType, number>());

  const toggleType = (type: EffectType) => {
    if (locked) return;
    const count = counts.get(type) ?? 0;
    if (count >= MAX_PER_EFFECT_TYPE) {
      setSelection(prev => {
        const idx = prev.lastIndexOf(type);
        if (idx === -1) return prev;
        return prev.filter((_, i) => i !== idx);
      });
      return;
    }
    if (selection.length >= DECK_SIZE) return;
    setSelection(prev => [...prev, type]);
  };

  const removeAt = (index: number) => {
    if (locked) return;
    setSelection(prev => prev.filter((_, i) => i !== index));
  };

  const error = validateDeckSelection(selection);
  const canStart = error === null && !locked;

  return (
    <div className="draft-screen">
      <header className="draft-header">
        <h1>SHOWHAND</h1>
        {online ? (
          <>
            <p className="draft-subtitle">Çevrimiçi draft — {online.roomCode}</p>
            <p className="draft-online-status">{online.statusMessage}</p>
          </>
        ) : (
          <p className="draft-subtitle">5 efekt kartı seç — aynı tipten en fazla 2</p>
        )}
        <div className="draft-counter">
          <span className={selection.length === DECK_SIZE ? 'counter-full' : ''}>
            {selection.length} / {DECK_SIZE}
          </span>
        </div>
      </header>

      <div className="draft-layout">
        <section className="draft-pool">
          <h2>Kart Havuzu</h2>
          <div className="draft-pool-grid">
            {ALL_EFFECT_TYPES.map(type => {
              const count = counts.get(type) ?? 0;
              const disabled = selection.length >= DECK_SIZE && count === 0;
              return (
                <div
                  key={type}
                  className={['draft-pool-item', count > 0 && 'in-deck', disabled && 'disabled'].filter(Boolean).join(' ')}
                  title={EFFECT_DESCRIPTIONS[type]}
                >
                  <EffectCardView
                    card={{ id: `preview-${type}`, type }}
                    onClick={() => !disabled && !locked && toggleType(type)}
                    disabled={disabled || locked}
                    selected={count > 0}
                  />
                  {count > 0 && <span className="draft-type-count">×{count}</span>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="draft-hand">
          <h2>Seçilen El</h2>
          <div className="draft-hand-row">
            {Array.from({ length: DECK_SIZE }).map((_, i) => {
              const type = selection[i];
              if (!type) {
                return <div key={i} className="draft-slot draft-slot-empty">+</div>;
              }
              return (
                <div
                  key={`${type}-${i}`}
                  className="draft-slot"
                  title={`${EFFECT_NAMES[type]} — kaldırmak için tıkla`}
                >
                  <EffectCardView
                    card={{ id: `sel-${i}`, type }}
                    onClick={() => !locked && removeAt(i)}
                    selected
                  />
                </div>
              );
            })}
          </div>
          {error && selection.length > 0 && (
            <p className="draft-error">{error}</p>
          )}
          {online?.serverError && (
            <p className="draft-error">{online.serverError}</p>
          )}
          {online?.submitted && !online.bothReady && (
            <p className="draft-waiting">Rakibin destesini seçmesi bekleniyor…</p>
          )}
          {online?.bothReady && (
            <p className="draft-ready">Her iki deste hazır — maç yakında başlayacak (Aşama 3+)</p>
          )}
          <button
            type="button"
            className="btn-start-match"
            disabled={!canStart || (online?.submitted ?? false)}
            onClick={() => {
              if (online) {
                online.onSubmit(selection);
              } else {
                onStart(selection);
              }
            }}
          >
            {online ? (online.submitted ? 'Gönderildi' : 'Desteyi Kilitle') : 'Maça Başla'}
          </button>
          {online && (
            <button type="button" className="btn-draft-leave" onClick={online.onLeave}>
              Odadan çık
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
