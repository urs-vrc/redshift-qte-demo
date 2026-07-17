import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall } from '@pxlkit/ui'
import type { QteDirection, SingleplayerState } from '../lib/types'
import { endlessTimeLimit } from '../lib/qte'

const ARROW: Record<QteDirection, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

interface GameplayWindowProps {
  state: SingleplayerState
}

export default function GameplayWindow({ state }: GameplayWindowProps) {
  const { sequence, progress, gameTimeLeftMs, sequenceTimeLeftMs, mode, score } = state

  const seqLimit = mode === 'timer' ? 5000 : endlessTimeLimit(score)
  const seqPct = Math.max(0, Math.min(100, (sequenceTimeLeftMs / seqLimit) * 100))

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score badge */}
      <div className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-4 py-1.5 font-pixel text-xs text-retro-text">
        <PxlKitIcon icon={SparkleSmall} size={12} />
        Score: {score}
      </div>

      {/* Main gameplay card — matches Singleplayer.png */}
      <div className="w-full max-w-lg rounded-2xl border-2 border-retro-border bg-retro-surface p-6">
        <div className="flex flex-col items-center gap-4">
          {/* QTE Arrow Steps */}
          <div className="flex justify-center gap-2">
            {sequence?.steps.map((step, i) => (
              <span
                key={i}
                className={[
                  'flex h-14 w-14 items-center justify-center rounded-lg border-2 font-pixel text-2xl transition-colors',
                  i < progress
                    ? 'border-retro-border/40 bg-retro-bg/40 text-retro-muted/40'
                    : i === progress
                      ? 'border-retro-text bg-retro-bg text-retro-text'
                      : 'border-retro-border/30 bg-retro-bg/20 text-retro-muted/30',
                ].join(' ')}
              >
                {ARROW[step]}
              </span>
            ))}
          </div>

          {/* Sequence progress bar — thin bar matching mockup */}
          <div className="w-full max-w-xs">
            <div className="h-2 w-full overflow-hidden rounded-full border border-retro-border/40 bg-retro-bg/60">
              <div
                className="h-full rounded-full bg-retro-text transition-all duration-75"
                style={{ width: `${seqPct}%` }}
              />
            </div>
          </div>

          {/* Instruction text */}
          <p className="font-pixel text-center text-[10px] leading-relaxed text-retro-muted">
            Use the directional keys or W/A/S/D on your keyboard!
          </p>
        </div>
      </div>

      {/* Clock pill below card — matches Singleplayer.png */}
      <div className="flex items-center gap-2 rounded-full border-2 border-retro-border bg-retro-surface px-5 py-2 font-pixel text-sm text-retro-text">
        <PxlKitIcon icon={Clock} size={14} />
        {mode === 'timer'
          ? formatTime(gameTimeLeftMs)
          : formatTime(sequenceTimeLeftMs)}
      </div>
    </div>
  )
}
