import { PixelCard, PixelTable, PixelButton, PixelBadge } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Home } from '@pxlkit/ui'
import type { MultiplayerParticipant } from '../lib/types'
import type { Telemetry } from '../lib/telemetry'
import TelemetryStats from './TelemetryStats'
import TelemetryChart from './TelemetryChart'

interface ResultsLeaderboardProps {
  participants: MultiplayerParticipant[]
  onHome: () => void
  /** Local player's telemetry for the match; shown below the standings. */
  telemetry?: Telemetry | null
  /** When 'elimination', the Status (alive/eliminated) column is shown. For
   *  timer-score modes every player is alive so the column is redundant. */
  variant?: 'score' | 'elimination' | 'reaction'
}

export default function ResultsLeaderboard({ participants, onHome, telemetry, variant }: ResultsLeaderboardProps) {
  const ranked = [...participants]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  const isElimination = variant === 'elimination'

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <PixelCard title="Results" tone="neutral" className="w-full max-w-lg">
        <PixelTable
          data={ranked}
          columns={[
            { key: 'rank', header: '#', align: 'left' },
            { key: 'name', header: 'Runner' },
            ...(isElimination
              ? [
                  {
                    key: 'alive' as const,
                    header: 'Status' as const,
                    render: (row: MultiplayerParticipant & { rank: number }) =>
                      row.alive ? (
                        <PixelBadge tone="green">alive</PixelBadge>
                      ) : (
                        <PixelBadge tone="red">eliminated</PixelBadge>
                      ),
                  },
                ]
              : []),
            {
              key: 'score',
              header: 'Score',
              align: 'right',
              render: (row) => <span className="font-mono text-retro-green">{row.score}</span>,
            },
          ]}
        />
        <div className="mt-4 flex justify-end">
          <PixelButton
            tone="neutral"
            variant="outline"
            iconLeft={<PxlKitIcon icon={Home} size={16} />}
            onClick={onHome}
          >
            Main Menu
          </PixelButton>
        </div>
      </PixelCard>
      {telemetry && (
        <>
          <TelemetryStats telemetry={telemetry} title="Your Round Stats" className="w-full max-w-lg" />
          <TelemetryChart telemetry={telemetry} className="max-w-3xl" />
        </>
      )}
    </div>
  )
}
