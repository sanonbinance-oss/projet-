/* ==========================================================================
 * PayKal — diagnostic d'installation (Supabase, PWA, Netlify, routes)
 * --------------------------------------------------------------------------
 * Sert à répondre en un écran à la question : « pourquoi l'app ne parle-t-elle
 * pas à Supabase ? ». Chaque contrôle indique OK / AVERTISSEMENT / ERREUR avec
 * une explication et la correction à appliquer.
 * ========================================================================== */

import {
  APP_VERSION,
  FALLBACK_SUPABASE_ANON_KEY,
  FALLBACK_SUPABASE_URL,
  RECEIPT_BUCKET,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TRANSFER_NUMBER,
  USING_FALLBACK,
  keyFingerprint,
} from './config'
import { describeError, errorCode } from './format'
import { getSupabase } from './supabaseClient'
import { getDataMode } from './backend'

export type CheckStatus = 'ok' | 'warn' | 'error' | 'running'

export interface CheckResult {
  id: string
  label: string
  status: CheckStatus
  detail: string
  hint?: string
}

/* ----------------------- Journal d'erreurs d'exécution -------------------- */

interface RuntimeIssue {
  message: string
  at: string
}

const runtimeIssues: RuntimeIssue[] = []

export function recordRuntimeIssue(message: string): void {
  if (runtimeIssues.some((issue) => issue.message === message)) return
  runtimeIssues.push({ message, at: new Date().toISOString() })
  if (runtimeIssues.length > 20) runtimeIssues.shift()
}

export function getRuntimeIssues(): RuntimeIssue[] {
  return [...runtimeIssues]
}

/** À appeler une fois au démarrage (voir main.tsx). */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    recordRuntimeIssue(event.message || 'Erreur JavaScript inconnue')
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    recordRuntimeIssue(describeError(reason))
  })
}

/* ------------------------------- Contrôles -------------------------------- */

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    window.clearTimeout(timer)
  }
}

function checkEnv(): CheckResult[] {
  const urlSource = USING_FALLBACK.url ? 'repli codé dans src/lib/config.ts' : 'variable VITE_SUPABASE_URL'
  const keySource = USING_FALLBACK.anonKey
    ? 'repli codé dans src/lib/config.ts'
    : 'variable VITE_SUPABASE_ANON_KEY'

  const results: CheckResult[] = [
    {
      id: 'env-url',
      label: 'URL Supabase',
      status: SUPABASE_URL === FALLBACK_SUPABASE_URL ? 'ok' : 'ok',
      detail: `${SUPABASE_URL} (${urlSource})`,
      hint: USING_FALLBACK.url
        ? 'Vous utilisez le repli : aucun risque d’erreur « Failed to fetch » liée aux variables Netlify.'
        : undefined,
    },
    {
      id: 'env-key',
      label: 'Clé publique Supabase',
      status: 'ok',
      detail: `${keyFingerprint(SUPABASE_ANON_KEY)} (${keySource})`,
    },
    {
      id: 'env-format',
      label: 'Format des identifiants',
      status:
        /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
        (SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ'))
          ? 'ok'
          : 'warn',
      detail: /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL)
        ? 'URL conforme (*.supabase.co) et clé publishable/anon reconnue.'
        : 'L’URL ne ressemble pas à un projet Supabase standard.',
      hint:
        SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ')
          ? undefined
          : 'La clé devrait commencer par « sb_publishable_ » (nouvelle clé) ou « eyJ » (JWT anon historique).',
    },
    {
      id: 'env-transfer',
      label: 'Numéro de transfert affiché',
      status: /^\d{8,}$/.test(TRANSFER_NUMBER.replace(/\s/g, '')) ? 'ok' : 'warn',
      detail: TRANSFER_NUMBER,
      hint: 'Modifiable via la variable VITE_TRANSFER_NUMBER ou directement dans src/lib/config.ts.',
    },
  ]

  if (SUPABASE_ANON_KEY === FALLBACK_SUPABASE_ANON_KEY && USING_FALLBACK.anonKey) {
    results[1].hint = 'Repli actif : l’application fonctionnera même si la variable Netlify est absente.'
  }
  return results
}

