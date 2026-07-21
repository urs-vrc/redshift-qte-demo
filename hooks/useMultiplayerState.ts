import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lobby, MultiplayerParticipant, MultiplayerVariant } from '../lib/game-engine'
import { isMultiplayerEnabled, supabase } from '../lib/supabase'

export interface MultiplayerBackend {
  createLobby(
    hostId: string,
    hostName: string,
    variant: MultiplayerVariant,
    windowSeconds: number,
    sequenceLength: number,
  ): Promise<{ code: string; id: string }>

  joinLobby(
    code: string,
    name: string,
    participantId: string,
  ): Promise<{
    id: string
    hostId: string
    variant: MultiplayerVariant
    windowSeconds: number
    sequenceLength: number
    phase: Lobby['phase']
    startedAt: number | null
  }>

  subscribe(
    code: string,
    participant: MultiplayerParticipant,
    onLobbyChange: (lobbyUpdate: Partial<Lobby>) => void,
    onPresenceChange: (participants: MultiplayerParticipant[]) => void,
  ): {
    unsubscribe: () => void
    track: (participant: MultiplayerParticipant) => void
  }

  changeMode(
    code: string,
    hostId: string,
    updates: {
      variant?: MultiplayerVariant
      phase?: Lobby['phase']
      windowSeconds?: number
      sequenceLength?: number
      startedAt?: number | null // epoch ms
    },
  ): Promise<void>

  submitResults(
    code: string,
    variant: MultiplayerVariant,
    participants: Array<{ id: string; name: string; score: number; alive: boolean }>,
  ): Promise<void>

  heartbeat(lobbyId: string, participant: MultiplayerParticipant): Promise<void>

  leaveLobby(lobbyId: string, participantId: string, isHost: boolean, code: string): Promise<void>
}

class SupabaseMultiplayerBackend implements MultiplayerBackend {
  async createLobby(
    hostId: string,
    hostName: string,
    variant: MultiplayerVariant,
    windowSeconds: number,
    sequenceLength: number,
  ) {
    const client = supabase
    if (!client) throw new Error('Supabase not configured')
    const { data, error } = await client.functions.invoke('createLobby', {
      body: { hostId, hostName, variant, windowSeconds, sequenceLength },
    })
    if (error || !data?.ok) {
      throw new Error(error?.message || 'Could not create lobby. Please try again.')
    }
    return {
      code: data.code,
      id: data.id,
    }
  }

  async joinLobby(code: string, _name: string, _participantId: string) {
    const client = supabase
    if (!client) throw new Error('Supabase not configured')
    const normalized = code.toUpperCase()
    const { data: existing, error } = await client
      .from('lobbies')
      .select('id, code, host_id, variant, window_seconds, sequence_length, phase, started_at')
      .eq('code', normalized)
      .maybeSingle()

    if (error) {
      throw new Error('Could not verify lobby. Please try again.')
    }
    if (!existing) {
      throw new Error('Lobby not found. Ask the host to share their invite link.')
    }

    return {
      id: existing.id,
      hostId: existing.host_id,
      variant: existing.variant as MultiplayerVariant,
      windowSeconds: existing.window_seconds ?? 5,
      sequenceLength: existing.sequence_length ?? 4,
      phase: existing.phase as Lobby['phase'],
      startedAt: existing.started_at ? Date.parse(existing.started_at) : null,
    }
  }

