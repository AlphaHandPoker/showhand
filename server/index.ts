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
  type CreateRoomPayload,
  type FindMatchPayload,
} from '../shared/protocol.js';
import { GameRoomManager } from './gameRoom.js';
import { analyticsRouter } from './analytics/routes.js';
import { initAnalyticsSchema } from './analytics/db.js';
import { fetchMatchmakingEstimate } from './analytics/matchmakingEstimate.js';
import type { GameMode } from '../src/game/types.js';

const PORT = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins }));
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'showhand-server' });
});

app.use('/api', analyticsRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

const rooms = new GameRoomManager();
rooms.setDisconnectForfeitHandler((code) => emitAll(code));
const resolutionLoops = new Set<string>();

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

app.get('/api/matchmaking-estimate', async (req, res) => {
  const mode: GameMode = req.query.mode === 'draft' ? 'draft' : 'full_deck';
  const queueSize = rooms.getMatchQueueSize(mode);
  try {
    const estimate = await fetchMatchmakingEstimate(queueSize, mode);
    res.json(estimate);
  } catch (err) {
    console.error('[matchmaking] estimate failed', err);
    res.json({
      estimatedSeconds: 15,
      maxWaitSeconds: 15,
      queueSize,
      source: 'default',
      sampleSize: 0,
    });
  }
});

async function finishResolution(code: string): Promise<void> {
  if (resolutionLoops.has(code)) return;
  resolutionLoops.add(code);

  try {
    const room = rooms.getRoom(code);
    if (!room?.resolving) return;

    while (rooms.getRoom(code)?.resolving) {
      const stillResolving = rooms.advanceResolution(code);
      if (!stillResolving) break;
    }

    const after = rooms.getRoom(code);
    if (after) {
      after.resolving = false;
    }
    emitAll(code);
  } finally {
    resolutionLoops.delete(code);
  }
}

function emitError(socketId: string, message: string): void {
  io.to(socketId).emit(ServerEvents.ROOM_ERROR, { message } satisfies RoomErrorPayload);
}

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  socket.on(ClientEvents.CREATE_ROOM, (payload?: CreateRoomPayload) => {
    try {
      const mode = payload?.mode === 'draft' ? 'draft' : 'full_deck';
      const { code } = rooms.createRoom(socket.id, mode);
      void socket.join(code);
      emitRoomState(code);
      console.log(`[room] created ${code} host=${socket.id} mode=${mode}`);
    } catch (err) {
      emitError(socket.id, err instanceof Error ? err.message : 'Could not create room');
    }
  });

  socket.on(ClientEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
    const code = normalizeRoomCode(payload.code ?? '');
    if (!code.startsWith('SHOW-') || code.length < 7) {
      emitError(socket.id, 'Invalid room code — example: SHOW-AB12');
      return;
    }

    let result = rooms.joinRoom(code, socket.id, payload.reclaimSlot);
    if (!result && payload.reclaimSlot !== undefined) {
      const room = rooms.getRoom(code);
      const staleId = room?.slots[payload.reclaimSlot];
      if (staleId && staleId !== socket.id && !io.sockets.sockets.has(staleId)) {
        result = rooms.forceReplaceSlot(code, payload.reclaimSlot, socket.id);
      }
    }

    if (!result) {
      emitError(socket.id, 'Room not found or full');
      return;
    }

    void socket.join(code);
    emitAll(code);
    console.log(`[room] joined ${code} guest=${socket.id}${payload.reclaimSlot !== undefined ? ' (rejoin)' : ''}`);
  });

  socket.on(ClientEvents.LEAVE_ROOM, () => {
    const code = rooms.leaveRoom(socket.id, { intentional: true });
    console.log(`[room] left ${code ?? 'none'} socket=${socket.id}`);
    if (code) emitAll(code);
  });

  socket.on(ClientEvents.FIND_MATCH, (payload?: FindMatchPayload) => {
    try {
      const mode = payload?.mode === 'draft' ? 'draft' : 'full_deck';
      const result = rooms.findMatch(socket.id, mode);
      if (result.matched) {
        const room = rooms.getRoom(result.code);
        void socket.join(result.code);
        if (room?.slots[0]) {
          io.sockets.sockets.get(room.slots[0])?.join(result.code);
        }
        if (room?.slots[1]) {
          io.sockets.sockets.get(room.slots[1])?.join(result.code);
        }
        emitAll(result.code);
        console.log(`[match] paired in ${result.code} player=${socket.id}`);
      } else {
        console.log(`[match] queued ${socket.id} mode=${mode}`);
      }
    } catch (err) {
      console.error('[match] find failed', err);
    }
  });

  socket.on(ClientEvents.CANCEL_FIND_MATCH, () => {
    rooms.cancelFindMatch(socket.id);
    console.log(`[match] cancelled ${socket.id}`);
  });

  socket.on(ClientEvents.FORFEIT_MATCH, () => {
    const err = rooms.forfeitMatch(socket.id);
    if (err) {
      emitError(socket.id, err);
      return;
    }
    const code = rooms.getRoomCodeForSocket(socket.id);
    if (code) {
      emitAll(code);
      console.log(`[forfeit] ${socket.id} left ${code}`);
    }
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
      // Give clients time to receive the resolving snapshot before the final state.
      setTimeout(() => {
        void finishResolution(code);
      }, 500);
    }
  });

  socket.on(ClientEvents.REQUEST_SYNC, () => {
    const code = rooms.getRoomCodeForSocket(socket.id);
    if (code) emitAll(code);
  });

  socket.on('disconnect', () => {
    const code = rooms.leaveRoom(socket.id);
    console.log(`[socket] disconnected ${socket.id}${code ? ` left ${code}` : ''}`);
    if (code) emitAll(code);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SHOWHAND server listening on 0.0.0.0:${PORT}`);
  console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
  void initAnalyticsSchema().catch(err => {
    console.error('[analytics] schema init failed', err);
  });
});
