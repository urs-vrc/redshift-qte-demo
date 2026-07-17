import { useState, useEffect } from 'react'
import { PixelButton, PixelSegmented, PixelAvatar, PixelBadge } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, SparkleSmall, Home as HomeIcon } from '@pxlkit/ui'
import type { GameMode, MultiplayerParticipant } from '../lib/types'
import { useSingleplayerState } from '../hooks/useSingleplayerState'
import { useMultiplayerState } from '../hooks/useMultiplayerState'
import GameplayWindow from '../components/GameplayWindow'
import GameOverScreen from '../components/GameOverScreen'
import PrestartLobby from '../components/PrestartLobby'
import ResultsLeaderboard from '../components/ResultsLeaderboard'
import MultiplayerGameplay from '../components/multiplayer/MultiplayerGameplay'
import CountdownScreen from '../components/CountdownScreen'

type Screen = 'menu' | 'single' | 'multi'
type MenuTab = 'solo' | 'multi'

const MODE_OPTIONS = [
  { value: 'timer', label: 'TIMER' },
  { value: 'endless', label: 'ENDLESS' },
]

const WINDOW_OPTIONS = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
]

const DEMO_NAME_POOL = [
  'Nice Nature',
  'Nova Rust',
  'Turbo Finch',
  'Axel Moon',
  'Riven Byte',
  'Cinder Vale',
]

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [menuTab, setMenuTab] = useState<MenuTab>('solo')
  const [mode, setMode] = useState<GameMode>('timer')
  const [lobbyWindowSeconds, setLobbyWindowSeconds] = useState('5')

  const single = useSingleplayerState()
  const multi = useMultiplayerState()

  const [multiPrestartTimeLeft, setMultiPrestartTimeLeft] = useState(9000)

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
            onRestart={() => single.start(mode, Number(lobbyWindowSeconds))}
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
          onQuit={() => setScreen('menu')}
        />
      )
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-8 bg-retro-bg">
        <GameplayWindow state={single.state} />
        <PixelButton
          tone="neutral"
          variant="ghost"
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
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-retro-bg">
          <ResultsLeaderboard
            participants={multi.lobby.participants}
            onHome={() => {
              multi.leaveLobby()
              setScreen('menu')
            }}
          />
        </div>
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
          onLeave={() => {
            multi.leaveLobby()
            setScreen('menu')
          }}
        />
      )
    }

    // Lobby waiting room — matches MPLobby.png
    if (multi.lobby) {
      const requiredSlots = 6 * 3
      const slots: Array<MultiplayerParticipant & { isGhost?: boolean }> = [
        ...multi.lobby.participants,
      ]
      while (slots.length < requiredSlots) {
        const i = slots.length
        slots.push({
          id: `ghost-${i}`,
          name: DEMO_NAME_POOL[i % DEMO_NAME_POOL.length],
          score: 0,
          alive: i % 4 !== 0,
          sequence: null,
          progress: 0,
          isGhost: true,
        })
      }

      return (
        <main className="flex min-h-screen flex-col items-center gap-4 px-4 py-8 md:py-12 bg-retro-bg">
          <PxlKitIcon icon={SparkleSmall} size={28} className="text-retro-text" />
          <h1 className="font-pixel text-center text-2xl text-retro-text md:text-3xl">
            Lobby {multi.lobby.code}
          </h1>

          <section className="w-full max-w-5xl rounded-2xl border-2 border-retro-border bg-retro-surface p-4 md:p-8">
            <div className="mx-auto mb-3 max-w-xl">
              <PixelSegmented
                value={mode}
                options={MODE_OPTIONS}
                onChange={(v) => setMode(v as GameMode)}
              />
            </div>
            <div className="mx-auto mb-6 max-w-xl">
              <PixelSegmented
                value={lobbyWindowSeconds}
                options={WINDOW_OPTIONS}
                onChange={setLobbyWindowSeconds}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {slots.map((participant, i) => {
                const isReady = participant.alive && i % 3 !== 0
                return (
                  <div
                    key={participant.id}
                    className={[
                      'flex items-center justify-between gap-2 rounded-full border border-retro-border/60 bg-retro-bg px-3 py-1.5',
                      (participant as any).isGhost ? 'opacity-60' : '',
                    ].join(' ')}
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
                variant="ghost"
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
      )
    }

    return (
      <PrestartLobby
        enabled={multi.enabled}
        onCreate={(v, name) => void multi.createLobby(v, name)}
        onJoin={(code, name) => void multi.joinLobby(code, name)}
        onBack={() => setScreen('menu')}
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
      <div className="w-full max-w-md rounded-2xl border-2 border-retro-border bg-retro-surface p-6">
        <div className="flex flex-col items-center gap-5">
          <PixelSegmented
            value={mode}
            options={MODE_OPTIONS}
            onChange={(v) => setMode(v as GameMode)}
          />
          <PixelSegmented
            value={lobbyWindowSeconds}
            options={WINDOW_OPTIONS}
            onChange={setLobbyWindowSeconds}
          />
          {menuTab === 'solo' ? (
            <PixelButton
              id="btn-start"
              tone="neutral"
              size="lg"
              iconLeft={<PxlKitIcon icon={Clock} size={16} />}
              className="w-full"
              onClick={() => {
                setScreen('single')
                single.start(mode, Number(lobbyWindowSeconds))
              }}
            >
              START
            </PixelButton>
          ) : (
            <PixelButton
              id="btn-multiplayer"
              tone="neutral"
              size="lg"
              iconLeft={<PxlKitIcon icon={Clock} size={16} />}
              className="w-full"
              onClick={() => setScreen('multi')}
            >
              FIND LOBBY
            </PixelButton>
          )}
        </div>
      </div>
    </div>
  )
}
