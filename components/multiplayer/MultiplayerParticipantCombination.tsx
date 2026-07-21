import type { QteDirection } from '../../lib/game-engine'
import { PixelArrowUp, PixelArrowDown, PixelArrowLeft, PixelArrowRight } from '../PixelArrows'

const ARROW = {
  up: <PixelArrowUp />,
  down: <PixelArrowDown />,
  left: <PixelArrowLeft />,
  right: <PixelArrowRight />,
}

interface MultiplayerParticipantCombinationProps {
  steps: QteDirection[]
  progress: number
}

export default function MultiplayerParticipantCombination({
  steps,
  progress,
}: MultiplayerParticipantCombinationProps) {
  return (
    <div className="flex gap-1">
      {steps.map((step, i) => (
        <span
          key={i}
          className={[
            'flex h-8 w-8 items-center justify-center rounded-md text-lg font-mono',
            i < progress
              ? 'bg-retro-green/30 text-retro-green'
              : 'bg-retro-surface/40 text-retro-muted',
          ].join(' ')}
        >
          {ARROW[step]}
        </span>
      ))}
    </div>
  )
}
