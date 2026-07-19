import { useState, useEffect, useCallback, useRef } from 'react'
import { PixelAvatar, PixelCard } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall } from '@pxlkit/ui'
import type { ReactElement } from 'react'
import type { Lobby, MultiplayerParticipant, QteDirection } from '../../lib/types'
import { keyToDirection, generateSequence } from '../../lib/qte'
import { GameEngine } from '../../lib/gameEngine'
import { useTelemetry } from '../../hooks/useTelemetry'
import type { Telemetry } from '../../lib/telemetry'

import { PixelArrowUp, PixelArrowDown, PixelArrowLeft, PixelArrowRight } from '../PixelArrows'
import Dpad from '../Dpad'

const ARROW: Record<QteDirection, ReactElement> = {
  up: <PixelArrowUp />,
  down: <PixelArrowDown />,
  left: <PixelArrowLeft />,
  right: <PixelArrowRight />,
}

const DEFAULT_STEPS: QteDirection[] = ['up', 'right', 'down', 'down', 'down']

interface MultiplayerGameplayProps {
  lobby: Lobby
  localParticipantId: string | null
  onLeave: () => void
  trackLocal: (participant: MultiplayerParticipant) => void
  endRound: () => void
  onTelemetry?: (telemetry: Telemetry) => void
}

