import { useEffect, useRef } from 'react'
import { PixelAvatar, PixelCard } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall } from '@pxlkit/ui'
import type { ReactElement } from 'react'
import type { Lobby, MultiplayerParticipant, QteDirection } from '../../lib/game-engine'
import {
  isPlayerEliminated,
  shouldEndTimerRound,
  hasLocalPlayerWonElimination,
  shouldEndEliminationRound,
  buildParticipant,
} from '../../lib/game-engine'
import { useSingleplayerState } from '../../hooks/useSingleplayerState'
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
  trackLocal: (participant: MultiplayerParticipant, immediate?: boolean) => void
  endRound: () => void
  onTelemetry?: (telemetry: Telemetry) => void
}

/**
 * Multiplayer gameplay, built directly on top of the singleplayer engine.
 *
 * Instead of re-implementing the game loop, this component reuses
 * `useSingleplayerState` — the exact same hook singleplayer uses — so the local
 * player's input handling, endless mistake penalty, and sequence-completion
 * ramp are byte-for-byte identical to solo play. The only multiplayer-specific
 * concerns layered on top are:
 *   - syncing the local engine state into presence (`trackLocal`),
 *   - the elimination win/lose bookkeeping (`alive`/`finished` flags),
 *   - ending the round when everyone is done / the local player is last standing.
 */
