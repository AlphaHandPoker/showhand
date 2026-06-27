import type { CommittedAction, EffectCard, GameState, PlayerId } from '../game/types';

export interface CommitLaneCard {
  effectId: string;
  effect: EffectCard;
  ownerId: PlayerId;
  laneIndex: number;
  /** Bot cards start hidden; player cards visible in lane. */
  faceDown: boolean;
  revealed: boolean;
  active: boolean;
  consumed: boolean;
  /** Card left the lane for resolution — do not render in lane again. */
  departed: boolean;
}

export function buildCommitLanes(state: GameState): CommitLaneCard[] {
  const lanes: CommitLaneCard[] = [];

  for (const ownerId of ['player', 'bot'] as PlayerId[]) {
    const actions = state.roundCommits[ownerId].actions;
    actions.forEach((action: CommittedAction, laneIndex: number) => {
      const effect = state.players[ownerId].effectHand.find(e => e.id === action.effectId);
      if (!effect) return;
      lanes.push({
        effectId: action.effectId,
        effect,
        ownerId,
        laneIndex,
        faceDown: ownerId === 'bot',
        revealed: ownerId === 'player',
        active: false,
        consumed: false,
        departed: false,
      });
    });
  }

  return lanes;
}

export function laneSlotSelector(ownerId: PlayerId, laneIndex: number): string {
  return `[data-commit-lane-slot="${ownerId}-${laneIndex}"]`;
}

export function laneCardSelector(effectId: string): string {
  return `[data-commit-lane-card="${effectId}"]`;
}

/** Effect ids still shown on commit lanes — hide the same cards in effect hands. */
export function activeLaneHiddenIds(lanes: CommitLaneCard[]): string[] {
  return lanes.filter(l => !l.consumed).map(l => l.effectId);
}
