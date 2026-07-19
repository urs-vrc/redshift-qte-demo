import { PixelAvatar, PixelBadge } from '@pxlkit/ui-kit'
import type { MultiplayerParticipant as Participant } from '../../lib/game-engine'

interface MultiplayerParticipantProps {
  participant: Participant
  isHost?: boolean
}

export default function MultiplayerParticipant({
  participant,
  isHost = false,
}: MultiplayerParticipantProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-retro-surface/40 px-3 py-2">
      <span className="flex items-center gap-2 text-retro-text">
        <PixelAvatar name={participant.name} size="sm" tone={participant.alive ? 'green' : 'neutral'} />
        {participant.name}
        {isHost && <PixelBadge tone="gold">host</PixelBadge>}
        {!participant.alive && <PixelBadge tone="red">out</PixelBadge>}
      </span>
      <span className="font-mono text-retro-green">{participant.score}</span>
    </div>
  )
}
