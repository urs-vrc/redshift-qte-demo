// Import Engine directly instead of React hook to avoid dependency issues
import { GameEngine } from './GameEngine'
import { describe, it, expect } from 'vitest'

describe('GameEngine Sequence Sync', () => {
  it('should update sequence ID when a sequence is completed', () => {
    const engine = new GameEngine({
      mode: 'timer',
      windowSeconds: 5,
      baseLength: 1, // 1-length sequence
    })

    engine.startImmediate()
    const initialSeqId = engine.state.sequence?.id
    expect(initialSeqId).toBeDefined()

    // Complete the sequence
    const correctInput = engine.state.sequence!.steps[0]
    engine.handleInput(correctInput)

    // Verify sequence has changed
    expect(engine.state.sequence?.id).not.toBe(initialSeqId)
  })
})
