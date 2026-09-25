import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * PayKal — configuration des tests (jsdom).
 * Les tests vérifient les parcours réels (client + admin) en mode démonstration :
 * aucun appel réseau vers Supabase n'est effectué.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
