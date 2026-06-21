import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  normalizeRoomCode,
  type JoinRoomPayload,
  type LockCommitPayload,
  type RoomErrorPayload,
  type SubmitDraftPayload,
} from '../shared/protocol.js';
import { GameRoomManager } from './gameRoom.js';

const PORT = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins }));
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'showhand-server' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const rooms = new GameRoomManager();

function emitRoomState(code: string): void {
  const room = rooms.getRoom(code);
  if (!room) return;

  for (const slot of [0, 1] as const) {
    const socketId = room.slots[slot];
    if (!socketId) continue;
    io.to(socketId).emit(
      ServerEvents.ROOM_STATE,
      rooms.buildStatePayload(code, slot),
    );
  }
}

function emitGameState(code: string): void {
  const room = rooms.getRoom(code);
  if (!room?.gameState) return;

  for (const slot of [0, 1] as const) {
    const socketId = room.slots[slot];
    if (!socketId) continue;
    const payload = rooms.buildGamePayload(code, slot);
    if (payload) {
      io.to(socketId).emit(ServerEvents.GAME_STATE, payload);
    }
  }
}

function emitAll(code: string): void {
  emitRoomState(code);
  emitGameState(code);
}

async function runResolutionLoop(code: string): Promise<void> {
  const room = rooms.getRoom(code);
  if (!room?.resolving) return;

  emitAll(code);

  while (rooms.getRoom(code)?.resolving) {
    const stillResolving = rooms.advanceResolution(code);
    emitAll(code);
    if (!stillResolving) break;
    await new Promise(r => setTimeout(r, 80));
  }
}

function emitError(socketId: string, message: string): void {
  io.to(socketId).emit(ServerEvents.ROOM_ERROR, { message } satisfies RoomErrorPayload);
}

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on(ClientEvents.CREATE_ROOM, () => {
    try {
      const { code } = rooms.createRoom(socket.id);
      void socket.join(code);
      emitRoomState(code);
      console.log(`[room] created ${code} host=${socket.id}`);
    } catch (err) {
      emitError(socket.id, err instanceof Error ? err.message : 'Could not create room');
    }
  });

  socket.on(ClientEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
    const code = normalizeRoomCode(payload.code ?? '');
    if (!code.startsWith('SHOW-') || code.length < 7) {
      emitError(socket.id, 'Geçersiz oda kodu — örnek: SHOW-AB12');
      return;
    }

    const result = rooms.joinRoom(code, socket.id);
    if (!result) {
      emitError(socket.id, 'Oda bulunamadı veya dolu');
      return;
    }

    void socket.join(code);
    emitRoomState(code);
    console.log(`[room] joined ${code} guest=${socket.id}`);
  });

  socket.on(ClientEvents.SUBMIT_DRAFT, (payload: SubmitDraftPayload) => {
    const err = rooms.submitDraft(socket.id, payload.deck ?? []);
    if (err) {
      emitError(socket.id, err);
      return;
    }
    const code = rooms.getRoomCodeForSocket(socket.id);
    if (code) {
      emitAll(code);
      console.log(`[draft] submitted in ${code} by ${socket.id}`);
    }
  });

  socket.on(ClientEvents.LOCK_COMMIT, (payload: LockCommitPayload) => {
    const err = rooms.submitCommit(socket.id, payload.actions ?? []);
    if (err) {
      emitError(socket.id, err);
      return;
    }
    const code = rooms.getRoomCodeForSocket(socket.id);
    if (!code) return;

    const room = rooms.getRoom(code);
    emitAll(code);
    console.log(`[commit] locked in ${code} by ${socket.id}`);

    if (room?.resolving) {
      void runResolutionLoop(code);
    }
  });

  socket.on('disconnect', () => {
    const code = rooms.leaveRoom(socket.id);
    console.log(`[socket] disconnected ${socket.id}${code ? ` left ${code}` : ''}`);
    if (code) emitRoomState(code);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SHOWHAND server listening on 0.0.0.0:${PORT}`);
  console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
});
