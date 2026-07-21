import { useEffect } from 'react'
import { PixelAvatar, PixelCard } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall } from '@pxlkit/ui'
import type { ReactElement } from 'react'
import {
  getDerivedMatchState,
  type Lobby,
  type MultiplayerParticipant,
  type QteDirection,
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

export default function MultiplayerGameplay({
  lobby,
  localParticipantId,
  onLeave,
  trackLocal,
  endRound,
  onTelemetry,
}: MultiplayerGameplayProps) {
  const single = useSingleplayerState()

  const isElimination = lobby.variant === 'elimination'
  const engineMode = isElimination ? 'endless' : 'timer'

  const localName = lobby.participants.find((p) => p.id === localParticipantId)?.name ?? 'You'

  // Centralize all match state rules into a single pure selector
  const {
    isLocalPlayerEliminated,
    isLocalPlayerFinished,
    isRoundOver,
    displayParticipants,
    playersRemaining,
  } = getDerivedMatchState(
    lobby.phase,
    lobby.variant,
    lobby.participants,
    localParticipantId,
    single.state,
    localName
  )

  // Start the local engine when the lobby transitions into playing
  useEffect(() => {
    if (lobby.phase !== 'playing') return
    single.startImmediate(engineMode, isElimination ? 15 : lobby.windowSeconds, lobby.sequenceLength)
  }, [lobby.phase, lobby.code, lobby.windowSeconds, lobby.sequenceLength, engineMode, isElimination])

  // Mirror the local engine state into presence
  const localParticipantState = displayParticipants.find((p) => p.id === (localParticipantId ?? 'local'))

  useEffect(() => {
    if (lobby.phase !== 'playing' || !localParticipantState) return
    const isCritical = localParticipantState.finished || !localParticipantState.alive
    trackLocal(localParticipantState, isCritical)
  }, [localParticipantState, lobby.phase, trackLocal])

  // Submit telemetry on game over / round end
  useEffect(() => {
    if (isLocalPlayerFinished) {
      onTelemetry?.(single.telemetry)
    }
  }, [isLocalPlayerFinished, onTelemetry, single.telemetry])

  // End the round locally once the selector determines the round is over
  useEffect(() => {
    if (isRoundOver) {
      void endRound()
    }
  }, [isRoundOver, endRound])

  // Derived display values
  const state = single.state
  const activeSequence = state.sequence?.steps ?? DEFAULT_STEPS

  const clockDenominator = isElimination ? state.limitSeconds * 1000 : lobby.windowSeconds * 1000
  const pct = Math.max(0, Math.min(100, (state.timeLeftMs / clockDenominator) * 100))

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

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
        <Dpad onInput={single.handleInput} disabled={isLocalPlayerEliminated || state.phase !== 'playing'} />

        {isLocalPlayerEliminated && (
          <p className="font-pixel text-center text-sm text-red-400">
            You were eliminated! Hang tight — the match ends when everyone finishes.
          </p>
        )}
        {!isLocalPlayerEliminated && state.phase === 'gameover' && !isElimination && (
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