export default function MultiplayerGameplay({
  lobby,
  localParticipantId,
  onLeave,
  trackLocal,
  endRound,
  onTelemetry,
}: MultiplayerGameplayProps) {
  // The singleplayer engine is the single source of truth for local gameplay.
  const single = useSingleplayerState()

  const isElimination = lobby.variant === 'elimination'
  const engineMode = isElimination ? 'endless' : 'timer'

  const eliminatedRef = useRef(false)
  const endedRef = useRef(false)
  // Local player's display name, captured once at match start so the presence
  // sync effect doesn't need to depend on lobby.participants (which it writes
  // back into, causing a render loop).
  const localNameRef = useRef('You')

  // Real opponents are the other lobby participants.
  const opponents = lobby.participants.filter((p) => p.id !== localParticipantId)

  // ── Drive the engine from the lobby lifecycle ────────────────────────────
  // Start the local engine when the lobby transitions into the playing phase.
  // We reuse the singleplayer `startImmediate()` so the prestart/playing flow,
  // the endless ramp, and the mistake penalty are all identical to solo play —
  // but WITHOUT a second prestart countdown, since the lobby already ran its
  // own prestart (CountdownScreen) before reaching the playing phase.
  useEffect(() => {
    if (lobby.phase !== 'playing') return
    if (endedRef.current) return
    eliminatedRef.current = false
    localNameRef.current = lobby.participants.find((p) => p.id === localParticipantId)?.name ?? 'You'
    single.startImmediate(engineMode, isElimination ? 15 : lobby.windowSeconds, lobby.sequenceLength)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.phase, lobby.code])

  // ── Mirror the engine state into presence ────────────────────────────────
  // This is the ONLY gameplay divergence from singleplayer: we broadcast the
  // local player's live engine state so opponents can see it. The engine
  // itself is untouched.
  useEffect(() => {
    const state = single.state
    if (state.phase !== 'playing') return
    const updated = buildParticipant(state, localParticipantId, localNameRef.current, lobby.variant)
    trackLocal(updated, false)
    // NOTE: intentionally NOT depending on `lobby.participants`. `trackLocal`
    // writes back into lobby.participants (mock mode) or triggers a presence
    // sync that rewrites it (real mode); depending on it would re-run this
    // effect every tick and cause an infinite render loop. The name is captured
    // once at match start via localNameRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    single.state.phase,
    single.state.score,
    single.state.sequence?.id,
    single.state.progress,
    localParticipantId,
    trackLocal,
    lobby.variant,
  ])

  // ── Elimination: local player eliminated when their engine ends ──────────
  useEffect(() => {
    if (!isElimination) return
    if (isPlayerEliminated(single.state, lobby.variant) && !eliminatedRef.current) {
      eliminatedRef.current = true
      // Broadcast the final dead state so opponents see the elimination.
      const updated = buildParticipant(single.state, localParticipantId, localNameRef.current, lobby.variant)
      trackLocal(updated, true)
      onTelemetry?.(single.telemetry)

      if (shouldEndEliminationRound(lobby.participants, localParticipantId) && !endedRef.current) {
        endedRef.current = true
        void endRound()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    single.state.phase,
    isElimination,
    single.telemetry,
    single.state.score,
    single.state.sequence,
    single.state.progress,
    localParticipantId,
    trackLocal,
    onTelemetry,
    lobby.variant,
    lobby.participants,
    endRound,
  ])

  // ── Timer-like variants: end the round when the local clock runs out ─────
  useEffect(() => {
    if (isElimination) return
    if (single.state.phase === 'gameover' && !endedRef.current) {
      endedRef.current = true
      // Broadcast the final finished state so opponents/host see completion.
      const updated = buildParticipant(single.state, localParticipantId, localNameRef.current, lobby.variant)
      trackLocal(updated, true)
      onTelemetry?.(single.telemetry)
      void endRound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single.state.phase, isElimination, endRound, single.telemetry, single.state.score, single.state.sequence, single.state.progress, localParticipantId, trackLocal, onTelemetry, lobby.variant])

  // ── Timer-like variants: end the round when ALL participants are done ────
  useEffect(() => {
    if (lobby.phase !== 'playing' || isElimination) return
    if (shouldEndTimerRound(lobby.participants) && !endedRef.current) {
      endedRef.current = true
      void endRound()
    }
  }, [lobby.phase, lobby.variant, lobby.participants, isElimination, endRound])

  // ── Elimination: local player wins when last one standing ────────────────
  useEffect(() => {
    if (lobby.phase !== 'playing' || !isElimination || eliminatedRef.current) return

    const localDisplay = buildParticipant(single.state, localParticipantId, localNameRef.current, lobby.variant)
    const opponents = lobby.participants.filter((p) => p.id !== localParticipantId)
    const displayParticipants = [localDisplay, ...opponents]

    if (hasLocalPlayerWonElimination(displayParticipants, localParticipantId) && !endedRef.current) {
      endedRef.current = true
      onTelemetry?.(single.telemetry)
      void endRound()
    }
  }, [lobby.phase, lobby.variant, localParticipantId, lobby.participants, isElimination, single.telemetry, single.state, endRound, onTelemetry])

  // Reset the ended flag when a new lobby/round starts.
  useEffect(() => {
    if (lobby.phase !== 'playing') endedRef.current = false
  }, [lobby.phase, lobby.code])

  // Keyboard input is already handled by useSingleplayerState's own listener,
  // which delegates straight to the engine — so we don't add a second one.

  // ── Derived display values ──────────────────────────────────────────────
  const state = single.state
  const activeSequence = state.sequence?.steps ?? DEFAULT_STEPS
  const eliminated = isPlayerEliminated(state, lobby.variant)

  // The local player's row is driven directly by the live engine state
  // (single.state) so it updates in real time without depending on the
  // presence round-trip. Opponents come from lobby presence (lobby.participants).
  const localDisplay = buildParticipant(state, localParticipantId, localNameRef.current, lobby.variant)
  const displayParticipants = [localDisplay, ...opponents]

  const playersRemaining = isElimination
    ? (localDisplay.alive ? 1 : 0) + opponents.filter((o) => o.alive).length
    : (localDisplay.finished ? 0 : 1) + opponents.filter((o) => !o.finished).length

  const clockDenominator = isElimination ? state.limitSeconds * 1000 : lobby.windowSeconds * 1000
  const pct = Math.max(0, Math.min(100, (state.timeLeftMs / clockDenominator) * 100))

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full flex-col gap-4 border-b border-retro-border/30 p-4 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <PixelCard title="Lobby" tone="neutral" className="w-full">
          <div className="mb-2 flex items-center justify-between text-sm text-retro-muted">
            <span>Code</span>
            <span className="font-mono text-retro-text">{lobby.code}</span>
          </div>
          <div className="flex flex-col gap-2">
            {displayParticipants.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isTimerMode={!isElimination}
                isLocal={p.id === localParticipantId}
              />
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
      <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 md:h-screen md:overflow-y-auto">
        {/* Players remaining pill */}
        <div className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-5 py-2 font-pixel text-xs text-retro-text">
          <PxlKitIcon icon={SparkleSmall} size={12} />
          {playersRemaining} players remaining!
        </div>

        {/* Gameplay card — identical layout to singleplayer */}
        <div className="w-full max-w-lg rounded-2xl border-2 border-retro-border bg-retro-surface p-6">
          <div className="flex flex-col items-center gap-4">
            {/* Score badge */}
            <div className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-4 py-1.5 font-pixel text-xs text-retro-text">
              <PxlKitIcon icon={SparkleSmall} size={12} />
              Score: {state.score}
            </div>

            {/* QTE Arrow Steps */}
            <div className="flex justify-center gap-2">
              {activeSequence.slice(0, 5).map((step, i) => (
                <span
                  key={`active-${i}`}
                  className={[
                    'flex h-14 w-14 items-center justify-center rounded-lg border-2 font-pixel text-2xl transition-colors',
                    i === state.progress
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
          {formatTime(state.timeLeftMs)}
        </div>

        {/* On-screen D-pad */}
        <Dpad onInput={single.handleInput} disabled={eliminated || state.phase !== 'playing'} />

        {eliminated && (
          <p className="font-pixel text-center text-sm text-red-400">
            You were eliminated! Hang tight — the match ends when everyone finishes.
          </p>
        )}
        {!eliminated && state.phase === 'gameover' && !isElimination && (
          <p className="font-pixel text-center text-sm text-retro-muted">
            You're done! Waiting for others to finish...
          </p>
        )}
      </section>
    </main>
  )
}

/** Sidebar row per participant — matches MP.png layout */
function ParticipantRow({
  participant,
  isTimerMode,
  isLocal,
}: {
  participant: MultiplayerParticipant
  isTimerMode: boolean
  isLocal: boolean
}) {
  const steps = participant.sequence?.steps ?? DEFAULT_STEPS
  const isAlive = participant.alive
  const isFinished = participant.finished
  return (
    <div
      className={[
        'flex flex-col gap-1 py-2 border-b border-retro-border/20 last:border-0',
        !isAlive ? 'opacity-50' : isFinished ? 'opacity-60' : '',
      ].join(' ')}
    >
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
              <>{isLocal ? '× YOU' : `× ${participant.progress}`}</>
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
