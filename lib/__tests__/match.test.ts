import { describe, it, expect } from 'vitest'
import type { EngineState } from '../game-engine'
import {
  isPlayerEliminated,
  shouldEndTimerRound,
  hasLocalPlayerWonElimination,
  shouldEndEliminationRound,
  buildParticipant,
  getDerivedMatchState,
} from '../game-engine'

const mockState = (phase: EngineState['phase'], custom: Partial<EngineState> = {}): EngineState => ({
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
  ...custom,
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

describe('getDerivedMatchState', () => {
  describe('elimination variant', () => {
    it('solo lobby: round ends when local player is eliminated', () => {
      const statePlaying = mockState('playing')
      const mPlaying = getDerivedMatchState('playing', 'elimination', [], 'local', statePlaying, 'Alice')
      expect(mPlaying.isLocalPlayerEliminated).toBe(false)
      expect(mPlaying.isRoundOver).toBe(false)

      const stateGameOver = mockState('gameover')
      const mOver = getDerivedMatchState('playing', 'elimination', [], 'local', stateGameOver, 'Alice')
      expect(mOver.isLocalPlayerEliminated).toBe(true)
      expect(mOver.isRoundOver).toBe(true)
    })

    it('multiplayer lobby: local player wins when they are the last one standing', () => {
      const opponents = [
        { id: '2', name: 'Bob', score: 10, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
      ]
      const statePlaying = mockState('playing')
      const mState = getDerivedMatchState('playing', 'elimination', opponents, 'local', statePlaying, 'Alice')
      expect(mState.isLocalPlayerEliminated).toBe(false)
      expect(mState.hasLocalPlayerWon).toBe(true)
      expect(mState.isRoundOver).toBe(true)
    })

    it('multiplayer lobby: local player is dead but opponents are still alive (spectating)', () => {
      const opponents = [
        { id: '2', name: 'Bob', score: 10, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
      ]
      const stateGameOver = mockState('gameover')
      const mState = getDerivedMatchState('playing', 'elimination', opponents, 'local', stateGameOver, 'Alice')
      expect(mState.isLocalPlayerEliminated).toBe(true)
      expect(mState.hasLocalPlayerWon).toBe(false)
      expect(mState.isRoundOver).toBe(false) // Wait until Bob is dead
    })

    it('multiplayer lobby: local player is dead and all opponents also die', () => {
      const opponents = [
        { id: '2', name: 'Bob', score: 10, alive: false, ready: true, finished: true, sequence: null, progress: 0 },
      ]
      const stateGameOver = mockState('gameover')
      const mState = getDerivedMatchState('playing', 'elimination', opponents, 'local', stateGameOver, 'Alice')
      expect(mState.isLocalPlayerEliminated).toBe(true)
      expect(mState.hasLocalPlayerWon).toBe(false)
      expect(mState.isRoundOver).toBe(true) // Bob is dead too, round over
    })
  })

  describe('score/reaction variants', () => {
    it('round ends only when all participants are finished', () => {
      const opponents = [
        { id: '2', name: 'Bob', score: 10, alive: true, ready: true, finished: false, sequence: null, progress: 0 },
      ]
      const stateGameOver = mockState('gameover')
      const mStatePending = getDerivedMatchState('playing', 'score', opponents, 'local', stateGameOver, 'Alice')
      expect(mStatePending.isRoundOver).toBe(false) // Bob still playing

      const opponentsFinished = [
        { id: '2', name: 'Bob', score: 10, alive: true, ready: true, finished: true, sequence: null, progress: 0 },
      ]
      const mStateFinished = getDerivedMatchState('playing', 'score', opponentsFinished, 'local', stateGameOver, 'Alice')
      expect(mStateFinished.isRoundOver).toBe(true) // Bob and Alice are finished
    })
  })
})
