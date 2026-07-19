import { useState, useEffect, useCallback, useRef } from 'react'
import { PixelAvatar } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall, Home as HomeIcon } from '@pxlkit/ui'
import type { ReactElement } from 'react'
import type { Lobby, MultiplayerParticipant, QteDirection } from '../../lib/types'
import {
  keyToDirection,
  generateSequence,
  endlessSequenceLength,
  endlessTimeLimit,
  ENDLESS_MISTAKE_PENALTY_SECONDS,
  ENDLESS_TIME_START_SECONDS,
} from '../../lib/qte'
import { useTelemetry } from '../../hooks/useTelemetry'
import TelemetryStats from '../TelemetryStats'
import TelemetryChart from '../TelemetryChart'

interface MultiplayerGameplayProps {
  lobby: Lobby
  localParticipantId: string | null
  onLeave: () => void
  trackLocal: (participant: MultiplayerParticipant) => void
  endRound: () => void
}

import { PixelArrowUp, PixelArrowDown, PixelArrowLeft, PixelArrowRight } from '../PixelArrows';
import Dpad from '../Dpad';

const ARROW: Record<QteDirection, ReactElement> = {
  up: <PixelArrowUp />,
  down: <PixelArrowDown />,
  left: <PixelArrowLeft />,
  right: <PixelArrowRight />,
}

const DEFAULT_STEPS: QteDirection[] = ['up', 'right', 'down', 'down', 'down']

// Multiplayer variants map onto the singleplayer modes:
//   'score' / 'reaction' -> singleplayer 'timer'   (fixed clock, no ramp, wrong input resets progress only)
//   'elimination'        -> singleplayer 'endless' (decaying clock, growing sequences, wrong input drains clock)
const SEQUENCE_BASE_LENGTH = 4

