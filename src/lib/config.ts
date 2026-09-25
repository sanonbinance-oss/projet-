/* ==========================================================================
 * PayKal — configuration centralisée
 * --------------------------------------------------------------------------
 * Les identifiants Supabase PUBLICS (URL + clé publishable/anon) sont codés
 * ici en repli ("fallback"). Objectif : plus jamais d'erreur "Failed to fetch"
 * sur Netlify parce qu'une variable d'environnement a été oubliée, mal nommée
 * ou non injectée au moment du build.
 *
 * Priorité :  import.meta.env.VITE_*  >  valeur de repli ci-dessous.
 * ========================================================================== */

/** Valeurs de repli — projet Supabase PayKal. */
export const FALLBACK_SUPABASE_URL = 'https://sxtlttaswhodbtcjjdyn.supabase.co'
export const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn'

/** Valeurs considérées comme « non fournies » (build sans variable Netlify). */
const PLACEHOLDERS = new Set([
  '',
  'undefined',
  'null',
  'false',
  'your-supabase-url',
  'your-anon-key',
  'https://your-project.supabase.co',
])

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/^["']|["']$/g, '')
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? '' : trimmed
}

function normalizeUrl(value: string): string {
  if (!value) return ''
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  return withProtocol.replace(/\/+$/, '')
}

/* -------------------------------------------------------------------------- */
/*  Supabase                                                                   */
/* -------------------------------------------------------------------------- */

const envUrl = clean(import.meta.env.VITE_SUPABASE_URL)
const envKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const SUPABASE_URL: string = normalizeUrl(envUrl) || FALLBACK_SUPABASE_URL
export const SUPABASE_ANON_KEY: string = envKey || FALLBACK_SUPABASE_ANON_KEY

/** Indique si l'un des replis est utilisé (affiché dans le diagnostic). */
export const USING_FALLBACK = {
  url: !envUrl,
  anonKey: !envKey,
  get any(): boolean {
    return !envUrl || !envKey
  },
}

/** Empreinte lisible de la clé (jamais la clé complète). */
export function keyFingerprint(key: string): string {
  if (!key) return '(absente)'
  if (key.length <= 14) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 10)}…${key.slice(-6)} (${key.length} caractères)`
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && /^https?:\/\//.test(SUPABASE_URL))
}

/* -------------------------------------------------------------------------- */
/*  Paramètres métier PayKal                                                   */
/* -------------------------------------------------------------------------- */

export const APP_NAME = 'PayKal'
export const APP_TAGLINE = 'Messagerie & rechargement sécurisés'
export const APP_VERSION = '1.0.0'

/** Numéro de transfert officiel affiché aux clients. */
export const TRANSFER_NUMBER: string = clean(import.meta.env.VITE_TRANSFER_NUMBER) || '074452674'

export const CURRENCY: string = clean(import.meta.env.VITE_CURRENCY) || 'XOF'

/** Bucket Supabase Storage contenant les captures d'écran des reçus. */
export const RECEIPT_BUCKET = 'receipts'

/** Taille maximale acceptée pour une preuve de paiement (8 Mo). */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024

/** Montants rapides proposés dans le formulaire de rechargement. */
export const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000]

export const PAYMENT_METHODS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'wave', label: 'Wave', hint: 'Transfert Wave vers le numéro PayKal' },
  { value: 'orange_money', label: 'Orange Money', hint: 'Transfert Orange Money' },
  { value: 'mtn_momo', label: 'MTN MoMo', hint: 'Transfert MTN Mobile Money' },
  { value: 'moov_money', label: 'Moov Money', hint: 'Transfert Moov Money' },
  { value: 'autre', label: 'Autre moyen', hint: 'Espèces, virement ou autre canal' },
]

/** Durée de validité des liens signés vers les captures (1 heure). */
export const PROOF_SIGNED_URL_TTL = 60 * 60

/** Clé localStorage du mode de données choisi. */
export const MODE_STORAGE_KEY = 'paykal.data-mode'
