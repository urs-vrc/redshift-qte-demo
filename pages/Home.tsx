import { useState, useEffect, useRef } from 'react'
import { PixelButton, PixelSegmented, PixelAvatar, PixelBadge, PixelAlert, PixelModal, PixelSelect } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall, Home as HomeIcon, Copy } from '@pxlkit/ui'
import type { GameMode, MultiplayerVariant } from '../lib/types'
import { useSingleplayerState } from '../hooks/useSingleplayerState'
import { useMultiplayerState } from '../hooks/useMultiplayerState'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { useAuth } from '../hooks/useAuth'
import { submitTelemetry } from '../lib/telemetrySubmission'
import GameplayWindow from '../components/GameplayWindow'
import GameOverScreen from '../components/GameOverScreen'
import PrestartLobby from '../components/PrestartLobby'
import AuthScreen from '../components/AuthScreen'
import ResultsLeaderboard from '../components/ResultsLeaderboard'
import MultiplayerGameplay from '../components/multiplayer/MultiplayerGameplay'
import CountdownScreen from '../components/CountdownScreen'

type Screen = 'menu' | 'single' | 'multi' | 'auth'
type MenuTab = 'solo' | 'multi'

const VARIANT_OPTIONS = [
  { value: 'score', label: 'Timer (Score)' },
  { value: 'elimination', label: 'Endless (Elimination)' },
  { value: 'reaction', label: 'Timer (Reaction)' },
]

const MODE_OPTIONS = [
  { value: 'timer', label: 'TIMER' },
  { value: 'endless', label: 'ENDLESS' },
]

const WINDOW_OPTIONS = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
]

const LENGTH_OPTIONS = [
  { value: '4', label: '4-combo' },
  { value: '6', label: '6-combo' },
  { value: '8', label: '8-combo' },
]