/** Sidebar row per participant — matches MP.png layout */
function ParticipantRow({ participant }: { participant: MultiplayerParticipant }) {
  const steps = participant.sequence?.steps ?? DEFAULT_STEPS
  const isAlive = participant.alive
  return (
    <div className={['flex flex-col gap-1 py-2 border-b border-retro-border/20 last:border-0', !isAlive ? 'opacity-50' : ''].join(' ')}>
      <div className="flex items-center justify-between gap-1">
        {/* Avatar */}
        <PixelAvatar
          name={participant.name}
          size="sm"
          tone={isAlive ? 'green' : 'neutral'}
        />
        {/* Status/Score badges */}
        <span
          className={[
            'flex items-center gap-1 rounded-full border px-2 py-0.5 font-pixel text-[9px]',
            isAlive
              ? 'border-retro-border text-retro-text bg-retro-bg'
              : 'border-retro-border/40 text-retro-muted/60 bg-retro-bg/40',
          ].join(' ')}
        >
          {isAlive ? (
            <>× {participant.progress + 344}</>
          ) : (
            <>× DEAD</>
          )}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-retro-border px-2 py-0.5 font-pixel text-[9px] text-retro-text bg-retro-bg">
          ▦ {participant.score}
        </span>
      </div>
      {/* Mini sequence squares */}
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

export default function MultiplayerGameplay({ lobby, localParticipantId, onLeave, trackLocal, endRound }: MultiplayerGameplayProps) {
  const [localParticipant, setLocalParticipant] = useState<MultiplayerParticipant>(() => {
    const orig =
      lobby.participants.find((p) => p.id === localParticipantId) ??
      lobby.participants[0] ?? {
        id: localParticipantId ?? 'local',
        name: 'You',
        score: 0,
        alive: true,
        sequence: { id: 'initial', steps: DEFAULT_STEPS },
        progress: 0,
      }
    return {
      ...orig,
      sequence: orig.sequence || { id: 'initial', steps: DEFAULT_STEPS },
    }
  })

  // Real opponents are the other presence participants in the lobby.
  const opponents = lobby.participants.filter((p) => p.id !== localParticipant.id)

  const [timeLeftMs, setTimeLeftMs] = useState(
    lobby.variant === 'elimination' ? ENDLESS_TIME_START_SECONDS * 1000 : 5000,
  )
  const [limitSeconds, setLimitSeconds] = useState(
    lobby.variant === 'elimination' ? ENDLESS_TIME_START_SECONDS : 5,
  )
  const [eliminated, setEliminated] = useState(false)

  // Keep the latest local participant in a ref so the timer effect can broadcast
  // eliminations without depending on a stale closure.
  const localParticipantRef = useRef(localParticipant)
  useEffect(() => {
    localParticipantRef.current = localParticipant
  }, [localParticipant])

  // Refs backing the match clock so mistake penalties stick and the timer can read the
  // latest limit without restarting the interval (which would reset telemetry).
  // The clock is anchored to the host's shared `startedAt` so every client counts
  // down from the same instant; only per-player mistake penalties are local.
  const timeLeftRef = useRef(
    lobby.variant === 'elimination' ? ENDLESS_TIME_START_SECONDS * 1000 : 5000,
  )
  const penaltyRef = useRef(0)
  const limitSecondsRef = useRef(limitSeconds)
  const eliminatedRef = useRef(false)
  useEffect(() => {
    limitSecondsRef.current = limitSeconds
  }, [limitSeconds])

  const telemetry = useTelemetry()

  // Match timer — ticks locally but is anchored to the host's `startedAt` so all
  // players share a synchronized clock. Timer-like variants (score/reaction) run a
  // single fixed clock; the endless-like variant (elimination) uses a continuously
  // decaying clock and ends in elimination. Per-player mistake penalties are applied
  // locally on top of the shared baseline.
  useEffect(() => {
    if (lobby.phase !== 'playing') return
    const baseLimitMs =
      lobby.variant === 'elimination' ? limitSecondsRef.current * 1000 : 5000
    const computeTimeLeft = () => {
      const elapsed = lobby.startedAt ? Date.now() - lobby.startedAt : 0
      return Math.max(0, baseLimitMs - elapsed - penaltyRef.current)
    }
    timeLeftRef.current = computeTimeLeft()
    setTimeLeftMs(timeLeftRef.current)
    telemetry.start()
    const interval = setInterval(() => {
      const next = computeTimeLeft()
      timeLeftRef.current = next
      telemetry.tick()
      if (next <= 0) {
        if (lobby.variant === 'elimination') {
          // Clock ran out: the local player is eliminated.
          eliminatedRef.current = true
          setEliminated(true)
          setLocalParticipant((prev) => ({ ...prev, alive: false }))
          trackLocal({ ...localParticipantRef.current, alive: false })
        }
        telemetry.stop()
        clearInterval(interval)
        // The local clock ending ends the round. Only the host actually
        // persists standings + broadcasts gameover; non-hosts are no-ops and
        // will receive the gameover phase via Realtime.
        endRound()
      }
      setTimeLeftMs(next)
    }, 100)
    return () => {
      telemetry.stop()
      clearInterval(interval)
    }
  }, [lobby.phase, lobby.variant, lobby.startedAt, telemetry, trackLocal, localParticipantRef, endRound])

  const handleInput = useCallback(
    (direction: QteDirection) => {
      if (eliminatedRef.current) return
      setLocalParticipant((prev) => {
        if (!prev.alive || !prev.sequence) return prev
        const steps = prev.sequence.steps
        const expected = steps[prev.progress]
        const correct = direction === expected
        telemetry.recordInput(correct)

        if (!correct) {
          // Only the endless-like (elimination) variant drains the clock on a
          // mistake, mirroring singleplayer 'endless'. Timer-like variants just
          // reset progress without a time penalty (singleplayer 'timer'). The
          // penalty is local (per-player) and layered on the shared baseline.
          if (lobby.variant === 'elimination') {
            penaltyRef.current += ENDLESS_MISTAKE_PENALTY_SECONDS * 1000
            const penalized = Math.max(0, timeLeftRef.current - ENDLESS_MISTAKE_PENALTY_SECONDS * 1000)
            timeLeftRef.current = penalized
            setTimeLeftMs(penalized)
            if (penalized <= 0) {
              eliminatedRef.current = true
              setEliminated(true)
              const eliminatedParticipant = { ...prev, alive: false, progress: 0 }
              trackLocal(eliminatedParticipant)
              return eliminatedParticipant
            }
          }
          return { ...prev, progress: 0 }
        }

        const nextProgress = prev.progress + 1
        if (nextProgress >= steps.length) {
          telemetry.recordSequenceComplete()
          const newScore = prev.score + 1
          telemetry.setScore(newScore)
          const completions = newScore

          // Difficulty ramp (#2 + #3): continuous timer decay and monotonic length growth.
          const nextLength = endlessSequenceLength(completions, SEQUENCE_BASE_LENGTH)
          if (lobby.variant === 'elimination') {
            const nextLimitSeconds = endlessTimeLimit(completions)
            setLimitSeconds(nextLimitSeconds)
            // Re-anchor the shared baseline to the new (shorter) limit; the local
            // penalty carries over so accumulated mistakes still count.
            timeLeftRef.current = nextLimitSeconds * 1000 - penaltyRef.current
            setTimeLeftMs(timeLeftRef.current)
          }

          const updated = {
            ...prev,
            score: newScore,
            progress: 0,
            sequence: generateSequence(nextLength),
          }
          trackLocal(updated)
          return updated
        }
        const updated = { ...prev, progress: nextProgress }
        trackLocal(updated)
        return updated
      })
    },
    [lobby.variant, telemetry, trackLocal],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) handleInput(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInput])

  const list = [localParticipant, ...opponents]
  const activeSequence = localParticipant.sequence?.steps ?? DEFAULT_STEPS
  const playersRemaining = list.filter((p) => p.alive).length

  const clockDenominator = lobby.variant === 'elimination' ? limitSeconds * 1000 : 5000
  const pct = Math.max(0, Math.min(100, (timeLeftMs / clockDenominator) * 100))

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  return (
    <main className="flex h-screen w-full bg-retro-bg">
      {/* ── Left sidebar — matches MP.png ──── */}
      <aside className="w-[260px] flex-none overflow-y-auto border-r-2 border-retro-border bg-retro-surface px-3 py-3">
        <div className="flex flex-col">
          {list.map((participant) => (
            <ParticipantRow key={participant.id} participant={participant} />
          ))}
        </div>
        {/* Leave button pinned to bottom */}
        <div className="mt-4 border-t border-retro-border/30 pt-3">
          <button
            onClick={onLeave}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-retro-border bg-retro-bg px-3 py-2 font-pixel text-[10px] text-retro-muted hover:border-retro-border-strong hover:text-retro-text transition-colors"
          >
            <PxlKitIcon icon={HomeIcon} size={12} />
            Leave Session
          </button>
        </div>
      </aside>

      {/* ── Main gameplay area ─────────────── */}
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

        {/* On-screen D-pad — only shown on touch devices, below the timer */}
        <Dpad onInput={handleInput} disabled={eliminated || !localParticipant.alive} />

        {eliminated && (
          <p className="font-pixel text-center text-sm text-red-400">
            You were eliminated! Hang tight — the match ends when the host finishes.
          </p>
        )}

        {/* Live telemetry HUD */}
        <TelemetryStats telemetry={telemetry.telemetry} title="Your Telemetry" className="max-w-lg" />
        <TelemetryChart telemetry={telemetry.telemetry} className="max-w-3xl" />
      </section>
    </main>
  )
}
