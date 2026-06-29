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
    const timer = setTimeout(() => reject(new Error('Timeout waiting for forfeit win')), 5000);
    p1.on(ServerEvents.GAME_STATE, payload => {
      if (payload.game.phase === 'finished' && payload.game.winner === 'player') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  p2.disconnect();
  await winPromise;
  console.log('PASS: opponent disconnect → remaining player wins');
  p1.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
