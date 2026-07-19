import type { QteDirection, QteSequence } from '../types'

const DIRECTIONS: QteDirection[] = ['up', 'down', 'left', 'right']

let counter = 0
function nextId(): string {
  counter += 1
  return `seq_${Date.now().toString(36)}_${counter}`
}

/** Generate a random QTE sequence of the given length. */
export function generateSequence(length: number): QteSequence {
  const steps: QteDirection[] = []
  for (let i = 0; i < length; i += 1) {
    steps.push(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)])
  }
  return { id: nextId(), steps }
}

/**
 * Compute the per-sequence time limit (seconds) for endless mode.
 * Starts at 15s and decays continuously as the score climbs, with a 3s floor.
 */
export const ENDLESS_TIME_START_SECONDS = 15
export const ENDLESS_TIME_FLOOR_SECONDS = 3
export const ENDLESS_TIME_DECAY_PER_POINT = 0.2

export function endlessTimeLimit(score: number): number {
  return Math.max(
    ENDLESS_TIME_FLOOR_SECONDS,
    ENDLESS_TIME_START_SECONDS - score * ENDLESS_TIME_DECAY_PER_POINT,
  )
}

/**
 * Determine the combination length for an endless-mode sequence given the current score.
 * Length grows monotonically with score (base + floor(score / 10)), capped at a maximum,
 * so the ramp always trends upward instead of randomly dipping back to short sequences.
 */
export const ENDLESS_MAX_LENGTH = 10

export function endlessSequenceLength(score: number, baseLength: number): number {
  return Math.min(ENDLESS_MAX_LENGTH, baseLength + Math.floor(score / 10))
}

/**
 * Time penalty (seconds) applied to the endless-mode clock on a wrong input. This punishes
 * mistakes directly against the timer, the same resource the player is racing.
 */
export const ENDLESS_MISTAKE_PENALTY_SECONDS = 2