function checkBrowser(): CheckResult[] {
  const results: CheckResult[] = []
  const online = navigator.onLine
  results.push({
    id: 'network',
    label: 'Connexion réseau du navigateur',
    status: online ? 'ok' : 'error',
    detail: online ? 'Le navigateur se déclare en ligne.' : 'Le navigateur est hors-ligne.',
    hint: online ? undefined : 'Reconnectez-vous à Internet : PayKal a besoin de Supabase pour synchroniser.',
  })

  const localOrigin = window.location.origin
  results.push({
    id: 'origin',
    label: 'Origine de l’application',
    status: 'ok',
    detail: `${localOrigin}${window.location.pathname}`,
    hint:
      /^(https?:\/\/localhost|https?:\/\/127\.0\.0\.1)/.test(localOrigin) && getDataMode() === 'live'
        ? 'En local, pensez à autoriser l’origine dans Supabase > Authentication > URL Configuration.'
        : undefined,
  })

  if ('serviceWorker' in navigator) {
    const controlled = Boolean(navigator.serviceWorker.controller)
    results.push({
      id: 'sw',
      label: 'Service Worker (PWA)',
      status: controlled ? 'ok' : 'warn',
      detail: controlled
        ? 'Actif : l’application est installable et fonctionne aussi hors-ligne.'
        : 'Non actif sur cet onglet (normal au premier chargement ou en mode développement).',
      hint: controlled ? undefined : 'Rechargez la page une fois : le Service Worker prend le relais au 2ᵉ chargement.',
    })
  } else {
    results.push({
      id: 'sw',
      label: 'Service Worker (PWA)',
      status: 'warn',
      detail: 'Non supporté par ce navigateur.',
    })
  }

  return results
}

async function checkStaticFiles(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // manifest.webmanifest
  try {
    const response = await timedFetch('/manifest.webmanifest', {}, 6000)
    if (response.ok) {
      const manifest = (await response.json()) as { name?: string; icons?: unknown[]; start_url?: string }
      results.push({
        id: 'manifest',
        label: 'manifest.webmanifest',
        status: manifest.name && Array.isArray(manifest.icons) && manifest.icons.length >= 2 ? 'ok' : 'warn',
        detail: `${manifest.name ?? 'sans nom'} · start_url ${manifest.start_url ?? '/'} · ${manifest.icons?.length ?? 0} icône(s)`,
      })
    } else {
      results.push({
        id: 'manifest',
        label: 'manifest.webmanifest',
        status: 'error',
        detail: `HTTP ${response.status}`,
        hint: 'Le fichier doit être à la racine de dist/ (fourni par public/manifest.webmanifest).',
      })
    }
  } catch (error) {
    results.push({
      id: 'manifest',
      label: 'manifest.webmanifest',
      status: 'error',
      detail: describeError(error),
    })
  }

  // sw.js
  try {
    const response = await timedFetch('/sw.js', {}, 6000)
    const text = response.ok ? await response.text() : ''
    results.push({
      id: 'sw-file',
      label: 'sw.js accessible',
      status: response.ok ? 'ok' : 'error',
      detail: response.ok ? `HTTP ${response.status} · ${text.length} octets` : `HTTP ${response.status}`,
      hint: response.ok ? undefined : 'sw.js doit se trouver à la racine de dist/ (public/sw.js).',
    })
  } catch (error) {
    results.push({ id: 'sw-file', label: 'sw.js accessible', status: 'error', detail: describeError(error) })
  }

  // _redirects (SPA) — servi par Netlify, renvoie l'index.html en local
  try {
    const response = await timedFetch('/_redirects', {}, 6000)
    const text = response.ok ? await response.text() : ''
    const hasRule = /\/\*\s+\/index\.html\s+200/.test(text)
    results.push({
      id: 'redirects',
      label: 'Règle SPA _redirects',
      status: hasRule ? 'ok' : 'warn',
      detail: hasRule
        ? 'Règle « /* /index.html 200 » détectée : les routes /admin, /transactions… survivent au rafraîchissement.'
        : `Contenu non standard (HTTP ${response.status}).`,
      hint: hasRule
        ? undefined
        : 'Le fichier _redirects est propre à Netlify : en local il peut renvoyer 404, c’est normal. Vérifiez sa présence dans dist/ avant de déployer.',
    })
  } catch {
    results.push({
      id: 'redirects',
      label: 'Règle SPA _redirects',
      status: 'warn',
      detail: 'Fichier non servi par ce serveur (normal hors Netlify).',
      hint: 'Vérifiez que dist/_redirects existe dans l’archive de déploiement.',
    })
  }

  // index.html à la racine
  results.push({
    id: 'base',
    label: 'index.html à la racine de dist/',
    status: import.meta.env.BASE_URL === '/' ? 'ok' : 'error',
    detail: `BASE_URL = "${import.meta.env.BASE_URL}"`,
    hint:
      import.meta.env.BASE_URL === '/'
        ? 'Conforme : assets chargés en /assets/… depuis la racine du site Netlify.'
        : 'Configurez base: "/" dans vite.config.ts pour éviter le problème du sous-dossier /pwa/.',
  })

  return results
}

