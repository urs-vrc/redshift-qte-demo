import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Lobby,
  MultiplayerParticipant,
  MultiplayerVariant,
} from '../lib/types'
import { generateSequence } from '../lib/qte'
import { isMultiplayerEnabled, supabase } from '../lib/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseMultiplayerState {
  enabled: boolean
  lobby: Lobby | null
  /** True when the current user is the host of the active lobby. */
  isHost: boolean
  /** Id of the local participant within the active lobby, if joined. */
  localParticipantId: string | null
  createLobby: (variant: MultiplayerVariant, name: string) => Promise<void>
  joinLobby: (code: string, name: string) => Promise<void>
  leaveLobby: () => void
  startGame: () => void
  /** Host-only: change the lobby's game mode. */
  updateVariant: (variant: MultiplayerVariant) => Promise<void>
  /** Host-only: persist final standings and broadcast gameover. */
  submitResults: () => Promise<void>
  /** Broadcast the local participant's latest state to the lobby via presence. */
  trackLocal: (participant: MultiplayerParticipant) => void
}

function emptyLobby(code: string, hostName: string, variant: MultiplayerVariant, hostId: string): Lobby {
  return {
    id: `lobby_${code}`,
    code,
    hostId,
    variant,
    phase: 'idle',
    participants: [
      {
        id: hostId,
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
  const [isHost, setIsHost] = useState(false)
  const [localParticipantId, setLocalParticipantId] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const hostIdRef = useRef<string | null>(null)

  const teardown = useCallback(() => {
    if (channelRef.current) {
      void supabase?.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const applyLobbyRow = useCallback(
    (row: { code: string; host_id: string; variant: MultiplayerVariant; phase: Lobby['phase'] }) => {
      setLobby((prev) =>
        prev
          ? { ...prev, variant: row.variant, phase: row.phase, hostId: row.host_id }
          : prev,
      )
    },
    [],
  )

  const createLobby = useCallback(
    async (variant: MultiplayerVariant, name: string) => {
      const code = Math.random().toString(36).slice(2, 7).toUpperCase()
      const hostId = `host_${code}`
      hostIdRef.current = hostId
      const newLobby = emptyLobby(code, name, variant, hostId)
      if (!isMultiplayerEnabled || !supabase) {
        setIsHost(true)
        setLobby(newLobby)
        return
      }
      // Create the lobby through the Edge Function (service_role) so the code
      // is collision-free and anon clients can't write directly to `lobbies`.
      const { data, error: fnError } = await supabase.functions.invoke('createLobby', {
        body: { hostId, hostName: name, variant },
      })
      if (fnError || !data?.ok) {
        console.error('Failed to create lobby', fnError ?? data)
        throw new Error('Could not create lobby. Please try again.')
      }
      const realCode: string = data.code ?? code
      newLobby.code = realCode
      const channel = supabase.channel(`lobby:${realCode}`)
      channelRef.current = channel
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<MultiplayerParticipant>()
        const participants = Object.values(state).flat()
        setLobby((prev) =>
          prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
        )
      })
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${code}` },
        (payload: RealtimePostgresChangesPayload<{ code: string; host_id: string; variant: MultiplayerVariant; phase: Lobby['phase'] }>) => {
          if (payload.new) applyLobbyRow(payload.new as any)
        },
      )
      await channel.subscribe()
      setIsHost(true)
      setLocalParticipantId(hostId)
      setLobby(newLobby)
    },
    [applyLobbyRow],
  )

  const joinLobby = useCallback(
    async (code: string, name: string) => {
      const normalized = code.toUpperCase()
      if (!isMultiplayerEnabled || !supabase) {
        // Mock mode has no server to verify against, so allow local testing.
        const participant: MultiplayerParticipant = {
          id: `guest_${normalized}_${name}`,
          name,
          score: 0,
          alive: true,
          sequence: generateSequence(4),
          progress: 0,
        }
        const newLobby = emptyLobby(normalized, name, 'score', `host_${normalized}`)
        newLobby.participants = [participant]
        setIsHost(false)
        setLobby(newLobby)
        return
      }
      // Invite-only: the lobby must exist (created and shared) before joining.
      const { data: existing, error: lookupError } = await supabase
        .from('lobbies')
        .select('code, host_id, variant, phase')
        .eq('code', normalized)
        .maybeSingle()
      if (lookupError) {
        console.error('Failed to look up lobby', lookupError)
        throw new Error('Could not verify lobby. Please try again.')
      }
      if (!existing) {
        throw new Error('Lobby not found. Ask the host to share their invite link.')
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
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${normalized}` },
        (payload: RealtimePostgresChangesPayload<{ code: string; host_id: string; variant: MultiplayerVariant; phase: Lobby['phase'] }>) => {
          if (payload.new) applyLobbyRow(payload.new as any)
        },
      )
      await channel.subscribe()
      void channel.track(participant)
      setIsHost(false)
      setLocalParticipantId(participant.id)
      setLobby((prev) =>
        prev
          ? { ...prev, participants: [...prev.participants, participant] }
          : emptyLobby(normalized, name, existing.variant, existing.host_id),
      )
    },
    [applyLobbyRow],
  )

  const submitResults = useCallback(async () => {
    if (!lobby || !isMultiplayerEnabled || !supabase) return
    if (!isHost) return
    // Persist final standings so the results screen can read them after
    // presence participants disconnect, then broadcast the gameover phase.
    const { error: fnError } = await supabase.functions.invoke('submitStateToLeaderboard', {
      body: {
        code: lobby.code,
        variant: lobby.variant,
        participants: lobby.participants.map((p) => ({
          participantId: p.id,
          name: p.name,
          score: p.score,
          alive: p.alive,
        })),
      },
    })
    if (fnError) {
      console.error('Failed to submit leaderboard', fnError)
    }
    await supabase.functions.invoke('changeMode', {
      body: { code: lobby.code, hostId: hostIdRef.current, phase: 'gameover' },
    })
  }, [lobby, isHost])

  const leaveLobby = useCallback(() => {
    // Host persists results + broadcasts gameover before tearing down.
    if (isHost && lobby && isMultiplayerEnabled && supabase) {
      void submitResults()
    }
    teardown()
    setIsHost(false)
    hostIdRef.current = null
    setLobby(null)
  }, [teardown, submitResults, isHost, lobby, isMultiplayerEnabled, supabase])

  const startGame = useCallback(() => {
    setLobby((prev) =>
      prev ? { ...prev, phase: 'prestart' } : prev,
    )
    // Broadcast the phase change so non-host clients transition too.
    if (isMultiplayerEnabled && supabase && lobby) {
      void supabase.functions.invoke('changeMode', {
        body: { code: lobby.code, hostId: hostIdRef.current, phase: 'prestart' },
      })
    }
    setTimeout(() => {
      setLobby((prev) =>
        prev && prev.phase === 'prestart' ? { ...prev, phase: 'playing' } : prev,
      )
      if (isMultiplayerEnabled && supabase && lobby) {
        void supabase.functions.invoke('changeMode', {
          body: { code: lobby.code, hostId: hostIdRef.current, phase: 'playing' },
        })
      }
    }, 9000)
  }, [lobby])

  const updateVariant = useCallback(
    async (variant: MultiplayerVariant) => {
      if (!lobby) return
      if (!isMultiplayerEnabled || !supabase) {
        setLobby((prev) => (prev ? { ...prev, variant } : prev))
        return
      }
      // Route through the Edge Function so host authorization is enforced and
      // anon clients (SELECT-only on `lobbies`) can't change the mode directly.
      const { error: fnError } = await supabase.functions.invoke('changeMode', {
        body: { code: lobby.code, hostId: hostIdRef.current, variant },
      })
      if (fnError) {
        console.error('Failed to change game mode', fnError)
        throw new Error('Could not change game mode. Please try again.')
      }
      // Optimistic update; Realtime will confirm.
      setLobby((prev) => (prev ? { ...prev, variant } : prev))
    },
    [lobby],
  )

  useEffect(() => teardown, [teardown])

  const trackLocal = useCallback(
    (participant: MultiplayerParticipant) => {
      if (isMultiplayerEnabled && supabase && channelRef.current) {
        void channelRef.current.track(participant)
      }
    },
    [isMultiplayerEnabled, supabase],
  )

  // Multiplayer is enabled only when a real Supabase backend is configured.
  // Set VITE_MOCK_MODE=true to force-enable the UI without a backend (mock data).
  const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true'

  return {
    enabled: isMockMode || isMultiplayerEnabled,
    lobby,
    isHost,
    localParticipantId,
    createLobby,
    joinLobby,
    leaveLobby,
    startGame,
    updateVariant,
    submitResults,
    trackLocal,
  }
}
