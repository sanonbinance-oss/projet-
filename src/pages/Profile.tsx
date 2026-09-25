/* ==========================================================================
 * PayKal — profil et paramètres du client
 * ========================================================================== */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Alert, Avatar, Button, Card, Field, Input } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { APP_VERSION, SUPABASE_URL, TRANSFER_NUMBER, USING_FALLBACK } from '../lib/config'
import { resetDemoData } from '../lib/demoApi'
import { describeError, formatDate, formatPhone } from '../lib/format'
import { useInstallPrompt } from '../pwa'

export default function Profile() {
  const { profile, updateProfile, signOut, mode, switchMode } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { canInstall, installed, promptInstall } = useInstallPrompt()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    if (fullName.trim().length < 3) {
      setError('Indiquez votre nom complet (3 caractères minimum).')
      return
    }
    setSaving(true)
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() })
      toast.success('Profil mis à jour', 'Vos informations ont été enregistrées.')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/connexion', { replace: true })
  }

  return (
    <AppShell variant="client">
      <div className="page-head">
        <div>
          <h1>Mon profil</h1>
          <p>Informations utilisées pour vérifier vos transferts.</p>
        </div>
      </div>

      <Card>
        <div className="row-between">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={profile?.full_name || profile?.email || 'PayKal'} size="lg" />
            <div>
              <h2 className="mb-0">{profile?.full_name || 'Client PayKal'}</h2>
              <div className="text-muted text-sm">{profile?.email}</div>
              <div className="pill-row" style={{ marginTop: 6 }}>
                <span className="badge info">Rôle : {profile?.role === 'admin' ? 'Administrateur' : 'Client'}</span>
                <span className="badge neutral">Inscrit le {formatDate(profile?.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <Alert tone="error" title="Enregistrement impossible" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card title="Informations personnelles">
        <Field label="Nom complet" htmlFor="fullName" required>
          <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
        </Field>
        <Field label="Téléphone" htmlFor="phone" hint="Numéro utilisé pour le transfert mobile money.">
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
          />
        </Field>
        <Field label="Adresse e-mail" htmlFor="email" hint="L’e-mail de connexion ne peut pas être modifié ici.">
          <Input id="email" value={profile?.email ?? ''} readOnly disabled />
        </Field>
        <Button icon="💾" loading={saving} onClick={save}>
          Enregistrer
        </Button>
      </Card>

      <Card title="Application & sécurité">
        <dl className="kv">
          <dt>Numéro de transfert</dt>
          <dd>{formatPhone(TRANSFER_NUMBER)}</dd>
          <dt>Backend</dt>
          <dd className="mono">
            {mode === 'demo' ? 'Mode démonstration (localStorage)' : SUPABASE_URL}
            {USING_FALLBACK.any && mode === 'live' ? ' · repli intégré' : ''}
          </dd>
          <dt>Version</dt>
          <dd>PayKal PWA v{APP_VERSION}</dd>
          <dt>Installation</dt>
          <dd>{installed ? 'Application installée ✅' : canInstall ? 'Installable sur cet appareil' : 'Ouvrir dans Chrome/Safari pour installer'}</dd>
        </dl>

        <div className="btn row" style={{ marginTop: 12 }}>
          {canInstall ? (
            <Button
              variant="secondary"
              icon="📲"
              onClick={async () => {
                const accepted = await promptInstall()
                if (accepted) toast.success('PayKal installé', 'Retrouvez l’icône sur votre écran d’accueil.')
              }}
            >
              Installer l’application
            </Button>
          ) : null}
          <Button variant="secondary" icon="💬" onClick={() => navigate('/messages')}>
            Contacter l’administration
          </Button>
          <Link className="btn secondary" to="/diagnostic">
            🩺 Diagnostic technique
          </Link>
        </div>
      </Card>

      <Card title="Zone de test">
        <p className="text-muted text-sm">
          Mode de données actuel : <b>{mode === 'demo' ? 'Démonstration (local)' : 'Réel (Supabase)'}</b>.
        </p>
        <div className="btn row">
          {mode === 'live' ? (
            <Button variant="warn" size="sm" onClick={() => switchMode('demo')}>
              🧪 Basculer en mode démonstration
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => switchMode('live')}>
                🛰️ Revenir au mode réel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="♻️"
                onClick={() => {
                  resetDemoData()
                  toast.info('Données de démonstration réinitialisées', 'Rechargez la page pour repartir des jeux d’essai.')
                }}
              >
                Réinitialiser la démo
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card>
        <Button variant="danger" block icon="⏻" onClick={handleSignOut}>
          Se déconnecter
        </Button>
      </Card>
    </AppShell>
  )
}
