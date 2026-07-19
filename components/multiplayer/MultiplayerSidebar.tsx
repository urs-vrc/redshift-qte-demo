import { PixelCard, PixelBadge } from '@pxlkit/ui-kit'
import type { Lobby } from '../../lib/game-engine'
import MultiplayerParticipant from './MultiplayerParticipant'

interface MultiplayerSidebarProps {
  lobby: Lobby
}

export default function MultiplayerSidebar({ lobby }: MultiplayerSidebarProps) {
  return (
    <PixelCard title="Lobby" tone="neutral" className="w-64">
      <div className="mb-2 flex items-center justify-between text-sm text-retro-muted">
        <span>Code</span>
        <PixelBadge tone="green" className="font-mono">
          {lobby.code}
        </PixelBadge>
      </div>
      <div className="flex flex-col gap-2">
        {lobby.participants.map((p) => (
          <MultiplayerParticipant
            key={p.id}
            participant={p}
            isHost={p.id === lobby.hostId}
          />
        ))}
      </div>
    </PixelCard>
  )
}
