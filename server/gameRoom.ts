import type { EffectType } from '../src/game/types.js';
import type { CommittedAction, GameState, GameMode } from '../src/game/types.js';
import { createGame, lockBothPlayerCommits, resolveNextInQueue, validateCommittedActions, forfeitGame } from '../src/game/gameEngine.js';
import { buildFullEffectDeck, validateDeckSelection } from '../src/game/deckBuilder.js';
import { skipsDraft } from '../src/game/gameModes.js';
import { toViewerState, viewerActionsToServer } from '../src/game/gameView.js';
import type {
  RoomCommitStatus,
  RoomDraftStatus,
  RoomPlayerInfo,
  RoomStatePayload,
  RoomStatus,
} from '../shared/protocol.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 500;

export interface GameRoom {
  code: string;
  /** socket.id per slot; null = empty */
  slots: [string | null, string | null];
  status: RoomStatus;
  gameMode: GameMode;
  createdAt: number;
  /** Submitted effect decks per slot */
  drafts: [EffectType[] | null, EffectType[] | null];
  /** Authoritative match state */
  gameState: GameState | null;
  /** Hidden commits until both players lock */
  pendingCommits: [CommittedAction[] | null, CommittedAction[] | null];
  /** Prevents overlapping resolution runs */
  resolving: boolean;
}

function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    const code = `SHOW-${suffix}`;
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not allocate room code');
}

function bothConnected(room: GameRoom): boolean {
  return room.slots[0] !== null && room.slots[1] !== null;
}

function bothDraftsReady(room: GameRoom): boolean {
  return room.drafts[0] !== null && room.drafts[1] !== null;
}

function slotForSocket(room: GameRoom, socketId: string): 0 | 1 | null {
  if (room.slots[0] === socketId) return 0;
  if (room.slots[1] === socketId) return 1;
  return null;
}

export class GameRoomManager {
  private rooms = new Map<string, GameRoom>();
  /** socket.id → room code */
  private socketRoom = new Map<string, string>();
  /** Players waiting for matchmaking */
  private matchQueue: { socketId: string; gameMode: GameMode }[] = [];

