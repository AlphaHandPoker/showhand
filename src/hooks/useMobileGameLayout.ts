import { useEffect, useState } from 'react';

/** Phones — scroll layout in any orientation (no rotate blocker). */
export const MOBILE_GAME_LAYOUT_MQ =
  '(max-width: 768px), (orientation: landscape) and (max-height: 600px) and (max-width: 1024px)';

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
