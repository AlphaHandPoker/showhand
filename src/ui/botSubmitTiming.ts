/** Human-like delay before disguised bot submits (ms). Does not affect bot decisions. */
export function getDisguisedBotSubmitDelayMs(round: number): number {
  let minSec: number;
  let maxSec: number;

  if (round <= 2) {
    minSec = 6;
    maxSec = 10;
  } else if (round <= 4) {
    minSec = 4;
    maxSec = 8;
  } else {
    minSec = 3;
    maxSec = 6;
  }

  const baseSec = minSec + Math.random() * (maxSec - minSec);
  const varianceSec = Math.random() * 2 - 1;
  return Math.max(500, (baseSec + varianceSec) * 1000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
