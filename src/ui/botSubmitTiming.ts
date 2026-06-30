/** Short human-like delay before disguised bot submits (ms). Does not affect bot decisions. */
export function getDisguisedBotSubmitDelayMs(_round: number): number {
  const extraSec = Math.floor(Math.random() * 4);
  return extraSec * 1000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