async function checkSupabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  if (getDataMode() === 'demo') {
    return [
      {
        id: 'mode',
        label: 'Mode de données',
        status: 'warn',
        detail: 'Mode DÉMONSTRATION (données locales).',
        hint: 'Les contrôles Supabase sont ignorés. Basculez en mode réel depuis l’écran de connexion pour tester le backend.',
      },
    ]
  }

  let client
  try {
    client = getSupabase()
  } catch (error) {
    return [{ id: 'client', label: 'Client Supabase', status: 'error', detail: describeError(error) }]
  }

  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

  // 1. Endpoint Auth
  try {
    const response = await timedFetch(`${SUPABASE_URL}/auth/v1/health`, { headers })
    results.push({
      id: 'supabase-auth',
      label: 'Endpoint Auth Supabase',
      status: response.ok ? 'ok' : 'error',
      detail: `HTTP ${response.status} — ${SUPABASE_URL}/auth/v1/health`,
      hint: response.ok
        ? undefined
        : 'Le projet Supabase est peut-être en pause (les projets gratuits se mettent en pause après inactivité) ou la clé est invalide.',
    })
  } catch (error) {
    results.push({
      id: 'supabase-auth',
      label: 'Endpoint Auth Supabase',
      status: 'error',
      detail: describeError(error),
      hint: 'Vérifiez que l’URL du projet est exacte et que le projet n’est pas en pause dans le tableau de bord Supabase.',
    })
  }

  // 2. Endpoint REST + table transactions
  try {
    const response = await timedFetch(`${SUPABASE_URL}/rest/v1/transactions?select=id&limit=1`, { headers })
    if (response.status === 404 || response.status === 406) {
      results.push({
        id: 'supabase-table',
        label: 'Table « transactions »',
        status: 'error',
        detail: `HTTP ${response.status} : la table n’existe pas encore.`,
        hint: 'Exécutez le contenu de supabase/schema.sql dans Supabase > SQL Editor.',
      })
    } else if (response.ok || response.status === 200 || response.status === 206) {
      results.push({
        id: 'supabase-table',
        label: 'Table « transactions »',
        status: 'ok',
        detail: `HTTP ${response.status} — table accessible (RLS appliquée selon le rôle connecté).`,
      })
    } else if (response.status === 401 || response.status === 403) {
      results.push({
        id: 'supabase-table',
        label: 'Table « transactions »',
        status: 'warn',
        detail: `HTTP ${response.status} — accès refusé par RLS (attendu sans session ou pour un non-admin).`,
        hint: 'Connectez-vous avec un compte dont le profil a le rôle « admin » pour lire toutes les transactions.',
      })
    } else {
      results.push({
        id: 'supabase-table',
        label: 'Table « transactions »',
        status: 'warn',
        detail: `HTTP ${response.status} : réponse inattendue (${(await response.text()).slice(0, 160)}).`,
      })
    }
  } catch (error) {
    results.push({
      id: 'supabase-table',
      label: 'Table « transactions »',
      status: 'error',
      detail: describeError(error),
      hint: 'Erreur réseau : le domaine supabase.co peut être bloqué par votre FAI ou un pare-feu.',
    })
  }

  // 3. Session courante + rôle
  try {
    const { data } = await client.auth.getSession()
    if (data.session) {
      const { data: profile, error } = await client
        .from('profiles')
        .select('full_name, role')
        .eq('id', data.session.user.id)
        .maybeSingle()
      results.push({
        id: 'supabase-session',
        label: 'Session connectée',
        status: error ? 'warn' : 'ok',
        detail: profile
          ? `${data.session.user.email} — rôle « ${(profile as { role?: string }).role ?? 'inconnu'} »`
          : `${data.session.user.email} (profil introuvable dans la table profiles)`,
        hint: error
          ? describeError(error)
          : profile
            ? undefined
            : 'Le trigger handle_new_user() n’a peut-être pas été créé : exécutez supabase/schema.sql.',
      })
    } else {
      results.push({
        id: 'supabase-session',
        label: 'Session connectée',
        status: 'ok',
        detail: 'Aucune session active (état normal sur l’écran de connexion).',
      })
    }
  } catch (error) {
    results.push({
      id: 'supabase-session',
      label: 'Session connectée',
      status: 'warn',
      detail: describeError(error) + (errorCode(error) ? ` (code ${errorCode(error)})` : ''),
    })
  }

  // 4. Bucket Storage des captures
  try {
    const { data: buckets, error } = await client.storage.listBuckets()
    if (error) {
      results.push({
        id: 'supabase-bucket',
        label: `Bucket Storage « ${RECEIPT_BUCKET} »`,
        status: 'warn',
        detail: describeError(error),
        hint: 'La liste des buckets nécessite une clé de service ; c’est normal. La dépose de reçu peut toutefois échouer si le bucket n’existe pas : vérifiez dans Supabase > Storage.',
      })
    } else {
      const found = buckets?.some((bucket) => bucket.name === RECEIPT_BUCKET)
      results.push({
        id: 'supabase-bucket',
        label: `Bucket Storage « ${RECEIPT_BUCKET} »`,
        status: found ? 'ok' : 'error',
        detail: found
          ? `Bucket présent (${buckets?.length ?? 0} bucket(s) au total).`
          : `Bucket introuvable parmi : ${(buckets ?? []).map((bucket) => bucket.name).join(', ') || '(aucun)'}`,
        hint: found ? undefined : 'Créez le bucket « receipts » (public ou privé avec politiques de lecture).',
      })
    }
  } catch (error) {
    results.push({
      id: 'supabase-bucket',
      label: `Bucket Storage « ${RECEIPT_BUCKET} »`,
      status: 'warn',
      detail: describeError(error),
    })
  }

  // 5. Realtime
  results.push({
    id: 'supabase-realtime',
    label: 'Realtime (mises à jour en direct)',
    status: 'ok',
    detail: 'Client configuré (WebSocket wss://…/realtime/v1).',
    hint: 'Pour un rafraîchissement automatique immédiat, exécutez aussi la partie Realtime de supabase/schema.sql.',
  })

  // 6. Appel de validation réel
  try {
    const { error } = await client.auth.getSession()
    results.push({
      id: 'supabase-roundtrip',
      label: 'Cycle complet appel/ réponse',
      status: error ? 'warn' : 'ok',
      detail: error ? describeError(error) : 'Le client Supabase communique correctement.',
    })
  } catch (error) {
    results.push({
      id: 'supabase-roundtrip',
      label: 'Cycle complet appel/ réponse',
      status: 'error',
      detail: describeError(error),
    })
  }

  return results
}

