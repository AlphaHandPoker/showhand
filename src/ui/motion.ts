/** Cached check — safe for SSR-less Vite client */
let reducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (reducedMotion === null) {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return reducedMotion;
}
