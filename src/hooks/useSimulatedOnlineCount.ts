import { useEffect, useState } from 'react';

const MIN_ONLINE = 80;
const MAX_ONLINE = 120;

function randomOnlineCount(): number {
  return MIN_ONLINE + Math.floor(Math.random() * (MAX_ONLINE - MIN_ONLINE + 1));
}

function nextOnlineCount(current: number): number {
  const delta = Math.floor(Math.random() * 7) - 3;
  return Math.min(MAX_ONLINE, Math.max(MIN_ONLINE, current + delta));
}

/** Decorative lobby count for the home screen (not real server data). */
export function useSimulatedOnlineCount(): number {
  const [count, setCount] = useState(randomOnlineCount);

  useEffect(() => {
    const tick = () => {
      setCount(prev => nextOnlineCount(prev));
      const delay = 1800 + Math.random() * 2200;
      timer = window.setTimeout(tick, delay);
    };

    let timer = window.setTimeout(tick, 2000 + Math.random() * 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return count;
}