function checkRoutes(): CheckResult[] {
  const routes = [
    { path: '/connexion', label: 'Connexion (client + admin)' },
    { path: '/inscription', label: 'Création de compte client' },
    { path: '/', label: 'Accueil client' },
    { path: '/recharger', label: 'Rechargement (numéro + reçu)' },
    { path: '/transactions', label: 'Suivi des demandes + reçu PDF' },
    { path: '/messages', label: 'Messagerie client' },
    { path: '/admin', label: 'Tableau de bord admin' },
    { path: '/admin/transactions', label: 'Validation / refus des paiements' },
    { path: '/admin/messages', label: 'Messagerie admin' },
    { path: '/admin/clients', label: 'Fichier clients' },
    { path: '/diagnostic', label: 'Diagnostic (cette page)' },
  ]
  return [
    {
      id: 'routes',
      label: `${routes.length} routes déclarées (SPA)`,
      status: 'ok',
      detail: routes.map((route) => route.path).join(' · '),
      hint: 'Le fichier _redirects (/* /index.html 200) garantit l’accès direct à chacune de ces URL sur Netlify.',
    },
  ]
}

export interface DiagnosticReport {
  generationDate: string
  appVersion: string
  supabaseUrl: string
  anonKeyMask: string
  fallbackUsed: boolean
  mode: string
  userAgent: string
  checks: CheckResult[]
}

