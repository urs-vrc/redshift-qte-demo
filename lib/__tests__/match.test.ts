import { describe, it, expect } from 'vitest'
import type { EngineState } from '../game-engine'
import {
  isPlayerEliminated,
  shouldEndTimerRound,
  hasLocalPlayerWonElimination,
  shouldEndEliminationRound,
  buildParticipant,
} from '../game-engine'

const mockState = (phase: EngineState['phase']): EngineState => ({
  phase,
  mode: 'timer',
  score: 42,
  sequence: { id: 'seq_1', steps: ['up', 'down'] },
  progress: 1,
  timeLeftMs: 2500,
  limitSeconds: 5,
  prestartTimeLeftMs: 0,
  elapsedMs: 1500,
  failed: false,
})

describe('isPlayerEliminated', () => {
  it('identifies as eliminated only when in elimination mode and phase is gameover', () => {
    const idleState = mockState('idle')
    const playingState = mockState('playing')
    const overState = mockState('gameover')

    expect(isPlayerEliminated(idleState, 'elimination')).toBe(false)
    expect(isPlayerEliminated(playingState, 'elimination')).toBe(false)
    expect(isPlayerEliminated(overState, 'elimination')).toBe(true)

    // In score or reaction mode, they are never considered "eliminated"
    expect(isPlayerEliminated(overState, 'score')).toBe(false)
    expect(isPlayerEliminated(overState, 'reaction')).toBe(false)
  })
})

describe('shouldEndTimerRound', () => {
  it('returns true when all participants are finished and participants list is not empty', () => {
    const participants = [
      { id: '1', name: 'Alice', score: 1, alive: true, ready: true, finished: true, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: true, ready: true, finished: true, sequence: null, progress: 0 },
    ]
    expect(shouldEndTimerRound(participants)).toBe(true)
  })

  it('returns false when at least one participant is not finished', () => {
    const participants = [
      { id: '1', name: 'Alice', score: 1, alive: true, ready: true, finished: true, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
    ]
    expect(shouldEndTimerRound(participants)).toBe(false)
  })

  it('returns false when the participants list is empty', () => {
    expect(shouldEndTimerRound([])).toBe(false)
  })
})

describe('hasLocalPlayerWonElimination', () => {
  it('returns false if the local player is dead/not alive', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
    ]
    expect(hasLocalPlayerWonElimination(participants, 'local')).toBe(false)
  })

  it('returns true if the local player is alive and there are no other alive participants', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
    ]
    expect(hasLocalPlayerWonElimination(participants, 'local')).toBe(true)
  })

  it('returns false if the local player is alive but there is another alive participant', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
    ]
    expect(hasLocalPlayerWonElimination(participants, 'local')).toBe(false)
  })

  it('works with default local ID fallback when localParticipantId is null', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
    ]
    expect(hasLocalPlayerWonElimination(participants, null)).toBe(true)
  })

  it('returns false if the local player is alive but there are no other participants (solo lobby)', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: true, ready: true, finished: false, sequence: null, progress: 0 }
    ]
    expect(hasLocalPlayerWonElimination(participants, 'local')).toBe(false)
  })
})

describe('shouldEndEliminationRound', () => {
  it('returns true if the local player is dead/eliminated in a solo lobby (no opponents)', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: false, ready: true, finished: true, sequence: null, progress: 0 }
    ]
    expect(shouldEndEliminationRound(participants, 'local')).toBe(true)
  })

  it('returns false if the local player is dead/eliminated but there is another alive participant', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: true, ready: true, finished: false, sequence: null, progress: 0 }
    ]
    expect(shouldEndEliminationRound(participants, 'local')).toBe(false)
  })

  it('returns true if the local player is dead/eliminated and all other participants are also dead', () => {
    const participants = [
      { id: 'local', name: 'Alice', score: 1, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
      { id: '2', name: 'Bob', score: 2, alive: false, ready: true, finished: true, sequence: null, progress: 0 }
    ]
    expect(shouldEndEliminationRound(participants, 'local')).toBe(true)
  })
})

describe('buildParticipant', () => {
  it('builds a MultiplayerParticipant correctly during playing phase', () => {
    const state = mockState('playing')
    const participant = buildParticipant(state, 'player_1', 'Alice', 'elimination')

    expect(participant).toEqual({
      id: 'player_1',
      name: 'Alice',
      score: 42,
      alive: true,
      ready: true,
      finished: false,
      sequence: state.sequence,
      progress: 1,
    })
  })

  it('builds a MultiplayerParticipant correctly during gameover in elimination mode', () => {
    const state = mockState('gameover')
    const participant = buildParticipant(state, 'player_1', 'Alice', 'elimination')

    expect(participant).toEqual({
      id: 'player_1',
      name: 'Alice',
      score: 42,
      alive: false,
      ready: true,
      finished: true,
      sequence: state.sequence,
      progress: 1,
    })
  })

  it('builds a MultiplayerParticipant correctly during gameover in score mode', () => {
    const state = mockState('gameover')
    const participant = buildParticipant(state, 'player_1', 'Alice', 'score')

    expect(participant).toEqual({
      id: 'player_1',
      name: 'Alice',
      score: 42,
      alive: true,
      ready: true,
      finished: true,
      sequence: state.sequence,
      progress: 1,
    })
  })
})
