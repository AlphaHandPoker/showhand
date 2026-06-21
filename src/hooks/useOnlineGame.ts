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
import type { CommittedAction } from '../game/types';

export interface UseOnlineGame {
  socketConnected: boolean;
  roomState: RoomStatePayload | null;
  gamePayload: GameStatePayload | null;
  error: string | null;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  submitDraft: (deck: string[]) => void;
  lockCommit: (actions: CommittedAction[]) => void;
  leaveRoom: () => void;
  clearError: () => void;
}

export function useOnlineGame(): UseOnlineGame {
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [gamePayload, setGamePayload] = useState<GameStatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on(ServerEvents.ROOM_STATE, (payload: RoomStatePayload) => {
      setRoomState(payload);
      setError(null);
    });
    socket.on(ServerEvents.GAME_STATE, (payload: GameStatePayload) => {
      setGamePayload(payload);
      setError(null);
    });
    socket.on(ServerEvents.ROOM_ERROR, (payload: RoomErrorPayload) => {
      setError(payload.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const createRoom = useCallback(() => {
    setError(null);
    socketRef.current?.emit(ClientEvents.CREATE_ROOM);
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
    socketRef.current?.emit(ClientEvents.LOCK_COMMIT, { actions });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current?.connect();
    setRoomState(null);
    setGamePayload(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    socketConnected,
    roomState,
    gamePayload,
    error,
    createRoom,
    joinRoom,
    submitDraft,
    lockCommit,
    leaveRoom,
    clearError,
  };
}
