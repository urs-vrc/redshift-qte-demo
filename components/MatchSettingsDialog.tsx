import { useState, useEffect } from 'react'
import {
  PixelModal,
  PixelSegmented,
  PixelButton,
  PixelAlert,
} from '@pxlkit/ui-kit'
import type { EngineMode, MultiplayerVariant } from '../lib/game-engine'

const MODE_OPTIONS = [
  { value: 'timer', label: 'TIMER' },
  { value: 'endless', label: 'ENDLESS' },
]

const WINDOW_OPTIONS = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
]

const LENGTH_OPTIONS = [
  { value: '4', label: '4-combo' },
  { value: '6', label: '6-combo' },
  { value: '8', label: '8-combo' },
]

// Maps the solo-mode `GameMode` selection onto the multiplayer variant. Endless
// solo mode is elimination-based in multiplayer; timer solo mode maps to the
// score variant (reaction is only reachable from the dedicated MP selector).
function modeToVariant(mode: EngineMode): MultiplayerVariant {
  return mode === 'endless' ? 'elimination' : 'score'
}

interface MatchSettingsDialogProps {
  open: boolean
  title: string
  description?: string
  /** Current lobby variant, used to preselect the mode segment. */
  initialVariant: MultiplayerVariant
  initialWindowSeconds: number
  initialSequenceLength: number
  /** When true, the dialog is read-only / shows a saving state. */
  disabled?: boolean
  /** Optional error message rendered below the controls. */
  error?: string | null
  /** Called when the user confirms the settings. */
  onConfirm: (
    variant: MultiplayerVariant,
    windowSeconds: number,
    sequenceLength: number,
  ) => void
  onClose: () => void
}

export default function MatchSettingsDialog({
  open,
  title,
  description,
  initialVariant,
  initialWindowSeconds,
  initialSequenceLength,
  disabled = false,
  error = null,
  onConfirm,
  onClose,
}: MatchSettingsDialogProps) {
  // Seed local state from the lobby's current settings each time the dialog opens.
  const [mode, setMode] = useState<EngineMode>(
    initialVariant === 'elimination' ? 'endless' : 'timer',
  )
  const [windowSeconds, setWindowSeconds] = useState(String(initialWindowSeconds))
  const [sequenceLength, setSequenceLength] = useState(String(initialSequenceLength))

  useEffect(() => {
    if (open) {
      setMode(initialVariant === 'elimination' ? 'endless' : 'timer')
      setWindowSeconds(String(initialWindowSeconds))
      setSequenceLength(String(initialSequenceLength))
    }
  }, [open, initialVariant, initialWindowSeconds, initialSequenceLength])

  const isEndless = mode === 'endless'

  return (
    <PixelModal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <PixelButton
            tone="neutral"
            variant="solid"
            disabled={disabled}
            onClick={onClose}
          >
            Cancel
          </PixelButton>
          <PixelButton
            tone="green"
            disabled={disabled}
            onClick={() =>
              onConfirm(
                modeToVariant(mode),
                Number(windowSeconds),
                Number(sequenceLength),
              )
            }
          >
            {disabled ? 'Saving…' : 'Save'}
          </PixelButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PixelSegmented
          label="Mode"
          value={mode}
          options={MODE_OPTIONS}
          onChange={(v) => setMode(v as EngineMode)}
          disabled={disabled}
        />
        {isEndless ? (
          <p className="text-xs text-retro-muted">
            Endless mode is elimination-based: the clock decays and sequences grow
            as you score. Last runner standing wins.
          </p>
        ) : (
          <>
            <PixelSegmented
              label="Window"
              value={windowSeconds}
              options={WINDOW_OPTIONS}
              onChange={setWindowSeconds}
              disabled={disabled}
            />
            <PixelSegmented
              label="Combo length"
              value={sequenceLength}
              options={LENGTH_OPTIONS}
              onChange={setSequenceLength}
              disabled={disabled}
            />
          </>
        )}
        {error && <PixelAlert tone="red" label="Error" message={error} />}
      </div>
    </PixelModal>
  )
}
