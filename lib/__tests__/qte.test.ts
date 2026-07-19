import { describe, it, expect } from 'vitest'
import {
  generateSequence,
  endlessTimeLimit,
  endlessSequenceLength,
  ENDLESS_TIME_FLOOR_SECONDS,
  ENDLESS_TIME_START_SECONDS,
  ENDLESS_MAX_LENGTH,
} from '../game-engine'
import { keyToDirection } from '../game-engine/input'

describe('generateSequence', () => {
  it('returns a sequence of the requested length with valid directions', () => {
    const seq = generateSequence(8)
    expect(seq.steps).toHaveLength(8)
    expect(seq.id).toBeTruthy()
    for (const d of seq.steps) {
      expect(['up', 'down', 'left', 'right']).toContain(d)
    }
  })
})

describe('endlessTimeLimit', () => {
  it('starts at the configured value and decays with score', () => {
    expect(endlessTimeLimit(0)).toBe(ENDLESS_TIME_START_SECONDS)
    expect(endlessTimeLimit(10)).toBeCloseTo(15 - 2)
  })

  it('never drops below the floor', () => {
    expect(endlessTimeLimit(1000)).toBe(ENDLESS_TIME_FLOOR_SECONDS)
  })
})

describe('endlessSequenceLength', () => {
  it('grows with score and is capped at the maximum', () => {
    expect(endlessSequenceLength(0, 3)).toBe(3)
    expect(endlessSequenceLength(10, 3)).toBe(4)
    expect(endlessSequenceLength(1000, 3)).toBe(ENDLESS_MAX_LENGTH)
  })
})

describe('keyToDirection', () => {
  it('maps arrow keys and WASD (case-insensitive)', () => {
    expect(keyToDirection('ArrowUp')).toBe('up')
    expect(keyToDirection('w')).toBe('up')
    expect(keyToDirection('W')).toBe('up')
    expect(keyToDirection('ArrowDown')).toBe('down')
    expect(keyToDirection('s')).toBe('down')
    expect(keyToDirection('ArrowLeft')).toBe('left')
    expect(keyToDirection('a')).toBe('left')
    expect(keyToDirection('ArrowRight')).toBe('right')
    expect(keyToDirection('d')).toBe('right')
  })

  it('returns null for non-directional keys', () => {
    expect(keyToDirection('Enter')).toBeNull()
    expect(keyToDirection(' ')).toBeNull()
    expect(keyToDirection('Shift')).toBeNull()
  })
})
