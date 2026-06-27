import type { EffectType, EffectCard } from './types';
import { ALL_EFFECT_TYPES, DECK_SIZE, MAX_PER_EFFECT_TYPE } from './types';

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}_${++idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function resetEffectIdCounter(): void {
  idCounter = 0;
}

export function createEffectCards(types: EffectType[]): EffectCard[] {
  return types.map(type => ({ id: uid('effect'), type }));
}

/** Full-deck mode: one copy of every effect type. */
export function buildFullEffectDeck(): EffectType[] {
  return [...ALL_EFFECT_TYPES];
}

export function validateDeckSelection(selection: EffectType[]): string | null {
  if (selection.length !== DECK_SIZE) {
    return `${DECK_SIZE} kart seçmelisin`;
  }
  const counts = new Map<EffectType, number>();
  for (const type of selection) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
    if ((counts.get(type) ?? 0) > MAX_PER_EFFECT_TYPE) {
      return `Aynı tipten en fazla ${MAX_PER_EFFECT_TYPE} kart seçebilirsin`;
    }
  }
  return null;
}

const SELF_BUFF: EffectType[] = ['shift_chance', 'transform', 'protect', 'last_draw'];
const DISRUPT: EffectType[] = ['steal_card', 'send_back', 'freeze', 'force_delete'];
const INFO: EffectType[] = ['spy', 'cleanse'];

function pickFromGroup(
  group: EffectType[],
  counts: Map<EffectType, number>,
  n: number,
): EffectType[] {
  const picked: EffectType[] = [];
  for (let i = 0; i < n; i++) {
    const available = group.filter(t => (counts.get(t) ?? 0) < MAX_PER_EFFECT_TYPE);
    if (available.length === 0) break;
    const type = available[Math.floor(Math.random() * available.length)];
    picked.push(type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return picked;
}

function fillRemaining(counts: Map<EffectType, number>, selection: EffectType[]): void {
  const all = [...SELF_BUFF, ...DISRUPT, ...INFO];
  while (selection.length < DECK_SIZE) {
    const available = all.filter(t => (counts.get(t) ?? 0) < MAX_PER_EFFECT_TYPE);
    if (available.length === 0) break;
    const type = available[Math.floor(Math.random() * available.length)];
    selection.push(type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
}

function pickFromGroupAtLeastOne(
  group: EffectType[],
  counts: Map<EffectType, number>,
): EffectType | null {
  const available = group.filter(t => (counts.get(t) ?? 0) < MAX_PER_EFFECT_TYPE);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** Balanced bot deck: ≥1 per group, ~2 self + ~2 disrupt + ~1 info (randomized) */
export function buildBotDeckSelection(): EffectType[] {
  const counts = new Map<EffectType, number>();
  const selection: EffectType[] = [];

  for (const group of [SELF_BUFF, DISRUPT, INFO]) {
    const pick = pickFromGroupAtLeastOne(group, counts);
    if (pick) {
      selection.push(pick);
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
  }

  const selfN = 2 + (Math.random() < 0.35 ? 1 : 0);
  const disruptN = 2 + (Math.random() < 0.35 ? 1 : 0);
  const infoN = Math.max(0, DECK_SIZE - selfN - disruptN);

  selection.push(...pickFromGroup(SELF_BUFF, counts, selfN));
  selection.push(...pickFromGroup(DISRUPT, counts, disruptN));
  selection.push(...pickFromGroup(INFO, counts, infoN));
  fillRemaining(counts, selection);

  return selection.slice(0, DECK_SIZE);
}
