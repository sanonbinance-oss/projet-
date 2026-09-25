/* ==========================================================================
 * PayKal — création de compte client
 * ========================================================================== */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { APP_NAME, TRANSFER_NUMBER } from '../lib/config'
import { describeError, isEmail } from '../lib/format'
import { Alert, Button, Field, Input } from '../components/ui'

export default function Register() {
  const { signUp, submitting, mode } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const errors: Record<string, string> = {}
    if (fullName.trim().length < 3) errors.fullName = 'Indiquez votre nom complet (3 caractères minimum).'
    if (!isEmail(email)) errors.email = 'Adresse e-mail invalide.'
    if (phone && phone.replace(/\D/g, '').length < 8) errors.phone = 'Numéro de téléphone trop court.'
    if (password.length < 6) errors.password = 'Le mot de passe doit contenir au moins 6 caractères.'
    if (password !== confirm) errors.confirm = 'Les deux mots de passe ne correspondent pas.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!validate()) return
    setLoading(true)
    try {
      const result = await signUp({ email, password, fullName, phone })
      if (result.needsEmailConfirmation) {
        setConfirmationSent(true)
        toast.info('Compte créé', 'Confirmez votre e-mail pour vous connecter.')
      } else {
        toast.success('Compte créé 🎉', 'Bienvenue sur PayKal !')
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }

  if (confirmationSent) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-head">
            <div className="logo" aria-hidden="true">
              📧
            </div>
            <h1>Vérifiez votre e-mail</h1>
            <p>
              Un lien de confirmation a été envoyé à <b>{email}</b>. Ouvrez-le puis connectez-vous pour accéder à votre
              espace PayKal.
            </p>
          </div>
          <div className="btn row" style={{ justifyContent: 'center' }}>
            <Link className="btn" to="/connexion">
              Aller à la connexion
            </Link>
          </div>
          <p className="text-muted text-sm" style={{ marginTop: 14, textAlign: 'center' }}>
            Astuce administrateur : désactivez « Confirm email » dans Supabase &gt; Authentication &gt; Providers &gt;
            Email pour activer les comptes immédiatement.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div className="logo" aria-hidden="true">
            💠
          </div>
          <h1>Créer mon compte {APP_NAME}</h1>
          <p>
            Rechargez votre compte par transfert au <b>{TRANSFER_NUMBER}</b>, déposez la capture du reçu et suivez la
            validation.
          </p>
        </div>

        {mode === 'demo' ? (
          <Alert tone="info" title="Mode démonstration">
            Le compte sera créé localement dans votre navigateur (aucune donnée envoyée à Supabase).
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="error" title="Inscription impossible" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={submit} noValidate>
          <Field label="Nom complet" htmlFor="fullName" error={fieldErrors.fullName} required>
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="Awa Diop"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.fullName)}
              required
            />
          </Field>

          <Field label="Adresse e-mail" htmlFor="email" error={fieldErrors.email} required>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              required
            />
          </Field>

          <Field
            label="Téléphone (wave / orange money)"
            htmlFor="phone"
            error={fieldErrors.phone}
            hint="Utilisé pour vérifier l’expéditeur du transfert."
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07 01 02 03 04"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </Field>

          <Field label="Mot de passe" htmlFor="password" error={fieldErrors.password} required hint="6 caractères minimum.">
            <div className="input-group">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                required
              />
              <Button
                type="button"
                variant="secondary"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? '🙈' : '👁️'}
              </Button>
            </div>
          </Field>

          <Field label="Confirmation du mot de passe" htmlFor="confirm" error={fieldErrors.confirm} required>
            <Input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-invalid={Boolean(fieldErrors.confirm)}
              required
            />
          </Field>

          <Button type="submit" block loading={loading || submitting} icon="✨">
            Créer mon compte
          </Button>
        </form>

        <div className="auth-foot">
          Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
        </div>
      </div>
    </div>
  )
}
