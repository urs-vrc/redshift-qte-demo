import { useState } from 'react'
import { PixelCard, PixelInput, PixelSelect, PixelButton, PixelAlert } from '@pxlkit/ui-kit'
import type { MultiplayerVariant } from '../lib/types'

import { Home as HomeIcon } from '@pxlkit/ui'
import { PxlKitIcon } from '@pxlkit/core'

interface PrestartLobbyProps {
  enabled: boolean
  onCreate: (variant: MultiplayerVariant, name: string) => void
  onJoin: (code: string, name: string) => void
  onBack: () => void
}

const VARIANT_OPTIONS = [
  { value: 'score', label: 'Timer (Score)' },
  { value: 'elimination', label: 'Endless (Elimination)' },
  { value: 'reaction', label: 'Timer (Reaction)' },
]

const VARIANT_HINT: Record<MultiplayerVariant, string> = {
  score: 'Timer mode rewards consistency under pressure.',
  elimination: 'Endless mode decreases the time between codes!',
  reaction: 'Reaction mode favors fast, precise inputs.',
}

export default function PrestartLobby({ enabled, onCreate, onJoin, onBack }: PrestartLobbyProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [variant, setVariant] = useState<MultiplayerVariant>('score')

  if (!enabled) {
    return (
      <div className="flex flex-col items-center gap-4">
        <PixelCard tone="red" className="max-w-md">
          <PixelAlert
            tone="red"
            label="Multiplayer unavailable"
            message="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable it."
          />
        </PixelCard>
        <PixelButton
          tone="neutral"
          variant="ghost"
          iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
          onClick={onBack}
        >
          Back to Solo Mode
        </PixelButton>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6 px-4 py-8">
      <h1 className="font-pixel text-center text-2xl text-retro-text md:text-3xl">
        Multiplayer Lobby
      </h1>

      <PixelCard tone="neutral" className="w-full max-w-xl">
        <div className="flex flex-col gap-6">
          <p className="text-center text-sm text-retro-muted">
            Configure your runner profile and join or host a multiplayer session.
          </p>

          <div className="flex flex-col gap-4">
            <PixelInput
              label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter runner name..."
            />

            <PixelSelect
              label="Game Variant"
              options={VARIANT_OPTIONS}
              value={variant}
              onChange={(v) => setVariant(v as MultiplayerVariant)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <PixelButton
              tone="green"
              className="flex-1"
              disabled={!name}
              onClick={() => onCreate(variant, name)}
            >
              Create Lobby
            </PixelButton>

            <div className="flex flex-1 gap-2">
              <PixelInput
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                maxLength={6}
                className="w-24 flex-none text-center font-mono"
              />
              <PixelButton
                tone="cyan"
                className="flex-1"
                disabled={!name || !code}
                onClick={() => onJoin(code, name)}
              >
                Join
              </PixelButton>
            </div>
          </div>

          <div className="border-t border-retro-border/40 pt-4 flex justify-center">
            <PixelButton
              tone="neutral"
              variant="ghost"
              iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
              onClick={onBack}
            >
              Back to Solo Mode
            </PixelButton>
          </div>
        </div>
      </PixelCard>

      <div className="w-full max-w-xl text-center text-xs text-retro-muted">
        {VARIANT_HINT[variant]}
      </div>
    </div>
  )
}
