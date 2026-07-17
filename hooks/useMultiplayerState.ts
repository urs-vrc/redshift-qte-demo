import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Lobby,
  MultiplayerParticipant,
  MultiplayerVariant,
} from '../lib/types'
import { generateSequence } from '../lib/qte'
import { isMultiplayerEnabled, supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface UseMultiplayerState {
  enabled: boolean
  lobby: Lobby | null
  createLobby: (variant: MultiplayerVariant, name: string) => Promise<void>
  joinLobby: (code: string, name: string) => Promise<void>
  leaveLobby: () => void
  startGame: () => void
}

function emptyLobby(code: string, hostName: string, variant: MultiplayerVariant): Lobby {
  return {
    id: `lobby_${code}`,
    code,
    hostId: `host_${code}`,
    variant,
    phase: 'idle',
    participants: [
      {
        id: `host_${code}`,
        name: hostName,
        score: 0,
        alive: true,
        sequence: null,
        progress: 0,
      },
    ],
  }
}

export function useMultiplayerState(): UseMultiplayerState {
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const teardown = useCallback(() => {
    if (channelRef.current) {
      void supabase?.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const createLobby = useCallback(
    async (variant: MultiplayerVariant, name: string) => {
      const code = Math.random().toString(36).slice(2, 7).toUpperCase()
      const newLobby = emptyLobby(code, name, variant)
      if (!isMultiplayerEnabled || !supabase) {
        setLobby(newLobby)
        return
      }
      const channel = supabase.channel(`lobby:${code}`)
      channelRef.current = channel
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<MultiplayerParticipant>()
        const participants = Object.values(state).flat()
        setLobby((prev) =>
          prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
        )
      })
      await channel.subscribe()
      setLobby(newLobby)
    },
    [],
  )

  const joinLobby = useCallback(
    async (code: string, name: string) => {
      const normalized = code.toUpperCase()
      if (!isMultiplayerEnabled || !supabase) {
        const participant: MultiplayerParticipant = {
          id: `guest_${normalized}_${name}`,
          name,
          score: 0,
          alive: true,
          sequence: generateSequence(4),
          progress: 0,
        }
        const newLobby = emptyLobby(normalized, name, 'score')
        newLobby.participants = [participant]
        setLobby(newLobby)
        return
      }
      const channel = supabase.channel(`lobby:${normalized}`)
      channelRef.current = channel
      const participant: MultiplayerParticipant = {
        id: `guest_${normalized}_${name}`,
        name,
        score: 0,
        alive: true,
        sequence: generateSequence(4),
        progress: 0,
      }
      channel.on('presence', { event: 'join' }, () => {
        void channel.track(participant)
      })
      await channel.subscribe()
      void channel.track(participant)
      setLobby((prev) =>
        prev
          ? { ...prev, participants: [...prev.participants, participant] }
          : emptyLobby(normalized, name, 'score'),
      )
    },
    [],
  )

  const leaveLobby = useCallback(() => {
    teardown()
    setLobby(null)
  }, [teardown])

  const startGame = useCallback(() => {
    setLobby((prev) =>
      prev ? { ...prev, phase: 'prestart' } : prev,
    )
    setTimeout(() => {
      setLobby((prev) =>
        prev && prev.phase === 'prestart' ? { ...prev, phase: 'playing' } : prev,
      )
    }, 9000)
  }, [])

  useEffect(() => teardown, [teardown])

  // Default mockup mode to true for local testing without Supabase, as requested.
  // Can be controlled via VITE_MOCK_MODE environment variable.
  const isMockMode = import.meta.env.VITE_MOCK_MODE !== 'false'

  return {
    enabled: isMockMode || isMultiplayerEnabled,
    lobby,
    createLobby,
    joinLobby,
    leaveLobby,
    startGame,
  }
}
