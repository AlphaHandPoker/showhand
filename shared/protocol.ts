/** Shared Socket.io event names and payloads (client + server). */

import type { CommittedAction } from '../src/game/types';
import type { GameState, GameMode } from '../src/game/types';

export const ClientEvents = {
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  FIND_MATCH: 'FIND_MATCH',
  CANCEL_FIND_MATCH: 'CANCEL_FIND_MATCH',
  FORFEIT_MATCH: 'FORFEIT_MATCH',
  SUBMIT_DRAFT: 'SUBMIT_DRAFT',
  LOCK_COMMIT: 'LOCK_COMMIT',
  REQUEST_SYNC: 'REQUEST_SYNC',
} as const;

export type { GameMode };

export interface CreateRoomPayload {
  mode: GameMode;
}

export interface FindMatchPayload {
  mode?: GameMode;
}

export const ServerEvents = {
  ROOM_STATE: 'ROOM_STATE',
  ROOM_ERROR: 'ROOM_ERROR',
  GAME_STATE: 'GAME_STATE',
} as const;

export type RoomStatus = 'waiting' | 'drafting' | 'draft_ready' | 'playing' | 'finished';

export interface JoinRoomPayload {
  code: string;
  /** Reclaim your slot after a socket reconnect mid-match. */
  reclaimSlot?: 0 | 1;
}

export interface SubmitDraftPayload {
  deck: string[];
}

export interface LockCommitPayload {
  actions: CommittedAction[];
}

export interface RoomDraftStatus {
  youSubmitted: boolean;
  opponentSubmitted: boolean;
  bothReady: boolean;
}

export interface RoomPlayerInfo {
  slot: 0 | 1;
  connected: boolean;
}

export interface RoomCommitStatus {
  youLocked: boolean;
  opponentLocked: boolean;
}

export interface RoomStatePayload {
  code: string;
  yourSlot: 0 | 1;
  status: RoomStatus;
  gameMode: GameMode;
  players: RoomPlayerInfo[];
  /** Human-readable lobby status line */
  message: string;
  draft: RoomDraftStatus | null;
  commit: RoomCommitStatus | null;
}

export interface GameStatePayload {
  game: GameState;
  youLocked: boolean;
  opponentLocked: boolean;
}

export interface RoomErrorPayload {
  message: string;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
