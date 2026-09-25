/* ==========================================================================
 * PayKal — sélecteur de backend
 * --------------------------------------------------------------------------
 * « live » (Supabase) est utilisé par défaut. Le mode « demo » (localStorage)
 * sert de repli quand Supabase est injoignable (hors-ligne, projet en pause,
 * clé invalide, tables absentes...) afin que l'application reste utilisable
 * et démontrable.
 * ========================================================================== */

import { liveApi } from './api'
import { describeError } from './format'
import { demoApi } from './demoApi'
import { MODE_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'
import type { Api, DataMode } from './types'

let mode: DataMode = readStoredMode()
const subscribers = new Set<(mode: DataMode) => void>()

function readStoredMode(): DataMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'demo' || stored === 'live') return stored
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1' || params.get('mode') === 'demo') return 'demo'
  } catch {
    /* stockage indisponible */
  }
  return 'live'
}

function persistMode(next: DataMode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, next)
  } catch {
    /* ignoré */
  }
}

export function getDataMode(): DataMode {
  return mode
}

export function getApi(): Api {
  return mode === 'demo' ? demoApi : liveApi
}

export function setDataMode(next: DataMode): void {
  if (next === mode) return
  mode = next
  persistMode(next)
  for (const subscriber of subscribers) {
    try {
      subscriber(next)
    } catch {
      /* ignoré */
    }
  }
}

export function onDataModeChange(callback: (mode: DataMode) => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

/** Bascule manuelle depuis l'interface (connexion / diagnostic). */
export function useDemoMode(): void {
  setDataMode('demo')
}

export function useLiveMode(): void {
  setDataMode('live')
}

/**
 * Vérifie en direct que le projet Supabase répond.
 * Utilisé par l'écran de connexion et la page Diagnostic.
 */
export async function pingSupabase(timeoutMs = 8000): Promise<{ ok: boolean; detail: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, detail: 'Configuration Supabase incomplète (URL ou clé publique manquante).' }
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Requête Auth de santé : on ne teste que la joignabilité du projet.
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (response.ok) return { ok: true, detail: `Supabase répond (HTTP ${response.status}).` }
    return { ok: false, detail: `Supabase a répondu HTTP ${response.status} : vérifiez la clé publique.` }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    return {
      ok: false,
      detail: aborted
        ? `Délai dépassé (${timeoutMs} ms) : ${SUPABASE_URL} injoignable depuis ce réseau.`
        : describeError(error),
    }
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Repli automatique : si Supabase est injoignable au démarrage, on propose le
 * mode démonstration (jamais d'écran blanc ni d'erreur « Failed to fetch »).
 */
export async function ensureReachableBackend(): Promise<{ mode: DataMode; switched: boolean; detail: string }> {
  if (mode === 'demo') return { mode, switched: false, detail: 'Mode démonstration actif.' }
  const result = await pingSupabase()
  if (result.ok) return { mode: 'live', switched: false, detail: result.detail }
  setDataMode('demo')
  return { mode: 'demo', switched: true, detail: result.detail }
}
