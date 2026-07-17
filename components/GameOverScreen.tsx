import { PixelCard, PixelButton, PixelBadge } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Play, Home } from '@pxlkit/ui'
import type { SingleplayerState } from '../lib/types'

interface GameOverScreenProps {
  state: SingleplayerState
  onRestart: () => void
  onHome: () => void
}

export default function GameOverScreen({ state, onRestart, onHome }: GameOverScreenProps) {
  return (
    <PixelCard tone="neutral" className="flex w-full max-w-md flex-col items-center gap-6">
      <h2 className="font-pixel text-3xl font-bold text-retro-text">Game Over</h2>
      <p className="font-pixel text-xl text-retro-text">
        Final score: <span className="font-mono text-retro-green">{state.score}</span>
      </p>
      {state.failed && (
        <PixelBadge tone="red">You entered a wrong sequence.</PixelBadge>
      )}
      <div className="flex gap-4">
        <PixelButton tone="green" iconLeft={<PxlKitIcon icon={Play} size={16} />} onClick={onRestart}>
          Play Again
        </PixelButton>
        <PixelButton tone="neutral" variant="outline" iconLeft={<PxlKitIcon icon={Home} size={16} />} onClick={onHome}>
          Main Menu
        </PixelButton>
      </div>
    </PixelCard>
  )
}
