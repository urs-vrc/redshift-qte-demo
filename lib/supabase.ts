import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !anonKey) {
  // The app still runs without Supabase configured; multiplayer will be disabled.
  console.warn(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set. Multiplayer mode will be unavailable.',
  )
}

export const supabase =
  url && anonKey ? createClient(url, anonKey) : null

export const isMultiplayerEnabled = supabase !== null
