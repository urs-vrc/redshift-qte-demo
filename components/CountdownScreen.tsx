import { PixelButton } from '@pxlkit/ui-kit'
import { PxlKitIcon } from '@pxlkit/core'
import { Clock, Home as HomeIcon, SparkleSmall } from '@pxlkit/ui'
import type { EngineMode, MultiplayerVariant } from '../lib/game-engine'

interface CountdownScreenProps {
  timeLeftMs: number
  mode: EngineMode | MultiplayerVariant
  playersCount?: number
  onQuit: () => void
  timerSeconds?: number
}

function getModeInfo(mode: EngineMode | MultiplayerVariant, timerSeconds?: number): {
  difficulty: 'HARD' | 'NORMAL' | 'EASY'
  variant: string
  hint: string
} {
  switch (mode) {
    // Timer-like modes (singleplayer 'timer', multiplayer 'score'/'reaction')
    // derive difficulty from the configured window, matching singleplayer.
    case 'timer':
    case 'score':
    case 'reaction': {
      let difficulty: 'HARD' | 'NORMAL' | 'EASY' = 'NORMAL'
      if (timerSeconds === 5) difficulty = 'HARD'
      else if (timerSeconds === 15) difficulty = 'EASY'
      return {
        difficulty,
        variant: 'TIMER',
        hint:
          mode === 'reaction'
            ? 'Reaction mode favors fast, precise inputs.'
            : 'Score as high as you can before the timer runs out!',
      }
    }
    // Endless-like modes (singleplayer 'endless', multiplayer 'elimination')
    // have no difficulty rating, matching singleplayer endless.
    case 'endless':
      return {
        difficulty: 'HARD',
        variant: 'ENDLESS',
        hint: 'Endless mode decreases the time between codes!',
      }
    case 'elimination':
      return {
        difficulty: 'HARD',
        variant: 'ELIMINATION',
        hint: 'Last player standing wins — don\'t miss a code!',
      }
  }
}

export default function CountdownScreen({
  timeLeftMs,
  mode,
  playersCount,
  onQuit,
  timerSeconds,
}: CountdownScreenProps) {
  const { difficulty, variant, hint } = getModeInfo(mode, timerSeconds)

  const formatTime = (ms: number) => {
    const totalSecs = ms / 1000
    const mins = Math.floor(totalSecs / 60)
    const secs = (totalSecs % 60).toFixed(1)
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-12 bg-retro-bg">
      {/* Pill countdown timer — matches PrestartSolo/PrestartMultiplayer mockup */}
      <div className="flex items-center gap-2 rounded-full border-2 border-retro-border bg-retro-surface px-5 py-2 font-pixel text-sm text-retro-text">
        <PxlKitIcon icon={Clock} size={14} />
        {formatTime(timeLeftMs)}
      </div>

      {/* Main "GET READY" card */}
      <div className="w-full max-w-lg rounded-2xl border-2 border-retro-border bg-retro-surface p-8">
        <div className="flex flex-col items-center gap-6">
          {/* GET READY header */}
          <p className="font-pixel text-xl tracking-widest text-retro-text">
            GET READY
          </p>

          {/* Difficulty + Mode variant row */}
          <div className="flex items-center gap-4">
            {mode !== 'endless' && mode !== 'elimination' && (
              <span className="font-pixel text-4xl font-bold text-retro-text">
                {difficulty}
              </span>
            )}
            <div className="flex items-center gap-2 rounded-full border-2 border-retro-border bg-retro-bg px-4 py-2">
              <PxlKitIcon icon={SparkleSmall} size={14} />
              <span className="font-pixel text-xs text-retro-text">{variant}</span>
            </div>
          </div>

          {/* Player count — shown for both solo (no count) and multiplayer */}
          {playersCount !== undefined && (
            <div className="flex items-center gap-2 text-retro-text">
              {/* SVG people icon matching the mockup */}
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="font-pixel text-2xl text-retro-text">{playersCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Hint pill below card — matches mockup */}
      <div className="flex items-center gap-2 rounded-full border border-retro-border bg-retro-surface px-5 py-2 text-xs font-pixel text-retro-muted">
        <PxlKitIcon icon={SparkleSmall} size={12} />
        {hint}
      </div>

      <PixelButton
        tone="neutral"
        variant="solid"
        iconLeft={<PxlKitIcon icon={HomeIcon} size={16} />}
        onClick={onQuit}
      >
        Quit to Menu
      </PixelButton>
    </div>
  )
}
