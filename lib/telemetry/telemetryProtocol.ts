/**
 * Message protocol shared between the main thread and the telemetry Web Worker.
 *
 * The worker owns a single {@link TelemetryTracker} instance and runs it off the
 * main thread so per-keystroke / per-tick bookkeeping never competes with the
 * gameplay render loop. The main thread sends commands and receives throttled
 * snapshots.
 */

import type { Telemetry } from './telemetry'

/** Commands sent from the main thread into the worker. */
export type TelemetryCommand =
  | { type: 'start'; now: number }
  | { type: 'stop'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number }
  | { type: 'recordInput'; correct: boolean; now: number }
  | { type: 'recordSequenceComplete'; now: number }
  | { type: 'setScore'; score: number }
  | { type: 'setSequenceLength'; length: number }
  | { type: 'getSnapshot' }

/** Messages sent from the worker back to the main thread. */
export type TelemetryEvent =
  | { type: 'snapshot'; telemetry: Telemetry }
  | { type: 'ready' }
