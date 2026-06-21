import type { GameState, PlayerId } from './types';

function swapPlayerId(id: PlayerId): PlayerId {
  return id === 'player' ? 'bot' : 'player';
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck],
    players: {
      player: {
        ...state.players.player,
        pokerHand: state.players.player.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.player.effectHand],
      },
      bot: {
        ...state.players.bot,
        pokerHand: state.players.bot.pokerHand.map(c => ({ ...c })),
        effectHand: [...state.players.bot.effectHand],
      },
    },
    roundCommits: {
      player: { ...state.roundCommits.player, actions: [...state.roundCommits.player.actions] },
      bot: { ...state.roundCommits.bot, actions: [...state.roundCommits.bot.actions] },
    },
    resolutionQueue: state.resolutionQueue.map(item => ({ ...item, action: { ...item.action } })),
    log: [...state.log],
    spyRevealedEffectIds: [...state.spyRevealedEffectIds],
  };
}

/** Slot 1 (guest) sees themselves as `player` in the UI. */
export function swapPerspective(state: GameState): GameState {
  const s = cloneGameState(state);
  const playerCopy = s.players.player;
  s.players.player = { ...s.players.bot, id: 'player' };
  s.players.bot = { ...playerCopy, id: 'bot' };

  s.roundCommits = {
    player: { ...state.roundCommits.bot, actions: [...state.roundCommits.bot.actions] },
    bot: { ...state.roundCommits.player, actions: [...state.roundCommits.player.actions] },
  };

  s.startingPlayer = swapPlayerId(state.startingPlayer);
  s.resolvingPlayer = state.resolvingPlayer ? swapPlayerId(state.resolvingPlayer) : null;
  s.winner = state.winner
    ? state.winner === 'tie'
      ? 'tie'
      : swapPlayerId(state.winner)
    : null;

  s.resolutionQueue = state.resolutionQueue.map(item => ({
    playerId: swapPlayerId(item.playerId),
    action: { ...item.action },
  }));

  s.log = state.log.map(entry => ({
    ...entry,
    playerId: entry.playerId ? swapPlayerId(entry.playerId) : undefined,
  }));

  s.spyReveal = state.spyReveal
    ? { type: state.spyReveal.type, playerId: swapPlayerId(state.spyReveal.playerId) }
    : null;

  return s;
}

export function toViewerState(
  state: GameState,
  viewerSlot: 0 | 1,
  hideOpponentCommitActions: boolean,
): GameState {
  let s = viewerSlot === 1 ? swapPerspective(state) : cloneGameState(state);

  if (hideOpponentCommitActions && s.phase === 'committing') {
    s.roundCommits = {
      player: s.roundCommits.player,
      bot: { actions: [], locked: s.roundCommits.bot.locked },
    };
  }

  return s;
}

/** Map viewer-local `player` actions back to server slot ids. */
export function viewerActionsToServer(
  actions: import('./types').CommittedAction[],
  viewerSlot: 0 | 1,
): import('./types').CommittedAction[] {
  if (viewerSlot === 0) return actions;
  return actions.map(action => {
    const mapped = { ...action };
    if (mapped.cleanseOwnerId) {
      mapped.cleanseOwnerId = swapPlayerId(mapped.cleanseOwnerId);
    }
    return mapped;
  });
}
