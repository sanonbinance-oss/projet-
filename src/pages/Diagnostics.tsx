/* ==========================================================================
 * PayKal — page de diagnostic (routes, Supabase, PWA, Netlify)
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { Alert, Button, Card, SkeletonList, Stat } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { APP_VERSION, FALLBACK_SUPABASE_ANON_KEY, FALLBACK_SUPABASE_URL, RECEIPT_BUCKET } from '../lib/config'
import {
  buildDiagnosticReport,
  formatDiagnosticAsText,
  getRuntimeIssues,
  runDiagnostics,
  type CheckResult,
  type CheckStatus,
} from '../lib/diagnostics'
import { resetDemoData } from '../lib/demoApi'

const ICONS: Record<CheckStatus, string> = {
  ok: '✅',
  warn: '⚠️',
  error: '❌',
  running: '⏳',
}

export default function Diagnostics() {
  const { mode, switchMode, retryLive, reachability, isAdmin } = useSession()
  const { toast } = useToast()
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [running, setRunning] = useState(true)
  const [issues, setIssues] = useState(getRuntimeIssues())

  const run = useCallback(async () => {
    setRunning(true)
    try {
      const results = await runDiagnostics(setChecks)
      setChecks(results)
    } catch (error) {
      toast.error('Diagnostic interrompu', error instanceof Error ? error.message : undefined)
    } finally {
      setIssues(getRuntimeIssues())
      setRunning(false)
    }
  }, [toast])

  useEffect(() => {
    void run()
  }, [run])

  const ok = checks.filter((check) => check.status === 'ok').length
  const warnings = checks.filter((check) => check.status === 'warn').length
  const errors = checks.filter((check) => check.status === 'error').length

  const copyReport = async () => {
    const text = formatDiagnosticAsText(buildDiagnosticReport(checks))
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Rapport copié', 'Collez-le dans votre ticket de support.')
    } catch {
      toast.error('Copie impossible', 'Sélectionnez le texte affiché ci-dessous manuellement.')
    }
  }

  return (
    <AppShell variant={isAdmin ? 'admin' : 'client'}>
      <div className="page-head">
        <div>
          <h1>Diagnostic PayKal</h1>
          <p>
            Vérification en direct : configuration Supabase, tables, Storage, PWA, routes SPA et déploiement Netlify.
          </p>
        </div>
        <div className="btn row">
          <Button variant="secondary" icon="🔄" onClick={() => void run()} loading={running}>
            Relancer
          </Button>
          <Button variant="secondary" icon="📋" onClick={copyReport}>
            Copier le rapport
          </Button>
        </div>
      </div>

      <div className="grid cols-4 mb-2">
        <Stat label="Contrôles OK" value={ok} tone="approved" />
        <Stat label="Avertissements" value={warnings} tone="pending" />
        <Stat label="Erreurs" value={errors} tone="rejected" />
        <Stat label="Mode" value={mode === 'demo' ? 'Démo' : 'Réel'} sub={reachability.ok ? 'Backend joignable' : 'Backend injoignable'} />
      </div>

      {mode === 'live' && !reachability.ok && reachability.checked ? (
        <Alert tone="error" title="Supabase injoignable depuis ce navigateur">
          {reachability.detail}
          <div className="btn row" style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" onClick={() => void retryLive()}>
              Réessayer
            </Button>
            <Button variant="warn" size="sm" onClick={() => switchMode('demo')}>
              Basculer en mode démonstration
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card title="Identifiants compilés dans cette version">
        <dl className="kv">
          <dt>Supabase URL</dt>
          <dd className="mono">{FALLBACK_SUPABASE_URL}</dd>
          <dt>Clé publique (repli)</dt>
          <dd className="mono">{FALLBACK_SUPABASE_ANON_KEY.slice(0, 12)}…{FALLBACK_SUPABASE_ANON_KEY.slice(-6)}</dd>
          <dt>Bucket des captures</dt>
          <dd className="mono">{RECEIPT_BUCKET}</dd>
          <dt>Version</dt>
          <dd>PayKal PWA v{APP_VERSION}</dd>
        </dl>
        <Alert tone="info" title="Comment le repli fonctionne">
          Au build, Vite lit <span className="mono">VITE_SUPABASE_URL</span> et{' '}
          <span className="mono">VITE_SUPABASE_ANON_KEY</span>. Si elles sont absentes ou invalides, les valeurs
          ci-dessus sont utilisées automatiquement : c’est ce qui supprime les erreurs « Failed to fetch » liées à une
          variable Netlify oubliée.
        </Alert>
      </Card>

      <Card title={running ? 'Vérifications en cours…' : 'Résultats des vérifications'}>
        {checks.length === 0 && running ? (
          <SkeletonList count={4} />
        ) : (
          checks.map((check) => (
            <div className="check" key={check.id}>
              <span className="icon" aria-hidden="true">
                {ICONS[check.status]}
              </span>
              <div>
                <div className="label">{check.label}</div>
                <div className="detail">{check.detail}</div>
                {check.hint ? <div className="hint">💡 {check.hint}</div> : null}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card title="Erreurs d’exécution détectées">
        {issues.length === 0 ? (
          <p className="text-muted text-sm mb-0">
            Aucune erreur JavaScript capturée depuis l’ouverture de l’application. 👍
          </p>
        ) : (
          <ul className="text-sm">
            {issues.map((issue) => (
              <li key={issue.at} className="mono">
                {new Date(issue.at).toLocaleTimeString('fr-FR')} — {issue.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Outils de récupération">
        <div className="btn row">
          <Button variant="secondary" icon="🧪" onClick={() => switchMode(mode === 'demo' ? 'live' : 'demo')}>
            {mode === 'demo' ? 'Revenir au mode réel (Supabase)' : 'Basculer en mode démonstration'}
          </Button>
          <Button
            variant="secondary"
            icon="♻️"
            onClick={() => {
              resetDemoData()
              toast.info('Données de démo réinitialisées', 'Rechargez la page pour repartir des jeux d’essai.')
            }}
          >
            Réinitialiser les données de démo
          </Button>
          <Button
            variant="secondary"
            icon="📲"
            onClick={async () => {
              if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations()
                await Promise.all(registrations.map((registration) => registration.unregister()))
                const keys = await caches.keys()
                await Promise.all(keys.map((key) => caches.delete(key)))
                toast.success('Cache PWA vidé', 'Rechargez la page pour réinstaller la dernière version.')
              }
            }}
          >
            Vider le cache PWA
          </Button>
        </div>
        <Alert tone="warn" title="Rappel de déploiement Netlify">
          L’archive doit contenir <span className="mono">index.html</span>, <span className="mono">_redirects</span>,{' '}
          <span className="mono">manifest.webmanifest</span>, <span className="mono">sw.js</span> et{' '}
          <span className="mono">assets/</span> <b>à la racine</b> (jamais dans un sous-dossier <span className="mono">pwa/</span>).
        </Alert>
      </Card>
    </AppShell>
  )
}
