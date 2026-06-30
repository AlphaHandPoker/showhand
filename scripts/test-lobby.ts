/**
 * Stage 1–2 smoke test: lobby join + independent draft submissions.
 */
import { io } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  type RoomStatePayload,
  type RoomStatus,
} from '../shared/protocol.js';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';
const DISCONNECT_FORFEIT_MS = Number(process.env.DISCONNECT_FORFEIT_MS ?? 5000);

const SAMPLE_DECK_A = ['steal_card', 'send_back', 'protect', 'transform', 'freeze'];
const SAMPLE_DECK_B = ['shift_chance', 'spy', 'force_delete', 'cleanse', 'last_draw'];

function waitFor<T>(socket: ReturnType<typeof io>, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForRoomStatus(
  socket: ReturnType<typeof io>,
  status: RoomStatus,
  timeoutMs = 5000,
): Promise<RoomStatePayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for status ${status}`)),
      timeoutMs,
    );
    const handler = (payload: RoomStatePayload) => {
      if (payload.status === status) {
        clearTimeout(timer);
        socket.off(ServerEvents.ROOM_STATE, handler);
        resolve(payload);
      }
    };
    socket.on(ServerEvents.ROOM_STATE, handler);
  });
}

async function main() {
  const host = io(SERVER, { transports: ['websocket'] });
  await waitFor<void>(host, 'connect');
  host.emit(ClientEvents.CREATE_ROOM, { mode: 'draft' });
  const hostState = await waitFor<RoomStatePayload>(host, ServerEvents.ROOM_STATE);

  const guest = io(SERVER, { transports: ['websocket'] });
  await waitFor<void>(guest, 'connect');

  const hostDraftPromise = waitForRoomStatus(host, 'drafting');
  guest.emit(ClientEvents.JOIN_ROOM, { code: hostState.code });
  await waitForRoomStatus(guest, 'drafting');
  await hostDraftPromise;

  host.emit(ClientEvents.SUBMIT_DRAFT, { deck: SAMPLE_DECK_A });
  const hostWaiting = await waitFor<RoomStatePayload>(host, ServerEvents.ROOM_STATE);
  if (!hostWaiting.draft?.youSubmitted) {
    throw new Error('Host draft not marked submitted');
  }

  const hostPlayingPromise = waitForRoomStatus(host, 'playing');
  const guestPlayingPromise = waitForRoomStatus(guest, 'playing');
  guest.emit(ClientEvents.SUBMIT_DRAFT, { deck: SAMPLE_DECK_B });
  await guestPlayingPromise;
  await hostPlayingPromise;

  console.log('PASS: lobby + drafts → match started in room', hostState.code);
  host.disconnect();
  guest.disconnect();

  // Matchmaking queue (Find Player flow — Full Deck default)
  const seekerA = io(SERVER, { transports: ['websocket'] });
  await waitFor<void>(seekerA, 'connect');
  seekerA.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await new Promise(r => setTimeout(r, 300));

  const seekerB = io(SERVER, { transports: ['websocket'] });
  await waitFor<void>(seekerB, 'connect');
  const matchPromiseA = waitForRoomStatus(seekerA, 'playing');
  const matchPromiseB = waitForRoomStatus(seekerB, 'playing');
  seekerB.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB]);
  if (matchA.code !== matchB.code) {
    throw new Error(`Matchmaking paired different rooms: ${matchA.code} vs ${matchB.code}`);
  }
  console.log('PASS: FIND_MATCH → match started in room', matchA.code);
  seekerA.disconnect();
  seekerB.disconnect();

  // Disconnect during match → remaining player wins
  const p1 = io(SERVER, { transports: ['websocket'] });
  const p2 = io(SERVER, { transports: ['websocket'] });
  await waitFor<void>(p1, 'connect');
  await waitFor<void>(p2, 'connect');
  p1.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await new Promise(r => setTimeout(r, 300));
  const playingPromise1 = waitForRoomStatus(p1, 'playing');
  const playingPromise2 = waitForRoomStatus(p2, 'playing');
  p2.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await Promise.all([playingPromise1, playingPromise2]);

  const winPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for forfeit win')),
      DISCONNECT_FORFEIT_MS + 3000,
    );
    p1.on(ServerEvents.GAME_STATE, payload => {
      if (payload.game.phase === 'finished' && payload.game.winner === 'player') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  p2.disconnect();
  await winPromise;
  console.log('PASS: opponent disconnect → remaining player wins after grace');
  p1.disconnect();

  await new Promise(r => setTimeout(r, 500));

  // Reconnect mid-match → reclaim slot and lock in round 2
  const r1 = io(SERVER, { transports: ['websocket'], forceNew: true });
  const r2 = io(SERVER, { transports: ['websocket'], forceNew: true });
  await waitFor<void>(r1, 'connect');
  await waitFor<void>(r2, 'connect');
  r1.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await new Promise(r => setTimeout(r, 400));
  const r1Playing = waitForRoomStatus(r1, 'playing');
  const r2Playing = waitForRoomStatus(r2, 'playing');
  r2.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  const [room1, room2] = await Promise.all([r1Playing, r2Playing]);
  if (room1.code !== room2.code) throw new Error('Rejoin test: room mismatch');

  r1.emit(ClientEvents.LOCK_COMMIT, { actions: [] });
  await waitFor<{ youLocked: boolean }>(r1, ServerEvents.GAME_STATE);
  const round2Ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for round 2')), 10000);
    r1.on(ServerEvents.GAME_STATE, payload => {
      if (payload.game.phase === 'committing' && payload.game.currentRound >= 2) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  r2.emit(ClientEvents.LOCK_COMMIT, { actions: [] });
  await round2Ready;

  r2.disconnect();
  await new Promise(r => setTimeout(r, 300));

  const r2b = io(SERVER, { transports: ['websocket'], forceNew: true });
  await waitFor<void>(r2b, 'connect');
  r2b.emit(ClientEvents.JOIN_ROOM, { code: room2.code, reclaimSlot: room2.yourSlot });
  await waitForRoomStatus(r2b, 'playing');

  const round2Promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for round 2 lock after rejoin')), 8000);
    const onError = (err: { message: string }) => {
      clearTimeout(timer);
      reject(new Error(`Rejoin lock failed: ${err.message}`));
    };
    const onGame = (payload: { youLocked: boolean }) => {
      if (payload.youLocked) {
        clearTimeout(timer);
        r2b.off(ServerEvents.ROOM_ERROR, onError);
        resolve();
      }
    };
    r2b.on(ServerEvents.ROOM_ERROR, onError);
    r2b.on(ServerEvents.GAME_STATE, onGame);
    r2b.emit(ClientEvents.LOCK_COMMIT, { actions: [] });
  });
  await round2Promise;
  console.log('PASS: reconnect mid-match → reclaim slot and lock in');
  r1.disconnect();
  r2b.disconnect();

  await new Promise(r => setTimeout(r, 500));

  // Both players lock in round 1 → resolution completes
  const a = io(SERVER, { transports: ['websocket'], forceNew: true });
  const b = io(SERVER, { transports: ['websocket'], forceNew: true });
  await waitFor<void>(a, 'connect');
  await waitFor<void>(b, 'connect');
  a.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await new Promise(r => setTimeout(r, 400));
  const aPlaying = waitForRoomStatus(a, 'playing');
  const bPlaying = waitForRoomStatus(b, 'playing');
  b.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await Promise.all([aPlaying, bPlaying]);

  const aWaiting = await new Promise<{ youLocked: boolean; opponentLocked: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for player A lock')), 8000);
    const handler = (payload: { youLocked: boolean; opponentLocked: boolean }) => {
      if (payload.youLocked && !payload.opponentLocked) {
        clearTimeout(timer);
        a.off(ServerEvents.GAME_STATE, handler);
        resolve(payload);
      }
    };
    a.on(ServerEvents.GAME_STATE, handler);
    a.emit(ClientEvents.LOCK_COMMIT, { actions: [] });
  });
  if (!aWaiting.youLocked || aWaiting.opponentLocked) {
    throw new Error('Player A should be locked waiting for opponent');
  }

  const roundAdvanced = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for round 2 after both lock')), 8000);
    a.on(ServerEvents.GAME_STATE, payload => {
      if (payload.game.phase === 'committing' && payload.game.currentRound >= 2) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  b.emit(ClientEvents.LOCK_COMMIT, { actions: [] });
  await roundAdvanced;
  console.log('PASS: both players lock → round advances');
  a.disconnect();
  b.disconnect();

  await new Promise(r => setTimeout(r, 500));

  // Second search after match — stale finished room must not block queue
  const x = io(SERVER, { transports: ['websocket'], forceNew: true });
  const y = io(SERVER, { transports: ['websocket'], forceNew: true });
  await waitFor<void>(x, 'connect');
  await waitFor<void>(y, 'connect');
  x.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  await new Promise(r => setTimeout(r, 400));
  const xPlaying = waitForRoomStatus(x, 'playing');
  const yPlaying = waitForRoomStatus(y, 'playing');
  y.emit(ClientEvents.FIND_MATCH, { mode: 'full_deck' });
  const [xRoom, yRoom] = await Promise.all([xPlaying, yPlaying]);
  if (xRoom.code !== yRoom.code) {
    throw new Error(`Second search failed to pair: ${xRoom.code} vs ${yRoom.code}`);
  }
  console.log('PASS: second FIND_MATCH pairs after previous match');
  x.disconnect();
  y.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
