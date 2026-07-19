/// <reference lib="webworker" />
/**
 * Telemetry Web Worker.
 *
 * Owns the {@link TelemetryTracker} off the main thread. Commands mutate the
 * tracker; snapshots are pushed back to the main thread on a fixed cadence
 * (rather than on every command) so the worker never floods the main thread
 * with messages — the render loop stays smooth regardless of input rate.
 */

import { TelemetryTracker } from './telemetry'
import type { TelemetryCommand, TelemetryEvent } from './telemetryProtocol'

const tracker = new TelemetryTracker()

/** Max snapshots pushed per second (10 Hz keeps the HUD live without spamming). */
const SNAPSHOT_INTERVAL_MS = 100

let lastSnapshot = 0

/** Dev-only logging — stripped from production builds by Vite. */
const debug = import.meta.env.DEV
  ? (...args: unknown[]) => console.debug('[telemetry-worker]', ...args)
  : () => {}

function post(event: TelemetryEvent): void {
  if (event.type === 'snapshot') {
    debug('→ snapshot', {
      totalInputs: event.telemetry.totalInputs,
      correctInputs: event.telemetry.correctInputs,
      sequencesCompleted: event.telemetry.sequencesCompleted,
      averageKpm: Math.round(event.telemetry.averageKpm),
      accuracy: Number(event.telemetry.accuracy.toFixed(3)),
    })
  }
  ;(self as DedicatedWorkerGlobalScope).postMessage(event)
}

function maybeSnapshot(now: number): void {
  if (now - lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
    lastSnapshot = now
    post({ type: 'snapshot', telemetry: tracker.getSnapshot() })
  }
}

self.onmessage = (e: MessageEvent<TelemetryCommand>) => {
  const msg = e.data
  debug('← command', msg.type, msg)
  switch (msg.type) {
    case 'start':
      tracker.start(msg.now)
      break
    case 'stop':
      tracker.stop(msg.now)
      break
    case 'reset':
      tracker.reset()
      break
    case 'tick':
      tracker.tick(msg.now)
      break
    case 'recordInput':
      tracker.recordInput(msg.correct, msg.now)
      break
    case 'recordSequenceComplete':
      tracker.recordSequenceComplete(msg.now)
      break
    case 'setScore':
      tracker.setScore(msg.score)
      break
    case 'setSequenceLength':
      tracker.setSequenceLength(msg.length)
      break
    case 'getSnapshot':
      post({ type: 'snapshot', telemetry: tracker.getSnapshot() })
      return
  }
  // Push a fresh snapshot after mutating commands, throttled to SNAPSHOT_INTERVAL_MS.
  maybeSnapshot(Date.now())
}

debug('worker initialized')
post({ type: 'ready' })
