import { useState, useEffect, useCallback } from 'react'
import { PixelAvatar } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall, Home as HomeIcon } from '@pxlkit/ui'
import type { Lobby, MultiplayerParticipant, QteDirection } from '../../lib/types'
import { keyToDirection, generateSequence } from '../../lib/qte'

interface MultiplayerGameplayProps {
  lobby: Lobby
  onLeave: () => void
}

import { PixelArrowUp, PixelArrowDown, PixelArrowLeft, PixelArrowRight } from '../PixelArrows';

const ARROW: Record<QteDirection, JSX.Element> = {
  up: <PixelArrowUp />,
  down: <PixelArrowDown />,
  left: <PixelArrowLeft />,
  right: <PixelArrowRight />,
}

const DEFAULT_STEPS: QteDirection[] = ['up', 'right', 'down', 'down', 'down']

function fillParticipants(participants: MultiplayerParticipant[]): MultiplayerParticipant[] {
  const target = 10
  const pool = ['Nova Rust', 'Turbo Finch', 'Axel Moon', 'Riven Byte', 'Cinder Vale']
  const list = [...participants]
  while (list.length < target) {
    const i = list.length
    list.push({
      id: `placeholder-${i}`,
      name: pool[i % pool.length],
      score: 12500,
      alive: i < 7,
      sequence: { id: `mock-${i}`, steps: DEFAULT_STEPS },
      progress: 0,
    })
  }
  return list
}

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

export default function MultiplayerGameplay({ lobby, onLeave }: MultiplayerGameplayProps) {
  const [localParticipant, setLocalParticipant] = useState<MultiplayerParticipant>(() => {
    const orig = lobby.participants[0] || {
      id: 'local-mock',
      name: 'Nice Nature',
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

  const [opponents, setOpponents] = useState<MultiplayerParticipant[]>(() =>
    fillParticipants(lobby.participants)
      .slice(1)
      .map((p, idx) => ({
        ...p,
        score: 12500 + idx * 100,
        progress: Math.floor(Math.random() * 3),
        sequence: p.sequence || { id: `opp-${idx}`, steps: DEFAULT_STEPS },
      })),
  )

  const [timeLeftMs, setTimeLeftMs] = useState(lobby.variant === 'elimination' ? 15000 : 30000)
  const [limitSeconds, setLimitSeconds] = useState(15)

  // Simulate opponent progress
  useEffect(() => {
    const interval = setInterval(() => {
      setOpponents((prev) =>
        prev.map((opp) => {
          if (!opp.alive) return opp
          if (Math.random() > 0.6) {
            const nextProgress = opp.progress + 1
            if (nextProgress >= (opp.sequence?.steps.length ?? 5)) {
              return {
                ...opp,
                progress: 0,
                score: opp.score + Math.floor(Math.random() * 200) + 100,
                sequence: { id: `seq-${Date.now()}-${opp.id}`, steps: generateSequence(5).steps },
              }
            }
            return { ...opp, progress: nextProgress }
          }
          return opp
        }),
      )
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  // Match timer
  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - start
      
      if (lobby.variant === 'elimination') {
        const remaining = Math.max(0, (limitSeconds * 1000) - (elapsed % (limitSeconds * 1000)))
        setTimeLeftMs(remaining)
      } else {
        const remaining = Math.max(0, 30000 - elapsed)
        setTimeLeftMs(remaining)
        if (remaining <= 0) clearInterval(interval)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [limitSeconds, lobby.variant])

  const handleInput = useCallback((direction: QteDirection) => {
    setLocalParticipant((prev) => {
      if (!prev.alive || !prev.sequence) return prev
      const steps = prev.sequence.steps
      const expected = steps[prev.progress]
      
      if (direction !== expected) {
        if (lobby.variant === 'elimination') return { ...prev, progress: 0 }
        return { ...prev, progress: 0 }
      }
      
      const nextProgress = prev.progress + 1
      if (nextProgress >= steps.length) {
        const newScore = prev.score + 500
        
        if (lobby.variant === 'elimination') {
          const isHarder = newScore > 0 && (newScore / 500) % 25 === 0
          const nextLimitSeconds = isHarder ? Math.max(5, limitSeconds - 1) : limitSeconds
          setLimitSeconds(nextLimitSeconds)
          setTimeLeftMs(nextLimitSeconds * 1000)
        }
        
        return {
          ...prev,
          score: newScore,
          progress: 0,
          sequence: generateSequence(5),
        }
      }
      return { ...prev, progress: nextProgress }
    })
  }, [lobby.variant, limitSeconds])

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

  const pct = Math.max(0, Math.min(100, (timeLeftMs / 30000) * 100))

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
      </section>
    </main>
  )
}
