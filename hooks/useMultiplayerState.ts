import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Lobby,
  MultiplayerParticipant,
  MultiplayerVariant,
} from '../lib/game-engine'
import { isMultiplayerEnabled, supabase } from '../lib/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface UseMultiplayerState {
  enabled: boolean
  lobby: Lobby | null
  /** True when the current user is the host of the active lobby. */
  isHost: boolean
  /** Id of the local participant within the active lobby, if joined. */
  localParticipantId: string | null
  createLobby: (
    variant: MultiplayerVariant,
    name: string,
    windowSeconds?: number,
    sequenceLength?: number,
  ) => Promise<void>
  joinLobby: (code: string, name: string) => Promise<void>
  leaveLobby: () => void
  startGame: () => void
  /** Host-only: change the lobby's game mode. */
  updateVariant: (variant: MultiplayerVariant) => Promise<void>
  /** Host-only: change the lobby's match settings (window + combo length). */
  updateSettings: (windowSeconds: number, sequenceLength: number) => Promise<void>
  /** Host-only: persist final standings and broadcast gameover. */
  submitResults: () => Promise<void>
  /** Broadcast the local participant's latest state to the lobby via presence. */
  trackLocal: (participant: MultiplayerParticipant, immediate?: boolean) => void
  /** Toggle the local participant's ready status in the lobby. */
  readyUp: () => void
  /** End the current round: host persists standings + broadcasts gameover. */
  endRound: () => Promise<void>
  /** Return the lobby to the pre-game 'idle' phase so players can re-ready and
   *  start another round without leaving. Host-only in real mode (broadcasts
   *  via changeMode); local state flip in mock mode. */
  returnToLobby: () => void
}

