import { PixelCard, PixelButton } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Play, Home } from '@pxlkit/ui'
import type { SingleplayerState } from '../lib/types'
import type { Telemetry } from '../lib/telemetry/telemetry'
import TelemetryStats from './TelemetryStats'
import TelemetryChart from './TelemetryChart'

interface GameOverScreenProps {
  state: SingleplayerState
  telemetry: Telemetry
  onRestart: () => void
  onHome: () => void
}

export default function GameOverScreen({ state, telemetry, onRestart, onHome }: GameOverScreenProps) {
  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <PixelCard tone="neutral" className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h2 className="font-pixel text-3xl font-bold text-retro-text">Game Over</h2>
        <p className="font-pixel text-xl text-retro-text">
          Final score: <span className="font-mono text-retro-green">{state.score}</span>
        </p>
        {state.mode === 'endless' && (
          <p className="font-pixel text-xl text-retro-text">
            Time survived: <span className="font-mono text-retro-green">{formatTime(state.elapsedMs)}</span>
          </p>
        )}
        <TelemetryStats telemetry={telemetry} title="Round Stats" />
        <div className="flex justify-center gap-4 pt-4">
          <PixelButton tone="green" iconLeft={<PxlKitIcon icon={Play} size={16} />} onClick={onRestart}>
            Play Again
          </PixelButton>
          <PixelButton tone="neutral" variant="outline" iconLeft={<PxlKitIcon icon={Home} size={16} />} onClick={onHome}>
            Main Menu
          </PixelButton>
        </div>
      </PixelCard>
      <TelemetryChart telemetry={telemetry} className="max-w-3xl" />
    </div>
  )
}
