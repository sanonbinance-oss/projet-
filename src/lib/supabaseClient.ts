/* ==========================================================================
 * PayKal — client Supabase (initialisation unique)
 * --------------------------------------------------------------------------
 * `url` et `anonKey` proviennent de `config.ts`, qui applique le repli codé
 * en dur. L'application ne dépend donc JAMAIS de la présence des variables
 * d'environnement Netlify pour démarrer.
 * ========================================================================== */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

let cached: SupabaseClient | null = null

/**
 * Retourne le client Supabase (créé une seule fois).
 * Lève une erreur explicite et lisible si la configuration est invalide,
 * plutôt que de laisser le navigateur renvoyer « Failed to fetch ».
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached

  if (!isSupabaseConfigured()) {
    throw new Error(
      `Configuration Supabase invalide : URL="${SUPABASE_URL || '(vide)'}". ` +
        'Vérifiez src/lib/config.ts ou les variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.',
    )
  }

  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'paykal.auth',
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'paykal-pwa' },
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  })

  return cached
}

/** Raccourci pratique : `supabase.from('transactions')...` */
export const supabase: SupabaseClient = getSupabase()

/** Client Supabase ou `null` si la configuration est inutilisable. */
export function tryGetSupabase(): SupabaseClient | null {
  try {
    return getSupabase()
  } catch {
    return null
  }
}
