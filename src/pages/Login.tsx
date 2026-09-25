/* ==========================================================================
 * PayKal — écran de connexion (client & administration)
 * ========================================================================== */

import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { APP_NAME, SUPABASE_URL, TRANSFER_NUMBER, USING_FALLBACK } from '../lib/config'
import { demoAccounts } from '../lib/demoApi'
import { describeError, isEmail } from '../lib/format'
import type { Role } from '../lib/types'
import { Alert, Button, Field, Input } from '../components/ui'

interface LoginLocationState {
  from?: string
  role?: Role
}

export default function Login() {
  const { signIn, mode, switchMode, reachability, retryLive, submitting } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LoginLocationState

  const [role, setRole] = useState<Role>(state.role ?? 'client')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const nextFieldErrors: { email?: string; password?: string } = {}
    if (!isEmail(email)) nextFieldErrors.email = 'Saisissez une adresse e-mail valide.'
    if (password.length < 6) nextFieldErrors.password = 'Le mot de passe contient au moins 6 caractères.'
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length > 0) return

    setLoading(true)
    try {
      const profile = await signIn(email, password)
      toast.success(`Bienvenue ${profile.full_name || profile.email}`, profile.role === 'admin' ? 'Espace administration.' : 'Espace client PayKal.')
      const target = profile.role === 'admin' ? '/admin' : state.from && state.from !== '/connexion' ? state.from : '/'
      navigate(target, { replace: true })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError(null)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div className="logo" aria-hidden="true">
            💠
          </div>
          <h1>{APP_NAME}</h1>
          <p>Connectez-vous pour recharger votre compte et échanger avec l’administration.</p>
        </div>

        {mode === 'live' && reachability.checked && !reachability.ok ? (
          <Alert tone="warn" title="Serveur PayKal injoignable">
            {reachability.detail}
            <div className="btn row" style={{ marginTop: 10 }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await retryLive()
                }}
              >
                🔄 Réessayer
              </Button>
              <Button variant="warn" size="sm" onClick={() => switchMode('demo')}>
                🧪 Continuer en mode démonstration
              </Button>
            </div>
          </Alert>
        ) : null}

        <div className="switcher" role="tablist">
          <button
            role="tab"
            aria-selected={role === 'client'}
            className={role === 'client' ? 'active' : ''}
            onClick={() => setRole('client')}
            type="button"
          >
            👤 Client / Parent
          </button>
          <button
            role="tab"
            aria-selected={role === 'admin'}
            className={role === 'admin' ? 'active' : ''}
            onClick={() => setRole('admin')}
            type="button"
          >
            🛡️ Administration
          </button>
        </div>

        {error ? (
          <Alert tone="error" title="Connexion impossible" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={submit} noValidate>
          <Field label="Adresse e-mail" htmlFor="email" error={fieldErrors.email} required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={role === 'admin' ? 'admin@paykal.app' : 'vous@exemple.com'}
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label="Mot de passe" htmlFor="password" error={fieldErrors.password} required>
            <div className="input-group">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? '🙈' : '👁️'}
              </Button>
            </div>
          </Field>

          <Button type="submit" block loading={loading || submitting} icon="🔓">
            Se connecter
          </Button>
        </form>

        <div className="auth-foot">
          Pas encore de compte ? <Link to="/inscription">Créer un compte client</Link>
        </div>

        {mode === 'demo' ? (
          <>
            <div className="sep" />
            <Alert tone="info" title="Mode démonstration actif">
              Comptes de test (données locales, sans effet sur votre base Supabase) :
              <div className="btn row" style={{ marginTop: 8 }}>
                {demoAccounts.map((account) => (
                  <Button
                    key={account.email}
                    variant="secondary"
                    size="xs"
                    onClick={() => fillDemo(account.email, account.password)}
                  >
                    {account.label}
                  </Button>
                ))}
              </div>
            </Alert>
          </>
        ) : (
          <div className="text-muted text-sm" style={{ marginTop: 14, textAlign: 'center' }}>
            Numéro de transfert {TRANSFER_NUMBER} ·{' '}
            <button
              type="button"
              className="btn ghost xs"
              onClick={() => switchMode('demo')}
              title="Tester l'application sans backend"
            >
              essayer la démo
            </button>
          </div>
        )}

        {USING_FALLBACK.any ? (
          <p className="text-muted text-sm" style={{ marginTop: 12, textAlign: 'center' }}>
            Connexion Supabase : <span className="mono">{SUPABASE_URL.replace('https://', '')}</span> (repli intégré)
          </p>
        ) : null}
      </div>
    </div>
  )
}
