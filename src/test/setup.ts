/* ==========================================================================
 * PayKal — amorçage des tests (polyfills jsdom)
 * ========================================================================== */

import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Le mode de données est lu au chargement du module `lib/backend.ts` (donc à
 * l'import du fichier de test). On force ici le mode démonstration AVANT que
 * le moindre module de l'application ne soit évalué : les tests n'émettent
 * ainsi aucune requête réseau vers Supabase.
 */
localStorage.setItem('paykal.data-mode', 'demo')

/* jsdom n'implémente pas ces API utilisées par l'application. */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (!('scrollTo' in window)) {
  Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true })
}

// Fonctions simples (et non des vi.fn) : `restoreMocks: true` réinitialiserait
// leur valeur de retour et ferait échouer le mode démonstration.
URL.createObjectURL = (() => 'blob:paykal-test') as typeof URL.createObjectURL
URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL

if (!navigator.clipboard) {
  // `configurable: true` est indispensable : @testing-library/user-event
  // remplace cette propriété pour simuler le presse-papiers.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()), readText: vi.fn(() => Promise.resolve('')) },
    writable: true,
    configurable: true,
  })
}

// jsdom ne fournit pas de contexte canvas : on rend le pressage d'image non bloquant.
if (!HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('paykal.data-mode', 'demo')
  window.history.pushState({}, '', '/')
})

afterEach(() => {
  cleanup()
})

/* Aucun test ne doit atteindre le réseau : on neutralise fetch en mode démo. */
globalThis.fetch = (() =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )) as typeof fetch