// Game-over screen: renders the server-side leaderboard (persisted by the host
// when the round ends) so standings survive after presence participants leave.
function GameOverLeaderboard({
  code,
  participants,
  onHome,
}: {
  code: string
  participants: import('../lib/types').MultiplayerParticipant[]
  onHome: () => void
}) {
  const { rows } = useLeaderboard(code, participants)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-retro-bg">
      <ResultsLeaderboard participants={rows} onHome={onHome} />
    </div>
  )
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [menuTab, setMenuTab] = useState<MenuTab>('solo')
  const [mode, setMode] = useState<GameMode>('timer')
  const [lobbyWindowSeconds, setLobbyWindowSeconds] = useState('5')
  const [sequenceLength, setSequenceLength] = useState('4')

  const single = useSingleplayerState()
  const multi = useMultiplayerState()
  const auth = useAuth()

  const [multiPrestartTimeLeft, setMultiPrestartTimeLeft] = useState(9000)
  const [modeDialogOpen, setModeDialogOpen] = useState(false)
  const [pendingVariant, setPendingVariant] = useState<MultiplayerVariant>(
    multi.lobby?.variant ?? 'score',
  )
  const [modeDialogError, setModeDialogError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Share-link support: ?lobby=CODE drops the user straight into the join flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('lobby')
    if (code && auth.status === 'authenticated' && !multi.lobby) {
      setScreen('multi')
    }
  }, [auth.status, multi.lobby])

  const sharedLobbyCode = new URLSearchParams(window.location.search).get('lobby')

  // Submit singleplayer telemetry once when a session ends (game over).
  const telemetrySubmittedRef = useRef(false)
  useEffect(() => {
    if (screen === 'single' && single.state.phase === 'gameover' && !telemetrySubmittedRef.current) {
      telemetrySubmittedRef.current = true
      void submitTelemetry({
        mode: single.state.mode,
        score: single.state.score,
        telemetry: single.telemetry,
      })
    }
    if (screen !== 'single') {
      telemetrySubmittedRef.current = false
    }
  }, [screen, single.state.phase, single.state.mode, single.state.score, single.telemetry])

  useEffect(() => {
    if (multi.lobby?.phase === 'prestart') {
      setMultiPrestartTimeLeft(9000)
      const start = Date.now()
      const interval = setInterval(() => {
        const elapsed = Date.now() - start
        const remaining = Math.max(0, 9000 - elapsed)
        setMultiPrestartTimeLeft(remaining)
        if (remaining <= 0) clearInterval(interval)
      }, 50)
      return () => clearInterval(interval)
    }
  }, [multi.lobby?.phase])

  // ── SINGLEPLAYER ──────────────────────────────────────────────────────────
  if (screen === 'single') {
    if (single.state.phase === 'gameover') {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-retro-bg">
          <GameOverScreen
            state={single.state}
            telemetry={single.telemetry}
            onRestart={() => single.start(mode, Number(lobbyWindowSeconds), Number(sequenceLength))}
            onHome={() => setScreen('menu')}
          />
        </div>
      )
    }
    if (single.state.phase === 'prestart') {
      return (
        <CountdownScreen
          timeLeftMs={single.state.prestartTimeLeftMs}
          mode={mode}
          timerSeconds={Number(lobbyWindowSeconds)}
          onQuit={() => setScreen('menu')}
        />
      )
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 bg-retro-bg">
        <GameplayWindow state={single.state} onInput={single.handleInput} />
        <PixelButton
          tone="neutral"
          variant="solid"
          iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
          onClick={() => setScreen('menu')}
        >
          Quit to menu
        </PixelButton>
      </div>
    )
  }

  // ── MULTIPLAYER ───────────────────────────────────────────────────────────
  if (screen === 'multi') {
    if (multi.lobby && multi.lobby.phase === 'gameover') {
      return (
        <GameOverLeaderboard
          code={multi.lobby.code}
          participants={multi.lobby.participants}
          onHome={() => {
            multi.leaveLobby()
            setScreen('menu')
          }}
        />
      )
    }
    if (multi.lobby && multi.lobby.phase === 'prestart') {
      return (
        <CountdownScreen
          timeLeftMs={multiPrestartTimeLeft}
          mode={
            multi.lobby.variant === 'score'
              ? 'score'
              : multi.lobby.variant === 'elimination'
                ? 'elimination'
                : 'reaction'
          }
          timerSeconds={Number(lobbyWindowSeconds)}
          playersCount={multi.lobby.participants.length}
          onQuit={() => {
            multi.leaveLobby()
            setScreen('menu')
          }}
        />
      )
    }
    if (multi.lobby && multi.lobby.phase === 'playing') {
      return (
        <MultiplayerGameplay
          lobby={multi.lobby}
          localParticipantId={multi.localParticipantId}
          trackLocal={multi.trackLocal}
          endRound={multi.endRound}
          onLeave={() => {
            multi.leaveLobby()
            setScreen('menu')
          }}
        />
      )
    }

    if (multi.lobby) {
      const participants = multi.lobby.participants

      return (
        <>
          <main className="flex min-h-screen flex-col items-center gap-4 px-4 py-8 md:py-12 bg-retro-bg">
          <PxlKitIcon icon={SparkleSmall} size={28} className="text-retro-text" />
          <h1 className="font-pixel text-center text-2xl text-retro-text md:text-3xl">
            Lobby {multi.lobby.code}
          </h1>
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?lobby=${multi.lobby!.code}`
              try {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                // Clipboard may be unavailable (e.g. insecure context); ignore.
              }
            }}
            className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-4 py-1.5 font-pixel text-xs text-retro-text transition-colors hover:border-retro-border-strong"
          >
            <PxlKitIcon icon={Copy} size={14} />
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>

          <section className="w-full max-w-5xl rounded-2xl border-2 border-retro-border bg-retro-surface p-4 md:p-8">
            <div className="mx-auto mb-3 flex max-w-xl items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-pixel text-xs text-retro-text">Game Mode</span>
                <span className="text-xs text-retro-muted">
                  {VARIANT_OPTIONS.find((o) => o.value === multi.lobby!.variant)?.label ?? multi.lobby!.variant}
                </span>
              </div>
              {multi.isHost && (
                <PixelButton
                  tone="neutral"
                  variant="solid"
                  onClick={() => {
                    setPendingVariant(multi.lobby?.variant ?? 'score')
                    setModeDialogError(null)
                    setModeDialogOpen(true)
                  }}
                >
                  Change Mode
                </PixelButton>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {participants.map((participant) => {
                const isReady = participant.alive
                return (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-2 rounded-full border border-retro-border/60 bg-retro-bg px-3 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PixelAvatar
                        name={participant.name}
                        size="sm"
                        tone={isReady ? 'green' : 'neutral'}
                      />
                      <span className="truncate text-sm text-retro-text">{participant.name}</span>
                    </div>
                    <PixelBadge tone={isReady ? 'green' : 'neutral'}>
                      {isReady ? 'READY' : 'NOT READY'}
                    </PixelBadge>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <PixelButton
                tone="neutral"
                size="lg"
                iconLeft={<PxlKitIcon icon={Clock} size={16} />}
                onClick={multi.startGame}
                className="min-w-48"
              >
                START
              </PixelButton>
              <PixelButton
                tone="neutral"
                variant="solid"
                iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
                onClick={() => {
                  multi.leaveLobby()
                  setScreen('menu')
                }}
              >
                Leave Lobby
              </PixelButton>
            </div>
          </section>
        </main>

        <PixelModal
          open={modeDialogOpen}
          title="Change Game Mode"
          description="Only the host can change the mode. This updates the lobby for everyone."
          onClose={() => setModeDialogOpen(false)}
          footer={
            <>
              <PixelButton
                tone="neutral"
                variant="solid"
                onClick={() => setModeDialogOpen(false)}
              >
                Cancel
              </PixelButton>
              <PixelButton
                tone="green"
                disabled={pendingVariant === multi.lobby?.variant}
                onClick={async () => {
                  setModeDialogError(null)
                  try {
                    await multi.updateVariant(pendingVariant)
                    setModeDialogOpen(false)
                  } catch (e) {
                    setModeDialogError(e instanceof Error ? e.message : 'Could not change mode.')
                  }
                }}
              >
                Save Mode
              </PixelButton>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <PixelSelect
              label="Game Mode"
              options={VARIANT_OPTIONS}
              value={pendingVariant}
              onChange={(v) => setPendingVariant(v as MultiplayerVariant)}
            />
            {modeDialogError && (
              <PixelAlert tone="red" label="Error" message={modeDialogError} />
            )}
          </div>
        </PixelModal>
        </>
      )
    }

    return (
      <PrestartLobby
        enabled={multi.enabled}
        defaultName={auth.user?.name}
        prefillCode={sharedLobbyCode ?? undefined}
        onCreate={(v, name) => void multi.createLobby(v, name)}
        onJoin={(code, name) => void multi.joinLobby(code, name)}
        onBack={() => setScreen('menu')}
      />
    )
  }

  // ── AUTH ────────────────────────────────────────────────────────────────
  if (screen === 'auth') {
    return (
      <AuthScreen
        disabled={auth.status === 'loading'}
        onSignIn={(provider) => void auth.signIn(provider)}
      />
    )
  }

  // ── MAIN MENU — matches Home.png exactly ─────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 bg-retro-bg">
      {/* Pixel icon + title */}
      <div className="flex flex-col items-center gap-3 text-center">
        <PxlKitIcon icon={SparkleSmall} size={32} className="text-retro-text" />
        <h1 className="font-pixel text-2xl text-retro-text md:text-3xl leading-snug">
          Redshift QTE Demo
        </h1>
        <p className="font-pixel max-w-xs text-center text-[10px] leading-loose text-retro-muted">
          This browser demo is intended to demonstrate the upcoming QTE mechanic for Project
          Redshift. Things here are in flux so keep that in mind!
        </p>
      </div>

      {/* SOLO / MULTI tab switcher — pill buttons matching the mockup */}
      <div className="flex gap-3">
        <button
          id="tab-solo"
          onClick={() => setMenuTab('solo')}
          className={[
            'flex items-center gap-2 rounded-full border-2 px-5 py-2 font-pixel text-xs transition-colors',
            menuTab === 'solo'
              ? 'border-retro-text bg-retro-text text-retro-bg'
              : 'border-retro-border bg-transparent text-retro-text hover:border-retro-border-strong',
          ].join(' ')}
        >
          <PxlKitIcon icon={Clock} size={12} />
          SOLO
        </button>
        <button
          id="tab-multi"
          onClick={() => setMenuTab('multi')}
          className={[
            'flex items-center gap-2 rounded-full border-2 px-5 py-2 font-pixel text-xs transition-colors',
            menuTab === 'multi'
              ? 'border-retro-text bg-retro-text text-retro-bg'
              : 'border-retro-border bg-transparent text-retro-text hover:border-retro-border-strong',
          ].join(' ')}
        >
          <PxlKitIcon icon={Clock} size={12} />
          MULTI
        </button>
      </div>

      {/* Options card — rounded rect matching the mockup */}
      {menuTab === 'multi' ? (
        auth.status === 'authenticated' ? (
          <PixelButton
            id="btn-enter-multi"
            tone="neutral"
            size="lg"
            className="w-full max-w-md"
            iconLeft={<PxlKitIcon icon={Clock} size={16} />}
            onClick={() => setScreen('multi')}
          >
            Enter Multiplayer
          </PixelButton>
        ) : (
          <PixelButton
            id="btn-multi-signin"
            tone="neutral"
            size="lg"
            className="w-full max-w-md"
            iconLeft={<PxlKitIcon icon={Clock} size={16} />}
            onClick={() => setScreen('auth')}
          >
            Sign in to play Multiplayer
          </PixelButton>
        )
      ) : (
        <div className="w-full max-w-md rounded-2xl border-2 border-retro-border bg-retro-surface p-6">
          <div className="flex flex-col items-center gap-5">
            <PixelSegmented
              value={mode}
              options={MODE_OPTIONS}
              onChange={(v) => setMode(v as GameMode)}
            />
            {mode !== 'endless' && (
              <PixelSegmented
                value={lobbyWindowSeconds}
                options={WINDOW_OPTIONS}
                onChange={setLobbyWindowSeconds}
              />
            )}
            {mode !== 'endless' && (
              <PixelSegmented
                value={sequenceLength}
                options={LENGTH_OPTIONS}
                onChange={setSequenceLength}
              />
            )}
            <PixelButton
              id="btn-start"
              tone="neutral"
              size="lg"
              iconLeft={<PxlKitIcon icon={Clock} size={16} />}
              className="w-full"
              onClick={() => {
                setScreen('single')
                single.start(mode, Number(lobbyWindowSeconds), Number(sequenceLength))
              }}
            >
              START
            </PixelButton>
          </div>
        </div>
      )}
    </div>
  )
}
