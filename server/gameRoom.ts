import type { EffectType } from '../src/game/types.js';
import { validateDeckSelection } from '../src/game/deckBuilder.js';
import type { RoomDraftStatus, RoomPlayerInfo, RoomStatePayload, RoomStatus } from '../shared/protocol.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 500;

export interface GameRoom {
  code: string;
  /** socket.id per slot; null = empty */
  slots: [string | null, string | null];
  status: RoomStatus;
  createdAt: number;
  /** Submitted effect decks per slot */
  drafts: [EffectType[] | null, EffectType[] | null];
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

export class GameRoomManager {
  private rooms = new Map<string, GameRoom>();
  /** socket.id → room code */
  private socketRoom = new Map<string, string>();

  createRoom(socketId: string): { code: string; slot: 0 | 1 } {
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
      createdAt: Date.now(),
      drafts: [null, null],
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
      room.status = 'drafting';
    }

    return { code, slot };
  }

  submitDraft(socketId: string, rawDeck: string[]): string | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return 'Odaya bağlı değilsin';

    const room = this.rooms.get(code);
    if (!room) return 'Oda bulunamadı';

    if (room.status !== 'drafting' && room.status !== 'draft_ready') {
      return 'Draft aşamasında değilsin';
    }

    const slot: 0 | 1 = room.slots[0] === socketId ? 0 : 1;
    if (room.slots[slot] !== socketId) return 'Geçersiz oturum';

    const deck = rawDeck as EffectType[];
    const err = validateDeckSelection(deck);
    if (err) return err;

    room.drafts[slot] = deck;

    if (bothDraftsReady(room)) {
      room.status = 'draft_ready';
    }

    return null;
  }

  leaveRoom(socketId: string): string | null {
    const code = this.socketRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    this.socketRoom.delete(socketId);

    if (!room) return null;

    const slot = room.slots[0] === socketId ? 0 : room.slots[1] === socketId ? 1 : null;
    if (slot === 0) {
      room.slots[0] = null;
      room.drafts[0] = null;
    } else if (slot === 1) {
      room.slots[1] = null;
      room.drafts[1] = null;
    }

    const anyoneLeft = room.slots[0] !== null || room.slots[1] !== null;
    if (!anyoneLeft) {
      this.rooms.delete(code);
      return null;
    }

    if (!bothConnected(room)) {
      room.status = 'waiting';
      room.drafts = [null, null];
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

    let message: string;
    if (room.status === 'waiting') {
      message = yourSlot === 0
        ? 'Oda oluşturuldu — arkadaşının katılmasını bekliyorsun'
        : 'Bağlandın — oda sahibi bekleniyor';
    } else if (room.status === 'drafting') {
      if (!youSubmitted) {
        message = 'Efekt desteni seç ve kilitle';
      } else if (!opponentSubmitted) {
        message = 'Taslağın gönderildi — rakip bekleniyor…';
      } else {
        message = 'Taslaklar tamam';
      }
    } else if (room.status === 'draft_ready') {
      message = 'Her iki deste hazır — maç bir sonraki aşamada başlayacak';
    } else {
      message = 'Oyun devam ediyor';
    }

    return {
      code: room.code,
      yourSlot,
      status: room.status,
      players,
      message,
      draft,
    };
  }
}