  subscribe(
    code: string,
    participant: MultiplayerParticipant,
    onLobbyChange: (lobbyUpdate: Partial<Lobby>) => void,
    onPresenceChange: (participants: MultiplayerParticipant[]) => void,
  ) {
    const client = supabase
    if (!client) throw new Error('Supabase not configured')
    const channel = client.channel(`lobby:${code.toUpperCase()}`)

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<MultiplayerParticipant>()
      const participants = Object.values(state).flat()
      onPresenceChange(participants)
    })

    channel.on('presence', { event: 'join' }, () => {
      void channel.track(participant)
    })

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${code.toUpperCase()}` },
      (payload: any) => {
        if (payload.new) {
          const row = payload.new
          const update: Partial<Lobby> = {}
          if (row.variant !== undefined) update.variant = row.variant
          if (row.window_seconds !== undefined && row.window_seconds !== null) {
            update.windowSeconds = row.window_seconds
          }
          if (row.sequence_length !== undefined && row.sequence_length !== null) {
            update.sequenceLength = row.sequence_length
          }
          if (row.phase !== undefined) update.phase = row.phase
          if (row.host_id !== undefined) update.hostId = row.host_id
          if (row.started_at !== undefined) {
            update.startedAt = row.started_at ? Date.parse(row.started_at) : null
          }
          onLobbyChange(update)
        }
      },
    )

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track(participant)
      }
    })

    return {
      unsubscribe: () => {
        void client.removeChannel(channel)
      },
      track: (p: MultiplayerParticipant) => {
        void channel.track(p)
      },
    }
  }

  async changeMode(
    code: string,
    hostId: string,
    updates: {
      variant?: MultiplayerVariant
      phase?: Lobby['phase']
      windowSeconds?: number
      sequenceLength?: number
      startedAt?: number | null
    },
  ) {
    const client = supabase
    if (!client) throw new Error('Supabase not configured')
    const body: any = {
      code,
      hostId,
      variant: updates.variant,
      phase: updates.phase,
      windowSeconds: updates.windowSeconds,
      sequenceLength: updates.sequenceLength,
    }
    if (updates.startedAt !== undefined) {
      body.startedAt = updates.startedAt ? new Date(updates.startedAt).toISOString() : null
    }

    const { error } = await client.functions.invoke('changeMode', {
      body,
    })
    if (error) {
      throw new Error(error.message || 'Could not change settings.')
    }
  }

  async submitResults(
    code: string,
    variant: MultiplayerVariant,
    participants: Array<{ id: string; name: string; score: number; alive: boolean }>,
  ) {
    const client = supabase
    if (!client) throw new Error('Supabase not configured')
    const { error } = await client.functions.invoke('submitStateToLeaderboard', {
      body: {
        code,
        variant,
        participants: participants.map((p) => ({
          participantId: p.id,
          name: p.name,
          score: p.score,
          alive: p.alive,
        })),
      },
    })
    if (error) {
      console.error('Failed to submit leaderboard', error)
    }
  }

  async heartbeat(lobbyId: string, participant: MultiplayerParticipant) {
    const client = supabase
    if (!client) return
    // Heartbeat only for liveness detection and host migration, keeping it minimal
    void client.from('lobby_participants').upsert(
      {
        lobby_id: lobbyId,
        participant_id: participant.id,
        name: participant.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lobby_id,participant_id' },
    )
  }

  async leaveLobby(lobbyId: string, participantId: string, _isHost: boolean, _code: string) {
    const client = supabase
    if (!client) return
    void client
      .from('lobby_participants')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('participant_id', participantId)
  }
}

class MockMultiplayerBackend implements MultiplayerBackend {
  private activeSubs = new Map<
    string,
    {
      participant: MultiplayerParticipant
      onLobbyChange: (lobbyUpdate: Partial<Lobby>) => void
      onPresenceChange: (participants: MultiplayerParticipant[]) => void
    }
  >()

  async createLobby(
    _hostId: string,
    _hostName: string,
    _variant: MultiplayerVariant,
    _windowSeconds: number,
    _sequenceLength: number,
  ) {
    return {
      code: Math.random().toString(36).slice(2, 7).toUpperCase(),
      id: `mock_lobby_id`,
    }
  }

  async joinLobby(code: string, _name: string, _participantId: string) {
    return {
      id: `mock_lobby_id`,
      hostId: `host_${code.toUpperCase()}`,
      variant: 'score' as MultiplayerVariant,
      windowSeconds: 5,
      sequenceLength: 4,
      phase: 'idle' as Lobby['phase'],
      startedAt: null,
    }
  }

  subscribe(
    code: string,
    participant: MultiplayerParticipant,
    onLobbyChange: (lobbyUpdate: Partial<Lobby>) => void,
    onPresenceChange: (participants: MultiplayerParticipant[]) => void,
  ) {
    const norm = code.toUpperCase()
    this.activeSubs.set(norm, { participant, onLobbyChange, onPresenceChange })

    // Instantly notify presence
    setTimeout(() => {
      onPresenceChange([participant])
    }, 0)

    return {
      unsubscribe: () => {
        this.activeSubs.delete(norm)
      },
      track: (p: MultiplayerParticipant) => {
        const sub = this.activeSubs.get(norm)
        if (sub) {
          sub.participant = p
          sub.onPresenceChange([p])
        }
      },
    }
  }

  async changeMode(
    code: string,
    _hostId: string,
    updates: {
      variant?: MultiplayerVariant
      phase?: Lobby['phase']
      windowSeconds?: number
      sequenceLength?: number
      startedAt?: number | null
    },
  ) {
    const sub = this.activeSubs.get(code.toUpperCase())
    if (sub) {
      const update: Partial<Lobby> = {}
      if (updates.variant !== undefined) update.variant = updates.variant
      if (updates.phase !== undefined) update.phase = updates.phase
      if (updates.windowSeconds !== undefined) update.windowSeconds = updates.windowSeconds
      if (updates.sequenceLength !== undefined) update.sequenceLength = updates.sequenceLength
      if (updates.startedAt !== undefined) update.startedAt = updates.startedAt
      sub.onLobbyChange(update)
    }
  }

  async submitResults(
    _code: string,
    _variant: MultiplayerVariant,
    _participants: Array<{ id: string; name: string; score: number; alive: boolean }>,
  ) {
    // No-op in mock
  }

  async heartbeat(_lobbyId: string, _participant: MultiplayerParticipant) {
    // No-op in mock
  }

  async leaveLobby(_lobbyId: string, _participantId: string, _isHost: boolean, _code: string) {
    // No-op in mock
  }
}

const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true' || !isMultiplayerEnabled
const backend: MultiplayerBackend = isMockMode
  ? new MockMultiplayerBackend()
  : new SupabaseMultiplayerBackend()

export interface UseMultiplayerState {
  enabled: boolean
  lobby: Lobby | null
  isHost: boolean
  localParticipantId: string | null
  prestartTimeLeftMs: number
  createLobby: (
    variant: MultiplayerVariant,
    name: string,
    windowSeconds?: number,
    sequenceLength?: number,
  ) => Promise<void>
  joinLobby: (code: string, name: string) => Promise<void>
  leaveLobby: () => void
  startGame: () => void
  updateVariant: (variant: MultiplayerVariant) => Promise<void>
  updateSettings: (windowSeconds: number, sequenceLength: number) => Promise<void>
  submitResults: () => Promise<void>
  trackLocal: (participant: MultiplayerParticipant, immediate?: boolean) => void
  readyUp: () => void
  endRound: () => Promise<void>
  returnToLobby: () => void
}

export function useMultiplayerState(): UseMultiplayerState {
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [localParticipantId, setLocalParticipantId] = useState<string | null>(null)
  const [prestartTimeLeftMs, setPrestartTimeLeftMs] = useState(0)

  const activeSubRef = useRef<{
    unsubscribe: () => void
    track: (participant: MultiplayerParticipant) => void
  } | null>(null)

  const localParticipantRef = useRef<MultiplayerParticipant | null>(null)

  // Derive isHost directly from current lobby and localParticipantId to avoid split brain
  const isHost = lobby !== null && lobby.hostId === localParticipantId

  // Clean up subscription and reset references
  const teardown = useCallback(() => {
    if (activeSubRef.current) {
      activeSubRef.current.unsubscribe()
      activeSubRef.current = null
    }
    localParticipantRef.current = null
  }, [])

  // Throttled / debounced local broadcaster (Trailing-edge throttle)
  const latestTrackStateRef = useRef<MultiplayerParticipant | null>(null)
  const lastTrackTimeRef = useRef<number>(0)
  const throttleTimeoutRef = useRef<any>(null)

  const trackLocal = useCallback(
    (participant: MultiplayerParticipant, immediate = false) => {
      latestTrackStateRef.current = participant
      localParticipantRef.current = participant

      const performTrack = () => {
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current)
          throttleTimeoutRef.current = null
        }
        if (activeSubRef.current && latestTrackStateRef.current) {
          activeSubRef.current.track(latestTrackStateRef.current)
        }
        lastTrackTimeRef.current = Date.now()
      }

      if (immediate) {
        performTrack()
      } else {
        const now = Date.now()
        const elapsed = now - lastTrackTimeRef.current
        const delay = 250 - elapsed

        if (delay <= 0) {
          performTrack()
        } else if (!throttleTimeoutRef.current) {
          throttleTimeoutRef.current = setTimeout(() => {
            throttleTimeoutRef.current = null
            if (latestTrackStateRef.current) {
              performTrack()
            }
          }, delay)
        }
      }
    },
    [],
  )

  const createLobby = useCallback(
    async (
      variant: MultiplayerVariant,
      name: string,
      windowSeconds = 5,
      sequenceLength = 4,
    ) => {
      teardown()
      const hostId = `host_${Math.random().toString(36).slice(2, 7).toUpperCase()}`
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

      const { code, id } = await backend.createLobby(
        hostId,
        name,
        variant,
        windowSeconds,
        sequenceLength,
      )

      setLocalParticipantId(hostId)

      const sub = backend.subscribe(
        code,
        hostParticipant,
        (lobbyUpdate) => {
          setLobby((prev) => (prev ? { ...prev, ...lobbyUpdate } : prev))
        },
        (participants) => {
          setLobby((prev) =>
            prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
          )
        },
      )
      activeSubRef.current = sub

      setLobby({
        id,
        code,
        hostId,
        variant,
        windowSeconds,
        sequenceLength,
        phase: 'idle',
        startedAt: null,
        participants: [hostParticipant],
      })
    },
    [teardown],
  )

  const joinLobby = useCallback(
    async (code: string, name: string) => {
      teardown()
      const normCode = code.toUpperCase()
      const participantId = `guest_${normCode}_${name.replace(/\s+/g, '_')}_${Math.random().toString(36).slice(2, 6)}`
      const participant: MultiplayerParticipant = {
        id: participantId,
        name,
        score: 0,
        alive: true,
        ready: false,
        finished: false,
        sequence: null,
        progress: 0,
      }
      localParticipantRef.current = participant

      const lobbyData = await backend.joinLobby(normCode, name, participantId)

      setLocalParticipantId(participantId)

      const sub = backend.subscribe(
        normCode,
        participant,
        (lobbyUpdate) => {
          setLobby((prev) => (prev ? { ...prev, ...lobbyUpdate } : prev))
        },
        (participants) => {
          setLobby((prev) =>
            prev ? { ...prev, participants: participants.length ? participants : prev.participants } : prev,
          )
        },
      )
      activeSubRef.current = sub

      setLobby({
        id: lobbyData.id,
        code: normCode,
        hostId: lobbyData.hostId,
        variant: lobbyData.variant,
        windowSeconds: lobbyData.windowSeconds,
        sequenceLength: lobbyData.sequenceLength,
        phase: lobbyData.phase,
        startedAt: lobbyData.startedAt,
        participants: [participant],
      })
    },
    [teardown],
  )

  const startGame = useCallback(async () => {
    if (!lobby) return
    const countdownMs = 9000 // Match the UI expectation of 9 seconds countdown
    const startedAt = Date.now() + countdownMs

    await backend.changeMode(lobby.code, lobby.hostId, {
      phase: 'prestart',
      startedAt,
    })
  }, [lobby])

  const updateVariant = useCallback(
    async (variant: MultiplayerVariant) => {
      if (!lobby) return
      await backend.changeMode(lobby.code, lobby.hostId, { variant })
    },
    [lobby],
  )

  const updateSettings = useCallback(
    async (windowSeconds: number, sequenceLength: number) => {
      if (!lobby) return
      await backend.changeMode(lobby.code, lobby.hostId, { windowSeconds, sequenceLength })
    },
    [lobby],
  )

  const submitResults = useCallback(async () => {
    if (!lobby) return
    await backend.submitResults(lobby.code, lobby.variant, lobby.participants)
    if (lobby.variant !== 'elimination') {
      await backend.changeMode(lobby.code, lobby.hostId, { phase: 'gameover' })
    }
  }, [lobby])

  const endRound = useCallback(async () => {
    if (!lobby) return
    if (lobby.variant === 'elimination') {
      setLobby((prev) => (prev ? { ...prev, phase: 'gameover' } : prev))
      if (isHost) {
        await submitResults()
      }
    } else if (isHost) {
      await submitResults()
    }
  }, [lobby, isHost, submitResults])

  const returnToLobby = useCallback(async () => {
    if (!lobby || !isHost) return
    await backend.changeMode(lobby.code, lobby.hostId, { phase: 'idle' })
  }, [lobby, isHost])

  const leaveLobby = useCallback(() => {
    if (lobby && localParticipantId) {
      if (isHost) {
        void submitResults()
      }
      void backend.leaveLobby(lobby.id, localParticipantId, isHost, lobby.code)
    }
    teardown()
    setLobby(null)
    setLocalParticipantId(null)
  }, [lobby, localParticipantId, isHost, teardown, submitResults])

  const readyUp = useCallback(() => {
    const participant = localParticipantRef.current
    if (!participant) return
    const updated = { ...participant, ready: !participant.ready }
    trackLocal(updated, true)
  }, [trackLocal])

  // Synchronized countdown effect
  useEffect(() => {
    if (lobby?.phase !== 'prestart' || !lobby.startedAt) {
      setPrestartTimeLeftMs(0)
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const remaining = Math.max(0, lobby.startedAt! - now)
      setPrestartTimeLeftMs(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        setLobby((prev) => {
          if (prev && prev.phase === 'prestart') {
            return { ...prev, phase: 'playing' }
          }
          return prev
        })
        if (isHost) {
          // Host marks DB as 'playing' once countdown reaches zero
          void backend.changeMode(lobby.code, lobby.hostId, { phase: 'playing' })
        }
      }
    }, 50)

    return () => clearInterval(interval)
  }, [lobby?.phase, lobby?.startedAt, lobby?.code, lobby?.hostId, isHost])

  // Heartbeat roster effect
  useEffect(() => {
    if (!lobby || !localParticipantId) return

    const runHeartbeat = () => {
      const localPart = lobby.participants.find((p) => p.id === localParticipantId)
      if (localPart) {
        void backend.heartbeat(lobby.id, localPart)
      }
    }

    runHeartbeat()
    const interval = setInterval(runHeartbeat, 15_000)
    return () => clearInterval(interval)
  }, [lobby?.id, localParticipantId, lobby?.participants])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      teardown()
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current)
      }
    }
  }, [teardown])

  return {
    enabled: isMockMode || isMultiplayerEnabled,
    lobby,
    isHost,
    localParticipantId,
    prestartTimeLeftMs,
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
