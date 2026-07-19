import { defineConfig } from 'vitest/config'

// Vitest configuration for the Redshift QTE demo.
//
// Unit tests run in the default Node environment. DOM-dependent tests (e.g.
// device detection) opt into jsdom via a `// @vitest-environment jsdom`
// comment at the top of the file.
//
// Integration tests against the local Supabase stack (Edge Function + DB + RLS)
// live in `lib/**/*.integration.test.ts` and are skipped unless
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are provided (set automatically
// by `supabase start` in CI / local dev).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'supabase', '**/*.integration.test.ts'],
    // Keep unit runs fast and hermetic; integration tests opt in explicitly.
    testTimeout: 10_000,
  },
})
