import { useEffect, useState } from 'react';

/** Landscape phone game board — side rails + center poker. */
export const MOBILE_GAME_LAYOUT_MQ =
  '(orientation: landscape) and (max-height: 600px) and (max-width: 1024px)';

export function useMobileGameLayout(): boolean {
  const [active, setActive] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(MOBILE_GAME_LAYOUT_MQ).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_GAME_LAYOUT_MQ);
    const onChange = (e: MediaQueryListEvent) => setActive(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return active;
}
