import type { EngineState } from './types'
import type { MultiplayerParticipant, MultiplayerVariant } from './multiplayer'

/**
 * Decides whether the player is eliminated given engine state and game variant.
 * In elimination mode, a player is eliminated once their engine phase becomes gameover.
 */
export function isPlayerEliminated(state: EngineState, variant: MultiplayerVariant): boolean {
  return variant === 'elimination' && state.phase === 'gameover'
}

/**
 * Computes whether the round should end for timer-like variants.
 * All participants must be finished and there must be at least one participant.
 */
export function shouldEndTimerRound(participants: MultiplayerParticipant[]): boolean {
  return participants.length > 0 && participants.every((p) => p.finished)
}

/**
 * Computes whether the local player has won an elimination match.
 * The match is won if the local player is still alive, and there is
 * at least one opponent in the lobby, and all opponents are dead.
 */
export function hasLocalPlayerWonElimination(
  participants: MultiplayerParticipant[],
  localParticipantId: string | null
): boolean {
  const localId = localParticipantId ?? 'local'
  const local = participants.find((p) => p.id === localId)
  if (!local || !local.alive) {
    return false
  }
  const opponents = participants.filter((p) => p.id !== localId)
  if (opponents.length === 0) {
    return false
  }
  return opponents.every((p) => !p.alive)
}

/**
 * Checks whether the elimination round should now end after the local player is eliminated.
 * Returns true if no other participant is still alive (excluding localParticipantId).
 */
export function shouldEndEliminationRound(
  participants: MultiplayerParticipant[],
  localParticipantId: string | null
): boolean {
  const localId = localParticipantId ?? 'local'
  const opponents = participants.filter((p) => p.id !== localId)
  return opponents.every((p) => !p.alive)
}

/**
 * Builds the MultiplayerParticipant display/broadcast object from EngineState.
 */
export function buildParticipant(
  state: EngineState,
  participantId: string | null,
  name: string,
  variant: MultiplayerVariant
): MultiplayerParticipant {
  const eliminated = isPlayerEliminated(state, variant)
  return {
    id: participantId ?? 'local',
    name,
    score: state.score,
    alive: !eliminated,
    ready: true,
    finished: eliminated || state.phase === 'gameover',
    sequence: state.sequence,
    progress: state.progress,
  }
}