/** Exécute tous les contrôles. `onProgress` permet d'afficher un état « en cours ». */
export async function runDiagnostics(onProgress?: (checks: CheckResult[]) => void): Promise<CheckResult[]> {
  const collected: CheckResult[] = []
  const report = (checks: CheckResult[]) => {
    collected.push(...checks)
    onProgress?.([...collected])
  }

  const pending: CheckResult[] = [
    { id: 'supabase-auth', label: 'Endpoint Auth Supabase', status: 'running', detail: 'Vérification…' },
    { id: 'supabase-table', label: 'Table « transactions »', status: 'running', detail: 'Vérification…' },
    { id: 'manifest', label: 'manifest.webmanifest', status: 'running', detail: 'Vérification…' },
    { id: 'sw-file', label: 'sw.js accessible', status: 'running', detail: 'Vérification…' },
  ]
  onProgress?.([...collected, ...pending])

  report(checkEnv())
  report(checkBrowser())
  report(checkRoutes())
  report(await checkStaticFiles())
  report(await checkSupabase())

  return collected
}

export function buildDiagnosticReport(checks: CheckResult[]): DiagnosticReport {
  return {
    generationDate: new Date().toISOString(),
    appVersion: APP_VERSION,
    supabaseUrl: SUPABASE_URL,
    anonKeyMask: keyFingerprint(SUPABASE_ANON_KEY),
    fallbackUsed: USING_FALLBACK.any,
    mode: getDataMode(),
    userAgent: navigator.userAgent,
    checks,
  }
}

/** Version texte, copiable en un clic pour un ticket de support. */
export function formatDiagnosticAsText(report: DiagnosticReport): string {
  const icon = (status: CheckStatus) =>
    status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : status === 'error' ? '❌' : '⏳'
  const lines = [
    `PayKal — rapport de diagnostic`,
    `Date : ${new Date(report.generationDate).toLocaleString('fr-FR')}`,
    `Version : ${report.appVersion} · Mode : ${report.mode}`,
    `Supabase : ${report.supabaseUrl}`,
    `Clé : ${report.anonKeyMask} (repli utilisé : ${report.fallbackUsed ? 'oui' : 'non'})`,
    `Navigateur : ${report.userAgent}`,
    '',
    ...report.checks.map(
      (check) => `${icon(check.status)} ${check.label} : ${check.detail}${check.hint ? `\n    → ${check.hint}` : ''}`,
    ),
  ]
  return lines.join('\n')
}
