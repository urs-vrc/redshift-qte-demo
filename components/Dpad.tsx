import type { ReactElement } from 'react'
import type { QteDirection } from '../lib/types'
import { useIsTouchDevice } from '../hooks/useIsTouchDevice'
import {
  PixelArrowUp,
  PixelArrowDown,
  PixelArrowLeft,
  PixelArrowRight,
} from './PixelArrows'

interface DpadProps {
  /** Called with the tapped direction. Same callback the keyboard handler uses. */
  onInput: (direction: QteDirection) => void
  disabled?: boolean
}

const BUTTONS: Array<{
  direction: QteDirection
  icon: ReactElement
  area: string
  label: string
}> = [
  { direction: 'up', icon: <PixelArrowUp />, area: '1 / 2', label: 'Up' },
  { direction: 'left', icon: <PixelArrowLeft />, area: '2 / 1', label: 'Left' },
  { direction: 'right', icon: <PixelArrowRight />, area: '2 / 3', label: 'Right' },
  { direction: 'down', icon: <PixelArrowDown />, area: '3 / 2', label: 'Down' },
]

/**
 * On-screen directional pad for touch devices. Renders nothing on devices with a fine
 * pointer (mouse/keyboard). Fires on pointer-down so taps register instantly without the
 * 300ms click delay, and blocks scrolling/zoom gestures via touch-action + preventDefault.
 */
export default function Dpad({ onInput, disabled = false }: DpadProps) {
  const isTouch = useIsTouchDevice()
  if (!isTouch) return null

  return (
    <div
      role="group"
      aria-label="Directional pad"
      className="grid select-none grid-cols-3 grid-rows-3 gap-1 w-[204px] [min-resolution:2dppx]:w-[240px]"
      style={{ touchAction: 'none' }}
    >
      {BUTTONS.map(({ direction, icon, area, label }) => (
        <button
          key={direction}
          type="button"
          aria-label={label}
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault()
            if (!disabled) onInput(direction)
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-retro-border bg-retro-surface font-pixel text-3xl text-retro-text transition-transform active:scale-95 active:bg-retro-bg disabled:opacity-40 [min-resolution:2dppx]:h-[72px] [min-resolution:2dppx]:w-[72px] [min-resolution:2dppx]:text-4xl"
          style={{ gridArea: area }}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
