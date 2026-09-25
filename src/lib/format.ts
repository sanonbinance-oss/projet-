/* ==========================================================================
 * PayKal — utilitaires de formatage (montants, dates, statuts, erreurs)
 * ========================================================================== */

import { CURRENCY, PAYMENT_METHODS } from './config'
import type { PaymentMethod, TxStatus } from './types'

/* ------------------------------- Montants --------------------------------- */

export function formatAmount(amount: number, currency: string = CURRENCY): string {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString('fr-FR')} ${currency}`
  }
}

/** 12500 -> "12 500 FCFA" (compact, sans espace insécable problématique) */
export function formatAmountShort(amount: number, currency: string = CURRENCY): string {
  const value = Number.isFinite(amount) ? amount : 0
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 })} ${
    currency === 'XOF' ? 'FCFA' : currency
  }`
}

export function parseAmount(raw: string): number {
  if (!raw) return NaN
  const cleaned = String(raw)
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/FCFA|XOF|€|\$/gi, '')
    .replace(',', '.')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : NaN
}

/* --------------------------------- Dates ---------------------------------- */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60000)
  if (Math.abs(minutes) < 1) return "à l'instant"
  if (Math.abs(minutes) < 60) return minutes > 0 ? `il y a ${minutes} min` : `dans ${-minutes} min`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return hours > 0 ? `il y a ${hours} h` : `dans ${-hours} h`
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return days > 0 ? `il y a ${days} j` : `dans ${-days} j`
  return formatDate(iso)
}

/** Regroupe les messages par jour : "Aujourd'hui", "Hier", ou date complète. */
export function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return "Aujourd'hui"
  if (same(date, yesterday)) return 'Hier'
  return formatDate(iso)
}

/* -------------------------------- Statuts --------------------------------- */

export const STATUS_LABELS: Record<TxStatus, string> = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
}

export const STATUS_DESCRIPTIONS: Record<TxStatus, string> = {
  pending: "Votre reçu est en cours de vérification par l'administration.",
  approved: 'Votre compte a été rechargé. Le reçu PDF est disponible au téléchargement.',
  rejected: 'La demande a été refusée. Consultez le motif puis contactez l’administration.',
}

export function statusLabel(status: TxStatus | string): string {
  return STATUS_LABELS[status as TxStatus] ?? String(status)
}

export function methodLabel(method: PaymentMethod | string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? 'Autre moyen'
}

/* --------------------------------- Divers --------------------------------- */

export function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

/** 074452674 -> 07 44 52 674 (plus lisible à l'écran) */
export function formatPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`
  if (digits.length === 8) return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`
  return value
}

/* -------------------------------- Erreurs --------------------------------- */

/**
 * Convertit toute erreur (réseau, Supabase, navigateur) en message clair en
 * français. C'est le garde-fou anti « Failed to fetch » côté utilisateur.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Une erreur inconnue est survenue.'
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)

  const message = raw.trim()
  const lower = message.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return (
      'Impossible de joindre le serveur PayKal (réseau ou Supabase injoignable). ' +
      'Vérifiez votre connexion Internet. Si le problème persiste, ouvrez « Diagnostic » : ' +
      'l’URL Supabase, la clé publique ou le déploiement Netlify sont probablement en cause.'
    )
  }
  if (lower.includes('invalid api key') || lower.includes('no api key') || lower.includes('invalid apikey')) {
    return 'Clé publique Supabase invalide ou révoquée. Mettez à jour VITE_SUPABASE_ANON_KEY (ou le repli dans src/lib/config.ts).'
  }
  if (lower.includes('could not find the table') || lower.includes('does not exist') || lower.includes('42p01')) {
    return (
      'Les tables PayKal sont introuvables dans votre projet Supabase. ' +
      'Exécutez le script `supabase/schema.sql` dans Supabase > SQL Editor (voir README).'
    )
  }
  if (lower.includes('bucket not found')) {
    return 'Le bucket Storage « receipts » est absent. Exécutez `supabase/schema.sql` (section Storage) ou créez le bucket « receipts ».'
  }
  if (lower.includes('email not confirmed')) {
    return 'Votre e-mail n’est pas encore confirmé. Ouvrez le lien reçu par e-mail, ou désactivez « Confirm email » dans Supabase > Authentication > Providers > Email.'
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-mail ou mot de passe incorrect.'
  }
  if (lower.includes('user already registered')) {
    return 'Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.'
  }
  if (lower.includes('password should be at least')) {
    return 'Mot de passe trop court : 6 caractères minimum.'
  }
  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('42501')) {
    return (
      'Accès refusé par la sécurité (RLS) Supabase. Assurez-vous d’avoir exécuté `supabase/schema.sql` ' +
      'et que votre profil possède le rôle « admin » pour cette action.'
    )
  }
  if (lower.includes('payload too large') || lower.includes('exceeded the maximum allowed size')) {
    return 'Fichier trop volumineux pour Supabase Storage (8 Mo maximum).'
  }
  return message || 'Une erreur inconnue est survenue.'
}

/** Extrait un code d'erreur PostgREST/Supabase utile au diagnostic. */
export function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; status?: unknown }
    if (typeof candidate.code === 'string') return candidate.code
    if (typeof candidate.status === 'number') return String(candidate.status)
  }
  return null
}
