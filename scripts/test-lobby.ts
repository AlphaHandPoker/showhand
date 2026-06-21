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
  host.emit(ClientEvents.CREATE_ROOM);
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
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
