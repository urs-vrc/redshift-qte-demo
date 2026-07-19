import { useEffect, useState } from 'react'
import { isMultiplayerEnabled, supabase } from '../lib/supabase'
import type { MultiplayerParticipant } from '../lib/types'

/**
 * Reads the server-side leaderboard for a finished lobby. The standings are
 * persisted by the `submitStateToLeaderboard` Edge Function when the host ends
 * the round, so they survive after presence participants disconnect. Falls back
 * to the provided participants when no backend is configured (mock mode).
 */
export function useLeaderboard(
  code: string | undefined,
  fallback: MultiplayerParticipant[],
): { rows: MultiplayerParticipant[]; loading: boolean } {
  const [rows, setRows] = useState<MultiplayerParticipant[]>(fallback)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!code) {
      setRows(fallback)
      return
    }
    if (!isMultiplayerEnabled || !supabase) {
      setRows(fallback)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('leaderboard')
      .select('participant_id, name, score, alive, variant')
      .eq('lobby_code', code)
      .then(({ data, error }) => {
        if (cancelled) return
        setLoading(false)
        if (error) {
          console.error('Failed to load leaderboard', error)
          setRows(fallback)
          return
        }
        if (data && data.length > 0) {
          setRows(
            data.map((r: any) => ({
              id: r.participant_id,
              name: r.name,
              score: r.score,
              alive: r.alive,
              ready: false,
              finished: true,
              sequence: null,
              progress: 0,
            })),
          )
        } else {
          setRows(fallback)
        }
      })
    return () => {
      cancelled = true
    }
  }, [code, fallback])

  return { rows, loading }
}