function emptyLobby(
  code: string,
  hostName: string,
  variant: MultiplayerVariant,
  hostId: string,
  windowSeconds = 5,
  sequenceLength = 4,
): Lobby {
  return {
    id: `lobby_${code}`,
    code,
    hostId,
    variant,
    windowSeconds,
    sequenceLength,
    phase: 'idle',
    startedAt: null,
    participants: [
      {
        id: hostId,
        name: hostName,
        score: 0,
        alive: true,
        ready: false,
        finished: false,
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
  const lobbyIdRef = useRef<string | null>(null)
  const localParticipantRef = useRef<MultiplayerParticipant | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTrackTimeRef = useRef<number>(0)

  const teardown = useCallback(() => {
    if (channelRef.current) {
      void supabase?.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current)
      throttleTimeoutRef.current = null
    }
    lastTrackTimeRef.current = 0
  }, [])

  // Upsert the local participant into the `lobby_participants` roster with a
  // fresh heartbeat. The server prunes rows whose `updated_at` is stale (>30s)
  // and uses the roster to drive auto-cleanup + host migration (migration 0006).
  const upsertRoster = useCallback(() => {
    const participant = localParticipantRef.current
    const lobbyId = lobbyIdRef.current
    if (!isMultiplayerEnabled || !supabase || !participant || !lobbyId) return
    void supabase.from('lobby_participants').upsert(
      {
        lobby_id: lobbyId,
        participant_id: participant.id,
        name: participant.name,
        score: participant.score,
        alive: participant.alive,
        progress: participant.progress,
        sequence: participant.sequence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lobby_id,participant_id' },
    )
  }, [])

  // Keep the roster heartbeat alive while connected so the server knows this
  // client is still present. Runs every 15s, well under the 30s staleness window.
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    upsertRoster()
    heartbeatRef.current = setInterval(upsertRoster, 15_000)
  }, [upsertRoster])

  // Trigger immediate server-side reconciliation when the host is detected as
  // gone. Any current participant may call this; the server re-derives the host
  // from the roster and cleans up empty lobbies (see migrateHost edge function).
  const triggerHostMigration = useCallback(() => {
    const code = lobby?.code
    const participantId = localParticipantId
    if (!isMultiplayerEnabled || !supabase || !code || !participantId) return
    void supabase.functions.invoke('migrateHost', {
      body: { code, participantId },
    })
  }, [lobby?.code, localParticipantId])

  const applyLobbyRow = useCallback(
    (
      row: {
        code: string
        host_id: string
        variant: MultiplayerVariant
        window_seconds?: number | null
        sequence_length?: number | null
        phase: Lobby['phase']
        started_at?: string | null
      },
    ) => {
      setLobby((prev) =>
        prev
          ? {
              ...prev,
              variant: row.variant,
              windowSeconds: row.window_seconds ?? prev.windowSeconds,
              sequenceLength: row.sequence_length ?? prev.sequenceLength,
              phase: row.phase,
              hostId: row.host_id,
              startedAt: row.started_at ? Date.parse(row.started_at) : prev.startedAt,
            }
          : prev,
      )
      // Host migration: the server may have reassigned host_id (migration 0006).
      // Keep local `isHost` in sync with the authoritative lobby host.
      if (localParticipantId) {
        setIsHost(row.host_id === localParticipantId)
      }
    },
    [localParticipantId],
  )

  const createLobby = useCallback(
    async (
      variant: MultiplayerVariant,
      name: string,
      windowSeconds = 5,
      sequenceLength = 4,
    ) => {
      const code = Math.random().toString(36).slice(2, 7).toUpperCase()
      const hostId = `host_${code}`
      hostIdRef.current = hostId
      const hostParticipant: MultiplayerParticipant = {
        id: hostId,
        name,
        score: 0,
        alive: true,
        ready: false,
        finished: false,
        sequence: null,
        progress: 0,
      }
      localParticipantRef.current = hostParticipant
      const newLobby = emptyLobby(code, name, variant, hostId, windowSeconds, sequenceLength)
      if (!isMultiplayerEnabled || !supabase) {
        setIsHost(true)
        setLocalParticipantId(hostId)
        setLobby(newLobby)
        return
      }
      // Create the lobby through the Edge Function (service_role) so the code
      // is collision-free and anon clients can't write directly to `lobbies`.
      const { data, error: fnError } = await supabase.functions.invoke('createLobby', {
        body: { hostId, hostName: name, variant, windowSeconds, sequenceLength },
      })
      if (fnError || !data?.ok) {
        console.error('Failed to create lobby', fnError ?? data)
        throw new Error('Could not create lobby. Please try again.')
      }
      const realCode: string = data.code ?? code
      const realId: string | undefined = data.id
      newLobby.code = realCode
      const channel = supabase.channel(`lobby:${realCode}`)
      channelRef.current = channel
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<MultiplayerParticipant>()
        const participants = Object.values(state).flat()
        setLobby((prev) =>
          prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
        )
        // Host migration: if the authoritative host is no longer present in
        // presence, ask the server to reassign the host from the roster.
        if (lobby && lobby.hostId && !participants.some((p) => p.id === lobby.hostId)) {
          triggerHostMigration()
        }
      })
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${code}` },
        (payload: RealtimePostgresChangesPayload<{ code: string; host_id: string; variant: MultiplayerVariant; window_seconds?: number | null; sequence_length?: number | null; phase: Lobby['phase']; started_at?: string | null }>) => {
          if (payload.new) applyLobbyRow(payload.new as any)
        },
      )
      await channel.subscribe()
      // The host must also track presence so the server roster includes it and
      // other clients can see it (previously only guests tracked).
      void channel.track(hostParticipant)
      if (realId) lobbyIdRef.current = realId
      startHeartbeat()
      setIsHost(true)
      setLocalParticipantId(hostId)
      setLobby(newLobby)
    },
    [applyLobbyRow, triggerHostMigration, startHeartbeat],
  )

  const joinLobby = useCallback(
    async (code: string, name: string) => {
      const normalized = code.toUpperCase()
      const participant: MultiplayerParticipant = {
        id: `guest_${normalized}_${name}`,
        name,
        score: 0,
        alive: true,
        ready: false,
        finished: false,
        sequence: null,
        progress: 0,
      }
      localParticipantRef.current = participant
      if (!isMultiplayerEnabled || !supabase) {
        const newLobby = emptyLobby(normalized, name, 'score', `host_${normalized}`)
        newLobby.participants = [participant]
        setIsHost(false)
        setLocalParticipantId(participant.id)
        setLobby(newLobby)
        return
      }
      // Invite-only: the lobby must exist (created and shared) before joining.
      const { data: existing, error: lookupError } = await supabase
        .from('lobbies')
        .select('id, code, host_id, variant, window_seconds, sequence_length, phase')
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
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<MultiplayerParticipant>()
        const participants = Object.values(state).flat()
        setLobby((prev) =>
          prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
        )
        // Host migration: if the authoritative host is no longer present in
        // presence, ask the server to reassign the host from the roster.
        if (lobby && lobby.hostId && !participants.some((p) => p.id === lobby.hostId)) {
          triggerHostMigration()
        }
      })
      channel.on('presence', { event: 'join' }, () => {
        void channel.track(participant)
      })
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${normalized}` },
        (payload: RealtimePostgresChangesPayload<{ code: string; host_id: string; variant: MultiplayerVariant; window_seconds?: number | null; sequence_length?: number | null; phase: Lobby['phase']; started_at?: string | null }>) => {
          if (payload.new) applyLobbyRow(payload.new as any)
        },
      )
      await channel.subscribe()
      void channel.track(participant)
      lobbyIdRef.current = existing.id
      startHeartbeat()
      setIsHost(false)
      setLocalParticipantId(participant.id)
      setLobby((prev) =>
        prev
          ? { ...prev, participants: [...prev.participants, participant] }
          : emptyLobby(
              normalized,
              name,
              existing.variant,
              existing.host_id,
              existing.window_seconds ?? 5,
              existing.sequence_length ?? 4,
            ),
      )
    },
    [applyLobbyRow, triggerHostMigration, startHeartbeat],
  )

  const submitResults = useCallback(async () => {
    if (!lobby) return
    // Mock mode has no server to broadcast the gameover phase, so the local
    // client flips its own lobby phase directly. There is no Realtime/presence
    // in mock mode, so the local player is the only participant and should
    // transition to results regardless of host status. Real mode persists
    // standings and broadcasts via the Edge Function (Realtime drives it).
    if (!isMultiplayerEnabled || !supabase) {
      setLobby((prev) => (prev ? { ...prev, phase: 'gameover' } : prev))
      return
    }
    if (!isHost) return
    // Persist final standings so the results screen can read them after
    // presence participants disconnect.
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
    // Timer-like variants: the host broadcasts gameover so every client ends
    // together. Elimination mode ends per-client (eliminated / last standing),
    // so the host must NOT broadcast — that would cut other players' rounds short.
    if (lobby.variant !== 'elimination') {
      await supabase.functions.invoke('changeMode', {
        body: { code: lobby.code, hostId: hostIdRef.current, phase: 'gameover' },
      })
    }
  }, [lobby, isHost])

  const returnToLobby = useCallback(() => {
    if (!lobby) return
    if (!isMultiplayerEnabled || !supabase) {
      // Mock mode (no backend): flip local phase directly.
      setLobby((prev) => (prev ? { ...prev, phase: 'idle' } : prev))
      return
    }
    if (!isHost) return
    // Host broadcasts the return-to-lobby so every client leaves the results
    // screen and returns to the lobby together.
    void supabase.functions.invoke('changeMode', {
      body: { code: lobby.code, hostId: hostIdRef.current, phase: 'idle' },
    })
  }, [lobby, isHost, isMultiplayerEnabled, supabase])

  const leaveLobby = useCallback(() => {
    // Host persists results + broadcasts gameover before tearing down.
    if (isHost && lobby && isMultiplayerEnabled && supabase) {
      void submitResults()
    }
    // Remove our roster row so the server prunes us immediately (rather than
    // waiting for the 30s heartbeat staleness window). If we were the host,
    // trigger reconciliation so a new host is chosen from the remaining roster.
    const lobbyId = lobbyIdRef.current
    const participantId = localParticipantId
    if (isMultiplayerEnabled && supabase && lobbyId && participantId) {
      void supabase
        .from('lobby_participants')
        .delete()
        .eq('lobby_id', lobbyId)
        .eq('participant_id', participantId)
      if (isHost) {
        void supabase.functions.invoke('migrateHost', {
          body: { code: lobby?.code, participantId },
        })
      }
    }
    teardown()
    setIsHost(false)
    hostIdRef.current = null
    lobbyIdRef.current = null
    localParticipantRef.current = null
    setLobby(null)
  }, [teardown, submitResults, isHost, lobby, localParticipantId, isMultiplayerEnabled, supabase])

  const startGame = useCallback(() => {
    setLobby((prev) =>
      prev ? { ...prev, phase: 'prestart', startedAt: null } : prev,
    )
    // Broadcast the phase change so non-host clients transition too.
    if (isMultiplayerEnabled && supabase && lobby) {
      void supabase.functions.invoke('changeMode', {
        body: { code: lobby.code, hostId: hostIdRef.current, phase: 'prestart' },
      })
    }
    setTimeout(() => {
      // Anchor everyone to a single shared start instant so each client's local
      // countdown stays synchronized regardless of broadcast latency.
      const startedAt = Date.now()
      setLobby((prev) =>
        prev && prev.phase === 'prestart'
          ? { ...prev, phase: 'playing', startedAt }
          : prev,
      )
      if (isMultiplayerEnabled && supabase && lobby) {
        void supabase.functions.invoke('changeMode', {
          body: {
            code: lobby.code,
            hostId: hostIdRef.current,
            phase: 'playing',
            startedAt: new Date(startedAt).toISOString(),
          },
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

  const updateSettings = useCallback(
    async (windowSeconds: number, sequenceLength: number) => {
      if (!lobby) return
      if (!isMultiplayerEnabled || !supabase) {
        setLobby((prev) =>
          prev ? { ...prev, windowSeconds, sequenceLength } : prev,
        )
        return
      }
      // Route through the Edge Function so host authorization is enforced and
      // anon clients (SELECT-only on `lobbies`) can't change settings directly.
      const { error: fnError } = await supabase.functions.invoke('changeMode', {
        body: { code: lobby.code, hostId: hostIdRef.current, windowSeconds, sequenceLength },
      })
      if (fnError) {
        console.error('Failed to change match settings', fnError)
        throw new Error('Could not change match settings. Please try again.')
      }
      // Optimistic update; Realtime will confirm.
      setLobby((prev) => (prev ? { ...prev, windowSeconds, sequenceLength } : prev))
    },
    [lobby],
  )

  useEffect(() => teardown, [teardown])

  const trackLocal = useCallback(
    (participant: MultiplayerParticipant, immediate = false) => {
      // Keep the latest participant state so the heartbeat upsert stays current.
      localParticipantRef.current = participant
      if (isMultiplayerEnabled && supabase && channelRef.current) {
        if (immediate) {
          if (throttleTimeoutRef.current) {
            clearTimeout(throttleTimeoutRef.current)
            throttleTimeoutRef.current = null
          }
          void channelRef.current.track(participant)
          lastTrackTimeRef.current = Date.now()
        } else {
          const now = Date.now()
          const timeSinceLastTrack = now - lastTrackTimeRef.current
          if (timeSinceLastTrack >= 250) {
            if (throttleTimeoutRef.current) {
              clearTimeout(throttleTimeoutRef.current)
              throttleTimeoutRef.current = null
            }
            void channelRef.current.track(participant)
            lastTrackTimeRef.current = now
          } else if (!throttleTimeoutRef.current) {
            const remaining = 250 - timeSinceLastTrack
            throttleTimeoutRef.current = setTimeout(() => {
              throttleTimeoutRef.current = null
              if (isMultiplayerEnabled && supabase && channelRef.current && localParticipantRef.current) {
                void channelRef.current.track(localParticipantRef.current)
                lastTrackTimeRef.current = Date.now()
              }
            }, remaining)
          }
        }
      } else {
        // Mock mode (no backend): sync into lobby state so effects that monitor
        // participants (e.g. all-finished detection, ready status) work locally.
        setLobby((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            participants: prev.participants.map((p) =>
              p.id === participant.id ? participant : p,
            ),
          }
        })
      }
    },
    [isMultiplayerEnabled, supabase],
  )

  const readyUp = useCallback(() => {
    const participant = localParticipantRef.current
    if (!participant) return
    const updated = { ...participant, ready: !participant.ready }
    trackLocal(updated, true)
  }, [trackLocal])

  // End the round. Only the host persists standings and broadcasts gameover;
  // non-hosts simply stop (they'll receive the gameover phase via Realtime).
  const endRound = useCallback(async () => {
    if (!lobby) return
    if (lobby.variant === 'elimination') {
      // Elimination mode ends per-client: the local player is eliminated or is
      // the last one standing. Flip the local phase directly rather than relying
      // on a host broadcast (which would cut other players' rounds short). The
      // host still persists standings for the results screen.
      setLobby((prev) => (prev ? { ...prev, phase: 'gameover' } : prev))
      if (isHost && isMultiplayerEnabled && supabase) {
        await submitResults()
      }
      return
    }
    if (isHost) {
      await submitResults()
    }
  }, [lobby, isHost, submitResults, isMultiplayerEnabled, supabase])

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
    updateSettings,
    submitResults,
    trackLocal,
    readyUp,
    endRound,
    returnToLobby,
  }
}
