import { useEffect, useRef } from 'react';
import type { GameLogEntry } from '../game/types';
import './GameLogPanel.css';

interface Props {
  entries: GameLogEntry[];
}

export function GameLogPanel({ entries }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = entries.filter(e => e.kind);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, visible[visible.length - 1]?.message]);

  return (
    <section className="game-log">
      <h3>Olaylar</h3>
      <div className="log-entries" ref={scrollRef}>
        {visible.length === 0 && (
          <p className="log-empty">Round başladığında olaylar burada görünür.</p>
        )}
        {visible.map((entry, i) => (
          <LogEntry key={`${entry.turn}-${i}-${entry.message}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function LogEntry({ entry }: { entry: GameLogEntry }) {
  if (entry.kind === 'round') {
    return (
      <div className="log-entry log-entry--round">
        <span className="log-round-label">{entry.message}</span>
      </div>
    );
  }

  if (entry.kind === 'result') {
    return (
      <div className="log-entry log-entry--result">
        <span className="log-result-text">{entry.message}</span>
      </div>
    );
  }

  const effectName = entry.effectName ?? entry.message.split(':')[0]?.trim() ?? entry.message;
  const detail = entry.detail ?? entry.message.includes(':')
    ? entry.message.slice(entry.message.indexOf(':') + 1).trim()
    : '';

  return (
    <div className={`log-entry log-entry--effect ${entry.playerId ?? ''}`}>
      <div className="log-effect-line">
        <span className="log-effect-name">{effectName}</span>
        {detail && <span className="log-effect-detail">{detail}</span>}
      </div>
    </div>
  );
}
