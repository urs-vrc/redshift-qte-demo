/**
 * Main-thread client for the telemetry Web Worker.
 *
 * Spawns a single shared worker and exposes a command API plus a subscribe
 * stream for snapshots. The worker is created lazily on first use and torn down
 * on `terminate()` (e.g. on hot-reload during dev). All command methods are
 * fire-and-forget: they post a message and return immediately, so calling them
 * from the gameplay loop never blocks the main thread.
 */

import { createEmptyTelemetry } from './telemetry'
import type { Telemetry } from './telemetry'
import type { TelemetryCommand, TelemetryEvent } from './telemetryProtocol'

type SnapshotListener = (telemetry: Telemetry) => void

/** Dev-only logging — stripped from production builds by Vite. */
const debug = import.meta.env.DEV
  ? (...args: unknown[]) => console.debug('[telemetry-client]', ...args)
  : () => {}

class TelemetryWorkerClient {
  private worker: Worker | null = null
  private listeners = new Set<SnapshotListener>()
  private latest: Telemetry = createEmptyTelemetry()

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(
      new URL('./telemetryWorker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e: MessageEvent<TelemetryEvent>) => {
      const msg = e.data
      if (msg.type === 'snapshot') {
        debug('← snapshot received', {
          totalInputs: msg.telemetry.totalInputs,
          sequencesCompleted: msg.telemetry.sequencesCompleted,
          averageKpm: Math.round(msg.telemetry.averageKpm),
        })
        this.latest = msg.telemetry
        for (const listener of this.listeners) listener(msg.telemetry)
      } else if (msg.type === 'ready') {
        debug('worker ready')
      }
    }
    this.worker = worker
    debug('worker spawned')
    return worker
  }

  private send(command: TelemetryCommand): void {
    debug('→ command', command.type, command)
    this.ensureWorker().postMessage(command)
  }

  /** Subscribe to snapshot updates. Returns an unsubscribe function. */
  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    // Replay the most recent snapshot so new subscribers render immediately.
    listener(this.latest)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): Telemetry {
    return this.latest
  }

  start(now: number = Date.now()): void {
    this.send({ type: 'start', now })
  }

  stop(now: number = Date.now()): void {
    this.send({ type: 'stop', now })
  }

  reset(): void {
    this.send({ type: 'reset' })
  }

  tick(now: number = Date.now()): void {
    this.send({ type: 'tick', now })
  }

  recordInput(correct: boolean, now: number = Date.now()): void {
    this.send({ type: 'recordInput', correct, now })
  }

  recordSequenceComplete(now: number = Date.now()): void {
    this.send({ type: 'recordSequenceComplete', now })
  }

  setScore(score: number): void {
    this.send({ type: 'setScore', score })
  }

  setSequenceLength(length: number): void {
    this.send({ type: 'setSequenceLength', length })
  }

  /** Tear down the worker (used on hot-reload / unmount of the app root). */
  terminate(): void {
    this.worker?.terminate()
    this.worker = null
    this.listeners.clear()
    this.latest = createEmptyTelemetry()
  }
}

/** Shared singleton — one worker for the whole app. */
export const telemetryClient = new TelemetryWorkerClient()
