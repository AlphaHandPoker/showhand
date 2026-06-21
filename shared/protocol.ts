/** Shared Socket.io event names and payloads (client + server). */

export const ClientEvents = {
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  SUBMIT_DRAFT: 'SUBMIT_DRAFT',
} as const;

export const ServerEvents = {
  ROOM_STATE: 'ROOM_STATE',
  ROOM_ERROR: 'ROOM_ERROR',
} as const;

export type RoomStatus = 'waiting' | 'drafting' | 'draft_ready' | 'playing' | 'finished';

export interface JoinRoomPayload {
  code: string;
}

export interface SubmitDraftPayload {
  deck: string[];
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

export interface RoomStatePayload {
  code: string;
  yourSlot: 0 | 1;
  status: RoomStatus;
  players: RoomPlayerInfo[];
  /** Human-readable lobby status line */
  message: string;
  draft: RoomDraftStatus | null;
}

export interface RoomErrorPayload {
  message: string;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
