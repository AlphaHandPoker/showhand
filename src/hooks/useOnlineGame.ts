import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '../config/server';
import {
  ClientEvents,
  ServerEvents,
  type GameStatePayload,
  type RoomErrorPayload,
  type RoomStatePayload,
} from '../../shared/protocol';
import type { CommittedAction, GameMode } from '../game/types';
import type { CreateRoomPayload } from '../../shared/protocol';
import { DEFAULT_GAME_MODE } from '../game/gameModes';

function gameSyncSig(payload: GameStatePayload): string {
  const g = payload.game;
  return `${g.phase}-${g.currentRound}-${g.resolutionIndex}-${g.log.length}-${g.winner ?? ''}-${payload.youLocked}-${payload.opponentLocked}`;
}

export interface UseOnlineGame {
  socketConnected: boolean;
  roomState: RoomStatePayload | null;
  gamePayload: GameStatePayload | null;
  error: string | null;
  forfeitMatch: () => void;
  findMatch: (mode?: GameMode) => void;
  cancelFindMatch: () => void;
  createRoom: (mode: GameMode) => void;
  joinRoom: (code: string) => void;
  submitDraft: (deck: string[]) => void;
  lockCommit: (actions: CommittedAction[]) => void;
  requestSync: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  /** Call after GameBoard finishes animating the current synced snapshot. */
  ackGameSync: () => void;
}

export function useOnlineGame(): UseOnlineGame {
  const socketRef = useRef<Socket | null>(null);
  const activeRoomCodeRef = useRef<string | null>(null);
  const activeYourSlotRef = useRef<0 | 1 | null>(null);
  const payloadQueueRef = useRef<GameStatePayload[]>([]);
  const syncingRef = useRef(false);
  const displayedSigRef = useRef<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [gamePayload, setGamePayload] = useState<GameStatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearPayloadQueue = useCallback(() => {
    payloadQueueRef.current = [];
    syncingRef.current = false;
    displayedSigRef.current = null;
  }, []);

  const pumpPayloadQueue = useCallback(() => {
    if (syncingRef.current) return;

    while (payloadQueueRef.current.length > 0) {
      const next = payloadQueueRef.current[0]!;
      const sig = gameSyncSig(next);
      if (sig === displayedSigRef.current) {
        payloadQueueRef.current.shift();
        continue;
      }
      payloadQueueRef.current.shift();
      syncingRef.current = true;
      displayedSigRef.current = sig;
      setGamePayload(next);
      return;
    }
  }, []);

  const ackGameSync = useCallback(() => {
    syncingRef.current = false;
    pumpPayloadQueue();
  }, [pumpPayloadQueue]);

  const enqueueGamePayload = useCallback((payload: GameStatePayload) => {
    const sig = gameSyncSig(payload);
    const tail = payloadQueueRef.current[payloadQueueRef.current.length - 1];
    if (tail && gameSyncSig(tail) === sig) return;
    if (!tail && displayedSigRef.current === sig && syncingRef.current) return;
    payloadQueueRef.current.push(payload);
    pumpPayloadQueue();
  }, [pumpPayloadQueue]);

  const rejoinActiveRoom = useCallback((socket: Socket) => {
    const code = activeRoomCodeRef.current;
    if (!code) return;
    socket.emit(ClientEvents.JOIN_ROOM, {
      code,
      reclaimSlot: activeYourSlotRef.current ?? undefined,
    });
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      rejoinActiveRoom(socket);
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on(ServerEvents.ROOM_STATE, (payload: RoomStatePayload) => {
      setRoomState(payload);
      setError(null);
      activeRoomCodeRef.current = payload.code;
      activeYourSlotRef.current = payload.yourSlot;
    });
    socket.on(ServerEvents.GAME_STATE, (payload: GameStatePayload) => {
      enqueueGamePayload(payload);
      setError(null);
    });
    socket.on(ServerEvents.ROOM_ERROR, (payload: RoomErrorPayload) => {
      setError(payload.message);
      setGamePayload(prev => (prev ? { ...prev, youLocked: false } : prev));
      socketRef.current?.emit(ClientEvents.REQUEST_SYNC);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [rejoinActiveRoom, enqueueGamePayload]);

  useEffect(() => {
    const rs = roomState;
    if (!rs || rs.status !== 'playing') return;
    if (gamePayload) return;
    const t = window.setTimeout(() => {
      socketRef.current?.emit(ClientEvents.REQUEST_SYNC);
    }, 400);
    return () => window.clearTimeout(t);
  }, [roomState, gamePayload]);

  const createRoom = useCallback((mode: GameMode = DEFAULT_GAME_MODE) => {
    setError(null);
    const payload: CreateRoomPayload = { mode };
    socketRef.current?.emit(ClientEvents.CREATE_ROOM, payload);
  }, []);

  const findMatch = useCallback((mode: GameMode = DEFAULT_GAME_MODE) => {
    setError(null);
    clearPayloadQueue();
    activeRoomCodeRef.current = null;
    activeYourSlotRef.current = null;
    socketRef.current?.emit(ClientEvents.LEAVE_ROOM);
    setRoomState(null);
    setGamePayload(null);
    socketRef.current?.emit(ClientEvents.FIND_MATCH, { mode });
  }, [clearPayloadQueue]);

  const cancelFindMatch = useCallback(() => {
    socketRef.current?.emit(ClientEvents.CANCEL_FIND_MATCH);
  }, []);

  const forfeitMatch = useCallback(() => {
    setError(null);
    socketRef.current?.emit(ClientEvents.FORFEIT_MATCH);
  }, []);

  const joinRoom = useCallback((code: string) => {
    setError(null);
    socketRef.current?.emit(ClientEvents.JOIN_ROOM, { code });
  }, []);

  const submitDraft = useCallback((deck: string[]) => {
    setError(null);
    socketRef.current?.emit(ClientEvents.SUBMIT_DRAFT, { deck });
  }, []);

  const lockCommit = useCallback((actions: CommittedAction[]) => {
    setError(null);
    setGamePayload(prev => (prev ? { ...prev, youLocked: true } : prev));
    socketRef.current?.emit(ClientEvents.LOCK_COMMIT, { actions });
  }, []);

  const requestSync = useCallback(() => {
    socketRef.current?.emit(ClientEvents.REQUEST_SYNC);
  }, []);

  const leaveRoom = useCallback(() => {
    activeRoomCodeRef.current = null;
    activeYourSlotRef.current = null;
    clearPayloadQueue();
    socketRef.current?.emit(ClientEvents.LEAVE_ROOM);
    setRoomState(null);
    setGamePayload(null);
    setError(null);
  }, [clearPayloadQueue]);

  const clearError = useCallback(() => setError(null), []);

  return {
    socketConnected,
    roomState,
    gamePayload,
    error,
    findMatch,
    cancelFindMatch,
    forfeitMatch,
    createRoom,
    joinRoom,
    submitDraft,
    lockCommit,
    requestSync,
    leaveRoom,
    clearError,
    ackGameSync,
  };
}
