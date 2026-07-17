import { useState, useEffect, useCallback } from 'react'
import { PixelAvatar, PixelBadge, PixelCard, PixelButton } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall, Home as HomeIcon } from '@pxlkit/ui'
import type { Lobby, MultiplayerParticipant, QteDirection } from '../../lib/types'
import { keyToDirection, generateSequence } from '../../lib/qte'

interface MultiplayerGameplayProps {
  lobby: Lobby
  onLeave: () => void
}

const ARROW: Record<QteDirection, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
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
      sequence: null,
      progress: 0,
    })
  }
  return list
}

function ParticipantRow({ participant }: { participant: MultiplayerParticipant }) {
  const steps = participant.sequence?.steps ?? DEFAULT_STEPS
  return (
    <div className="rounded-xl border border-black/20 bg-[#d9d9d9] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <PixelAvatar name={participant.name} size="sm" tone={participant.alive ? 'green' : 'neutral'} />
        <PixelBadge tone="neutral" className="border border-black text-black">
          {participant.alive ? participant.progress + 344 : 'DEAD'}
        </PixelBadge>
        <PixelBadge tone="neutral" className="border border-black text-black">
          {participant.score}
        </PixelBadge>
      </div>
      <div className="flex gap-1">
        {steps.slice(0, 5).map((step, i) => (
          <span
            key={`${participant.id}-${i}`}
            className={[
              'flex h-7 w-7 items-center justify-center border-2 text-sm',
              i === participant.progress && participant.alive
                ? 'border-black bg-white text-black'
                : 'border-black/20 bg-[#ececec] text-black/40',
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

  const [opponents, setOpponents] = useState<MultiplayerParticipant[]>(() => {
    return fillParticipants(lobby.participants).slice(1).map((p, idx) => ({
      ...p,
      score: 12500 + idx * 100,
      progress: Math.floor(Math.random() * 3),
      sequence: p.sequence || { id: `opp-${idx}`, steps: DEFAULT_STEPS },
    }))
  })

  const [timeLeftMs, setTimeLeftMs] = useState(30000)

  // Simulation timer for opponents progress/scores
  useEffect(() => {
    const interval = setInterval(() => {
      setOpponents((prev) =>
        prev.map((opp) => {
          if (!opp.alive) return opp
          const advances = Math.random() > 0.6
          if (advances) {
            const nextProgress = opp.progress + 1
            if (nextProgress >= (opp.sequence?.steps.length ?? 5)) {
              return {
                ...opp,
                progress: 0,
                score: opp.score + Math.floor(Math.random() * 200) + 100,
                sequence: { id: `seq-${Date.now()}-${opp.id}`, steps: generateSequence(5).steps },
              }
            } else {
              return { ...opp, progress: nextProgress }
            }
          }
          return opp
        }),
      )
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  // Timer countdown
  useEffect(() => {
    const start = Date.now()
    const initialTime = 30000
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, initialTime - elapsed)
      setTimeLeftMs(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  const handleInput = useCallback((direction: QteDirection) => {
    setLocalParticipant((prev) => {
      if (!prev.alive || !prev.sequence) return prev
      const steps = prev.sequence.steps
      const expected = steps[prev.progress]
      if (direction !== expected) {
        // Reset progress on wrong input
        return { ...prev, progress: 0 }
      }
      const nextProgress = prev.progress + 1
      if (nextProgress >= steps.length) {
        return {
          ...prev,
          score: prev.score + 500,
          progress: 0,
          sequence: generateSequence(5),
        }
      }
      return { ...prev, progress: nextProgress }
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) {
        handleInput(direction)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInput])

  const list = [localParticipant, ...opponents]
  const activeSequence = localParticipant.sequence?.steps ?? DEFAULT_STEPS
  const playersRemaining = list.filter((p) => p.alive).length

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  return (
    <main className="min-h-[72vh] w-full bg-[#eee]">
      <div className="grid min-h-[72vh] grid-cols-1 md:grid-cols-[340px_1fr]">
        <aside className="border-r-2 border-black bg-[#d9d9d9] p-4 flex flex-col justify-between h-full min-h-[72vh]">
          <div className="max-h-[50vh] space-y-3 overflow-auto pr-1 flex-1">
            {list.map((participant) => (
              <ParticipantRow key={participant.id} participant={participant} />
            ))}
          </div>
          <div className="mt-4 rounded-md bg-[#747272] p-3 flex flex-col gap-2 text-center text-sm text-white">
            <PixelButton
              tone="neutral"
              variant="outline"
              size="sm"
              onClick={onLeave}
            >
              Leave Session
            </PixelButton>
          </div>
        </aside>

        <section className="flex flex-col items-center justify-center gap-4 px-4 py-8">
          <div className="w-full max-w-md rounded-full border-2 border-black bg-[#d9d9d9] px-4 py-1 text-center text-sm text-black">
            {playersRemaining} players remaining!
          </div>

          <PixelCard tone="neutral" className="w-full max-w-md border-2 border-black bg-[#d9d9d9]">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {activeSequence.slice(0, 5).map((step, i) => (
                  <span
                    key={`active-${i}`}
                    className={[
                      'flex h-12 w-12 items-center justify-center border-2 text-2xl',
                      i === (localParticipant?.progress ?? 0)
                        ? 'border-black bg-white text-black'
                        : 'border-black/20 bg-[#ececec] text-black/40',
                    ].join(' ')}
                  >
                    {ARROW[step]}
                  </span>
                ))}
              </div>

              <div className="h-2 w-40 rounded-full border border-black bg-[#9c9c9c]" />

              <p className="text-center text-xs text-black">
                Use the directional keys or W/A/S/D on your keyboard!
              </p>
            </div>
          </PixelCard>

          <div className="flex items-center gap-2 rounded-full border-2 border-black bg-[#d9d9d9] px-5 py-1 text-lg text-black font-mono">
            <PxlKitIcon icon={Clock} size={16} />
            {formatTime(timeLeftMs)}
          </div>

          <PixelButton
            tone="neutral"
            variant="ghost"
            iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
            onClick={onLeave}
          >
            Back to Solo Mode
          </PixelButton>

          <div className="flex items-center gap-2 text-sm text-black/70">
            <PxlKitIcon icon={SparkleSmall} size={14} />
            Syncing match state
          </div>
        </section>
      </div>
    </main>
  )
}