  createRoom(socketId: string, gameMode: GameMode = 'full_deck'): { code: string; slot: 0 | 1 } {
    if (this.socketRoom.has(socketId)) {
      const existingCode = this.socketRoom.get(socketId)!;
      const room = this.rooms.get(existingCode);
      if (room) {
        const slot = room.slots[0] === socketId ? 0 : 1;
        return { code: existingCode, slot };
      }
    }

    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error('Server is full — try again in a moment');
    }

    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room: GameRoom = {
      code,
      slots: [socketId, null],
      status: 'waiting',
      gameMode,
      createdAt: Date.now(),
      drafts: [null, null],
      gameState: null,
      pendingCommits: [null, null],
      resolving: false,
    };
    this.rooms.set(code, room);
    this.socketRoom.set(socketId, code);
    return { code, slot: 0 };
  }

  joinRoom(code: string, socketId: string): { code: string; slot: 0 | 1 } | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    if (room.slots[0] === socketId) return { code, slot: 0 };
    if (room.slots[1] === socketId) return { code, slot: 1 };

    if (room.slots[0] !== null && room.slots[1] !== null) return null;

    const slot: 0 | 1 = room.slots[0] === null ? 0 : 1;
    room.slots[slot] = socketId;
    this.socketRoom.set(socketId, code);

    if (bothConnected(room) && room.status === 'waiting') {
      if (skipsDraft(room.gameMode)) {
        this.startMatch(room);
      } else {
        room.status = 'drafting';
      }
    }

    return { code, slot };
  }

  findMatch(
    socketId: string,
    gameMode: GameMode = 'full_deck',
  ): { matched: true; code: string } | { matched: false } {
    this.removeFromMatchQueue(socketId);

    const existingCode = this.socketRoom.get(socketId);
    if (existingCode) {
      return { matched: true, code: existingCode };
    }

    const waitingIdx = this.matchQueue.findIndex(
      e => e.socketId !== socketId && e.gameMode === gameMode,
    );
    if (waitingIdx >= 0) {
      const [waiting] = this.matchQueue.splice(waitingIdx, 1);
      const code = this.createMatchedRoom(waiting.socketId, socketId, gameMode);
      return { matched: true, code };
    }

    this.matchQueue.push({ socketId, gameMode });
    return { matched: false };
  }

  cancelFindMatch(socketId: string): void {
    this.removeFromMatchQueue(socketId);
  }

  private removeFromMatchQueue(socketId: string): void {
    this.matchQueue = this.matchQueue.filter(e => e.socketId !== socketId);
  }

  private createMatchedRoom(player0: string, player1: string, gameMode: GameMode): string {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error('Server is full — try again in a moment');
    }

    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room: GameRoom = {
      code,
      slots: [player0, player1],
      status: skipsDraft(gameMode) ? 'waiting' : 'drafting',
      gameMode,
      createdAt: Date.now(),
      drafts: [null, null],
      gameState: null,
      pendingCommits: [null, null],
      resolving: false,
    };

    if (skipsDraft(gameMode)) {
      this.startMatch(room);
    }

    this.rooms.set(code, room);
    this.socketRoom.set(player0, code);
    this.socketRoom.set(player1, code);
    return code;
  }

  submitDraft(socketId: string, rawDeck: string[]): string | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return 'You are not in a room';

    const room = this.rooms.get(code);
    if (!room) return 'Room not found';

    if (room.status !== 'drafting' && room.status !== 'draft_ready') {
      return 'Not in draft phase';
    }

    const slot = slotForSocket(room, socketId);
    if (slot === null) return 'Invalid session';

    const deck = rawDeck as EffectType[];
    const err = validateDeckSelection(deck);
    if (err) return err;

    room.drafts[slot] = deck;

    if (bothDraftsReady(room)) {
      this.startMatch(room);
    }

    return null;
  }

  submitCommit(socketId: string, rawActions: CommittedAction[]): string | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return 'You are not in a room';

    const room = this.rooms.get(code);
    if (!room || !room.gameState) return 'Match is not in progress';

    if (room.status !== 'playing') return 'Not in commit phase';
    if (room.gameState.phase !== 'committing') return 'Commit is closed for this round';
    if (room.resolving) return 'Resolution in progress';

    const slot = slotForSocket(room, socketId);
    if (slot === null) return 'Invalid session';
    if (room.pendingCommits[slot] !== null) return 'Zaten kilitledin';

    const actions = viewerActionsToServer(rawActions, slot);
    const actorId = slot === 0 ? 'player' : 'bot';

    const err = validateCommittedActions(room.gameState, actorId, actions);
    if (err) return err;

    room.pendingCommits[slot] = actions;

    if (room.pendingCommits[0] !== null && room.pendingCommits[1] !== null) {
      try {
        room.gameState = lockBothPlayerCommits(
          room.gameState,
          room.pendingCommits[0]!,
          room.pendingCommits[1]!,
        );
        room.pendingCommits = [null, null];
        room.resolving = true;
      } catch (e) {
        room.pendingCommits[slot] = null;
        return e instanceof Error ? e.message : 'Commit failed';
      }
    }

    return null;
  }

  forfeitMatch(socketId: string): string | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return 'You are not in a room';

    const room = this.rooms.get(code);
    if (!room?.gameState) return 'Match is not in progress';
    if (room.gameState.phase === 'finished') return null;

    const slot = slotForSocket(room, socketId);
    if (slot === null) return 'Invalid session';

    const forfeitingActor: 'player' | 'bot' = slot === 0 ? 'player' : 'bot';
    room.gameState = forfeitGame(room.gameState, forfeitingActor);
    room.status = 'finished';
    room.resolving = false;
    room.pendingCommits = [null, null];
    return null;
  }

  advanceResolution(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room?.gameState) return false;

    if (room.gameState.phase !== 'resolving') {
      room.resolving = false;
      if (room.gameState.phase === 'finished') {
        room.status = 'finished';
      }
      return false;
    }

    room.gameState = resolveNextInQueue(room.gameState);

    if (room.gameState.phase !== 'resolving') {
      room.resolving = false;
      if (room.gameState.phase === 'finished') {
        room.status = 'finished';
      }
    }

    return room.gameState.phase === 'resolving';
  }

  private startMatch(room: GameRoom): void {
    if (skipsDraft(room.gameMode)) {
      const deck = buildFullEffectDeck();
      room.gameState = createGame(deck, deck, 'full_deck');
    } else {
      if (!room.drafts[0] || !room.drafts[1]) return;
      room.gameState = createGame(room.drafts[0], room.drafts[1], 'draft');
    }
    room.status = 'playing';
    room.pendingCommits = [null, null];
    room.resolving = false;
  }

  leaveRoom(socketId: string): string | null {
    this.removeFromMatchQueue(socketId);

    const code = this.socketRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    this.socketRoom.delete(socketId);

    if (!room) return null;

    const slot = slotForSocket(room, socketId);
    const wasActiveMatch = room.status === 'playing'
      && room.gameState !== null
      && room.gameState.phase !== 'finished'
      && slot !== null;

    if (slot === 0) {
      room.slots[0] = null;
      room.drafts[0] = null;
      room.pendingCommits[0] = null;
    } else if (slot === 1) {
      room.slots[1] = null;
      room.drafts[1] = null;
      room.pendingCommits[1] = null;
    }

    const anyoneLeft = room.slots[0] !== null || room.slots[1] !== null;
    if (!anyoneLeft) {
      this.rooms.delete(code);
      return null;
    }

    if (wasActiveMatch && slot !== null) {
      const forfeitingActor: 'player' | 'bot' = slot === 0 ? 'player' : 'bot';
      room.gameState = forfeitGame(room.gameState!, forfeitingActor);
      room.status = 'finished';
      room.resolving = false;
      room.pendingCommits = [null, null];
      return code;
    }

    if (!bothConnected(room)) {
      room.status = 'waiting';
      room.drafts = [null, null];
      room.gameState = null;
      room.pendingCommits = [null, null];
      room.resolving = false;
    }

    return code;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  getRoomCodeForSocket(socketId: string): string | undefined {
    return this.socketRoom.get(socketId);
  }

  buildStatePayload(code: string, yourSlot: 0 | 1): RoomStatePayload {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error(`Room ${code} not found`);
    }

    const opponentSlot: 0 | 1 = yourSlot === 0 ? 1 : 0;

    const players: RoomPlayerInfo[] = ([0, 1] as const).map(slot => ({
      slot,
      connected: room.slots[slot] !== null,
    }));

    const youSubmitted = room.drafts[yourSlot] !== null;
    const opponentSubmitted = room.drafts[opponentSlot] !== null;
    const bothReady = bothDraftsReady(room);

    const draft: RoomDraftStatus | null = room.status === 'drafting' || room.status === 'draft_ready'
      ? { youSubmitted, opponentSubmitted, bothReady }
      : null;

    const commit: RoomCommitStatus | null = room.status === 'playing' && room.gameState
      ? (() => {
          const inCommitPhase = room.gameState!.phase === 'committing';
          return {
            youLocked: !inCommitPhase || room.pendingCommits[yourSlot] !== null,
            opponentLocked: !inCommitPhase || room.pendingCommits[opponentSlot] !== null,
          };
        })()
      : null;

    let message: string;
    if (room.status === 'waiting') {
      const modeLabel = room.gameMode === 'full_deck' ? 'Full Deck' : 'Draft Mode';
      message = yourSlot === 0
        ? `Room created (${modeLabel}) — waiting for friend to join`
        : `Connected (${modeLabel}) — waiting for host`;
    } else if (room.status === 'drafting') {
      if (!youSubmitted) {
        message = 'Pick your effect deck and lock in';
      } else if (!opponentSubmitted) {
        message = 'Deck submitted — waiting for opponent…';
      } else {
        message = 'Drafts complete';
      }
    } else if (room.status === 'draft_ready') {
      message = 'Both decks ready — match starting…';
    } else if (room.status === 'playing' && room.gameState) {
      if (room.resolving) {
        message = 'Resolving moves…';
      } else if (room.gameState.phase === 'committing') {
        const c = commit!;
        if (c.youLocked && !c.opponentLocked) {
          message = 'Locked in — waiting for opponent…';
        } else if (!c.youLocked && c.opponentLocked) {
          message = 'Opponent locked in — your turn';
        } else {
          message = `Round ${room.gameState.currentRound} — secretly choose your moves`;
        }
      } else if (room.gameState.phase === 'finished') {
        message = 'Match over';
      } else {
        message = 'Match in progress';
      }
    } else if (room.status === 'finished') {
      message = 'Match over';
    } else {
      message = 'Match in progress';
    }

    return {
      code: room.code,
      yourSlot,
      status: room.status,
      gameMode: room.gameMode,
      players,
      message,
      draft,
      commit,
    };
  }

  buildGamePayload(code: string, yourSlot: 0 | 1) {
    const room = this.rooms.get(code);
    if (!room?.gameState) return null;

    const opponentSlot: 0 | 1 = yourSlot === 0 ? 1 : 0;
    const bothLocked = room.pendingCommits[0] === null
      && room.pendingCommits[1] === null
      && (room.gameState.phase !== 'committing'
        || (room.gameState.roundCommits.player.locked && room.gameState.roundCommits.bot.locked));

    const hideOpponentCommitActions = room.gameState.phase === 'committing' && !bothLocked;

    const inCommitPhase = room.gameState.phase === 'committing';

    return {
      game: toViewerState(room.gameState, yourSlot, hideOpponentCommitActions),
      youLocked: !inCommitPhase || room.pendingCommits[yourSlot] !== null,
      opponentLocked: !inCommitPhase || room.pendingCommits[opponentSlot] !== null,
    };
  }
}