/** Sidebar row per participant — matches MP.png layout */
function ParticipantRow({ participant, isTimerMode }: { participant: MultiplayerParticipant; isTimerMode: boolean }) {
  const steps = participant.sequence?.steps ?? DEFAULT_STEPS
  const isAlive = participant.alive
  const isFinished = participant.finished
  return (
    <div className={['flex flex-col gap-1 py-2 border-b border-retro-border/20 last:border-0', !isAlive ? 'opacity-50' : isFinished ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-center justify-between gap-1">
        <PixelAvatar
          name={participant.name}
          size="sm"
          tone={!isAlive ? 'neutral' : isFinished ? 'cyan' : 'green'}
        />
        <span
          className={[
            'flex items-center gap-1 rounded-full border px-2 py-0.5 font-pixel text-[9px]',
            isAlive
              ? 'border-retro-border text-retro-text bg-retro-bg'
              : 'border-retro-border/40 text-retro-muted/60 bg-retro-bg/40',
          ].join(' ')}
        >
          {isAlive ? (
            isTimerMode && isFinished ? (
              <>✓ DONE</>
            ) : (
              <>× {participant.progress + 344}</>
            )
          ) : (
            <>× DEAD</>
          )}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-retro-border px-2 py-0.5 font-pixel text-[9px] text-retro-text bg-retro-bg">
          ▦ {participant.score}
        </span>
      </div>
      <div className="flex gap-1 pl-0.5">
        {steps.slice(0, 5).map((step, i) => (
          <span
            key={`${participant.id}-${i}`}
            className={[
              'flex h-6 w-6 items-center justify-center rounded border font-pixel text-[10px]',
              i === participant.progress && isAlive
                ? 'border-retro-text bg-retro-bg text-retro-text'
                : 'border-retro-border/30 bg-retro-bg/20 text-retro-muted/30',
            ].join(' ')}
          >
            {ARROW[step]}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Thin React wrapper around the pure GameEngine library class.
 * Owns a GameEngine instance, syncs its state to React, and runs the
 * Mutiplayer-specific effects (presence, finished detection, elimination).
 */
export default function MultiplayerGameplay({
  lobby,
  localParticipantId,
  onLeave,
  trackLocal,
  endRound,
  onTelemetry,
}: MultiplayerGameplayProps) {
  const [localParticipant, setLocalParticipant] = useState<MultiplayerParticipant>(() => {
    const orig =
      lobby.participants.find((p) => p.id === localParticipantId) ??
      lobby.participants[0] ?? {
        id: localParticipantId ?? 'local',
        name: 'You',
        score: 0,
        alive: true,
        ready: false,
        finished: false,
        sequence: null,
        progress: 0,
      }
    const initialSequence = orig.sequence ?? generateSequence(lobby.sequenceLength)
    return { ...orig, sequence: initialSequence }
  })

  // Real opponents are the other lobby participants.
  const opponents = lobby.participants.filter((p) => p.id !== localParticipant.id)

  const isElimination = lobby.variant === 'elimination'
  const engineMode = isElimination ? 'endless' : 'timer'
  const [eliminated, setEliminated] = useState(false)

  const localParticipantRef = useRef(localParticipant)
  useEffect(() => { localParticipantRef.current = localParticipant }, [localParticipant])
  const eliminatedRef = useRef(false)

  // Telemetry is collected during the match but intentionally NOT shown in-game
  // (kept out of the gameplay HUD); it is surfaced only on the results screen.
  const telemetry = useTelemetry()

  // Per-mode time/display state (only used for UI; the engine is the source of truth).
  const [timeLeftMs, setTimeLeftMs] = useState(
    isElimination ? 15_000 : lobby.windowSeconds * 1000,
  )
  const [limitSeconds, setLimitSeconds] = useState(
    isElimination ? 15 : lobby.windowSeconds,
  )
  const timeLeftRef = useRef(0)
  const limitSecondsRef = useRef(0)

  // ── GameEngine instance ──────────────────────────────────────────────────
  const engineRef = useRef<GameEngine | null>(null)

  useEffect(() => {
    const engine = new GameEngine({
      mode: engineMode,
      windowSeconds: lobby.windowSeconds,
      baseLength: lobby.sequenceLength,
      callbacks: {
        onTick(t) {
          telemetry.tick()
          timeLeftRef.current = t
          setTimeLeftMs(t)
        },
        onInput(correct) { telemetry.recordInput(correct) },
        onSequenceComplete(score) {
          telemetry.setScore(score)
          telemetry.recordSequenceComplete()
        },
        onStateChange(state) {
          limitSecondsRef.current = state.limitSeconds
          setLimitSeconds(state.limitSeconds)
          setLocalParticipant((prev) => {
            // For elimination, we keep the engine's local score/progress.
            // For timer, the engine also owns these (no endless ramp).
            const updated = {
              ...prev,
              score: state.score,
              progress: state.progress,
              sequence: state.sequence,
            }
            localParticipantRef.current = updated
            trackLocal(updated)
            return updated
          })
        },
        onTimeUp(_state) {
          telemetry.stop()
          onTelemetry?.(telemetry.telemetry)
          if (isElimination) {
            eliminatedRef.current = true
            setEliminated(true)
            const p = { ...localParticipantRef.current, alive: false, finished: true }
            localParticipantRef.current = p
            setLocalParticipant(p)
            trackLocal(p)
          } else {
            const p = { ...localParticipantRef.current, alive: true, finished: true }
            localParticipantRef.current = p
            setLocalParticipant(p)
            trackLocal(p)
            // Timer-like variants: the local player's clock ran out, so they're
            // done. End the round (host broadcasts gameover for everyone).
            void endRound()
          }
        },
      },
    })
    engineRef.current = engine

    if (lobby.phase === 'playing') {
      engine.startImmediate()
      timeLeftRef.current = isElimination ? 15_000 : lobby.windowSeconds * 1000
      limitSecondsRef.current = isElimination ? 15 : lobby.windowSeconds
      setTimeLeftMs(timeLeftRef.current)
      setLimitSeconds(limitSecondsRef.current)
    }

    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // We intentionally only create/destroy the engine when the lobby/variant
    // changes. The engine instance is reused across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.code, lobby.variant])

  // Drive the engine's local clock (elimination mode only).
  // Timer mode: the engine manages its own ticking via onTick.
  // Elimination mode: the engine's tick doesn't manage the per-player local
  // clock on mistake penalties or sequence completions — we do that here.
  useEffect(() => {
    if (!engineRef.current || !isElimination) return
    if (eliminatedRef.current) return

    const interval = setInterval(() => {
      if (!engineRef.current || eliminatedRef.current) return
      const state = engineRef.current.state
      if (state.phase !== 'playing') return

      const now = Date.now()
      const stateAny = state as any
      const lastTick = stateAny._lastTick ?? now
      const delta = Math.min(now - lastTick, 1000)
      ;(stateAny._lastTick = now)

      const next = Math.max(0, timeLeftRef.current - delta)
      timeLeftRef.current = next
      setTimeLeftMs(next)

      if (next <= 0) {
        eliminatedRef.current = true
        setEliminated(true)
        telemetry.stop()
        onTelemetry?.(telemetry.telemetry)
        const p = { ...localParticipantRef.current, alive: false, finished: true }
        localParticipantRef.current = p
        setLocalParticipant(p)
        trackLocal(p)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isElimination, telemetry, trackLocal, onTelemetry, lobby.variant])

  // When a sequence completes in elimination mode, reset the local clock
  // to the new (shorter) limit — mirroring singleplayer endless.
  useEffect(() => {
    if (!isElimination || !engineRef.current) return
    const state = engineRef.current.state
    if (state.phase !== 'playing') return
    const nextLimit = state.limitSeconds
    const changed = limitSecondsRef.current !== nextLimit
    if (changed) {
      limitSecondsRef.current = nextLimit
      timeLeftRef.current = nextLimit * 1000
      setLimitSeconds(nextLimit)
      setTimeLeftMs(timeLeftRef.current)
    }
  }, [localParticipant.sequence, isElimination])

  // Timer-like variants: when ALL participants are finished, end the round.
  useEffect(() => {
    if (lobby.phase !== 'playing') return
    if (isElimination) return
    const allFinished = lobby.participants.every((p) => p.finished)
    if (allFinished && lobby.participants.length > 0) {
      endRound()
    }
  }, [lobby.phase, lobby.variant, lobby.participants, endRound, isElimination])

  // Elimination mode: the local player wins when they are the last one standing.
  useEffect(() => {
    if (lobby.phase !== 'playing' || !isElimination) return
    if (eliminatedRef.current) return
    const aliveCount = [localParticipant, ...opponents].filter((p) => p.alive).length
    if (aliveCount <= 1 && localParticipant.alive) {
      telemetry.stop()
      onTelemetry?.(telemetry.telemetry)
      endRound()
    }
  }, [lobby.phase, lobby.variant, localParticipant, opponents, telemetry, onTelemetry, endRound, isElimination])

  const handleInput = useCallback(
    (direction: QteDirection) => {
      if (eliminatedRef.current || localParticipant.finished) return
      if (!engineRef.current) return

      if (isElimination) {
        const expected = localParticipant.sequence?.steps[localParticipant.progress]
        const correct = direction === expected
        telemetry.recordInput(correct)

        if (!correct) {
          const penalized = Math.max(0, timeLeftRef.current - 2000)
          timeLeftRef.current = penalized
          setTimeLeftMs(penalized)
          if (penalized <= 0) {
            eliminatedRef.current = true
            setEliminated(true)
            telemetry.stop()
            onTelemetry?.(telemetry.telemetry)
            const p = { ...localParticipantRef.current, alive: false, finished: true, progress: 0 }
            localParticipantRef.current = p
            setLocalParticipant(p)
            trackLocal(p)
            return
          }
          const nxt = { ...localParticipantRef.current, progress: 0 }
          localParticipantRef.current = nxt
          setLocalParticipant(nxt)
          trackLocal(nxt)
          return
        }
      }

      engineRef.current.handleInput(direction)
    },
    [engineMode, eliminatedRef, isElimination, localParticipant.finished, localParticipant.progress, localParticipant.sequence, telemetry, trackLocal, onTelemetry],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) handleInput(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInput])

  // ── Derived display values ──────────────────────────────────────────────
  const activeSequence = localParticipant.sequence?.steps ?? DEFAULT_STEPS
  const playersRemaining = lobby.variant === 'elimination'
    ? [localParticipant, ...opponents].filter((p) => p.alive).length
    : [localParticipant, ...opponents].filter((p) => !p.finished).length

  const clockDenominator =
    lobby.variant === 'elimination' ? limitSeconds * 1000 : lobby.windowSeconds * 1000
  const pct = Math.max(0, Math.min(100, (timeLeftMs / clockDenominator) * 100))

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col">
      {/* Sidebar */}
      <aside className="flex w-full flex-col gap-4 border-b border-retro-border/30 p-4 md:w-64 md:border-b-0 md:border-r">
        <PixelCard title="Lobby" tone="neutral" className="w-full md:w-64">
          <div className="mb-2 flex items-center justify-between text-sm text-retro-muted">
            <span>Code</span>
            <span className="font-mono text-retro-text">{lobby.code}</span>
          </div>
          <div className="flex flex-col gap-2">
            {[localParticipant, ...opponents].map((p) => (
              <ParticipantRow key={p.id} participant={p} isTimerMode={lobby.variant !== 'elimination'} />
            ))}
          </div>
        </PixelCard>

        {/* Leave button pinned to bottom */}
        <div className="mt-auto border-t border-retro-border/30 pt-3">
          <button
            onClick={onLeave}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-retro-border bg-retro-bg px-3 py-2 font-pixel text-[10px] text-retro-muted hover:border-retro-border-strong hover:text-retro-text"
          >
            Leave Match
          </button>
        </div>
      </aside>

      {/* Main gameplay area */}
      <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        {/* Players remaining pill */}
        <div className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-5 py-2 font-pixel text-xs text-retro-text">
          <PxlKitIcon icon={SparkleSmall} size={12} />
          {playersRemaining} players remaining!
        </div>

        {/* Gameplay card */}
        <div className="w-full max-w-lg rounded-2xl border-2 border-retro-border bg-retro-surface p-6">
          <div className="flex flex-col items-center gap-4">
            {/* Arrow Steps */}
            <div className="flex justify-center gap-2">
              {activeSequence.slice(0, 5).map((step, i) => (
                <span
                  key={`active-${i}`}
                  className={[
                    'flex h-14 w-14 items-center justify-center rounded-lg border-2 font-pixel text-2xl transition-colors',
                    i === (localParticipant?.progress ?? 0)
                      ? 'border-retro-text bg-retro-bg text-retro-text'
                      : 'border-retro-border/30 bg-retro-bg/20 text-retro-muted/30',
                  ].join(' ')}
                >
                  {ARROW[step]}
                </span>
              ))}
            </div>

            {/* Thin progress bar */}
            <div className="w-full max-w-xs">
              <div className="h-2 w-full overflow-hidden rounded-full border border-retro-border/40 bg-retro-bg/60">
                <div
                  className="h-full rounded-full bg-retro-text transition-all duration-75"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <p className="font-pixel text-center text-[10px] leading-relaxed text-retro-muted">
              Use the directional keys or W/A/S/D on your keyboard!
            </p>
          </div>
        </div>

        {/* Clock pill below card */}
        <div className="flex items-center gap-2 rounded-full border-2 border-retro-border bg-retro-surface px-5 py-2 font-pixel text-sm text-retro-text">
          <PxlKitIcon icon={Clock} size={14} />
          {formatTime(timeLeftMs)}
        </div>

        {/* On-screen D-pad */}
        <Dpad onInput={handleInput} disabled={eliminated || localParticipant.finished} />

        {eliminated && (
          <p className="font-pixel text-center text-sm text-red-400">
            You were eliminated! Hang tight — the match ends when everyone finishes.
          </p>
        )}
        {!eliminated && localParticipant.finished && lobby.variant !== 'elimination' && (
          <p className="font-pixel text-center text-sm text-retro-muted">
            You're done! Waiting for others to finish...
          </p>
        )}
      </section>
    </main>
  )
}
