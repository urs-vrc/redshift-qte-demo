import { PixelAvatar } from '@pxlkit/ui-kit'
import type { MultiplayerParticipant as Participant } from '../../lib/game-engine'

interface MultiplayerParticipantBadgeProps {
  participant: Participant
}

export default function MultiplayerParticipantBadge({
  participant,
}: MultiplayerParticipantBadgeProps) {
  return (
    <PixelAvatar
      name={participant.name}
      size="md"
      tone={participant.alive ? 'green' : 'neutral'}
    />
  )
}
