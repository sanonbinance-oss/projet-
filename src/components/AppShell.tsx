/* ==========================================================================
 * PayKal — coquille applicative : en-tête, navigation, bandeaux d'état
 * ========================================================================== */

import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE, APP_VERSION, TRANSFER_NUMBER } from '../lib/config'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { useUnreadCount } from '../hooks/useUnread'
import { useInstallPrompt, useOnlineStatus } from '../pwa'
import { Avatar, Badge, Button } from './ui'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  badge?: number
}

export function AppShell({ variant, children }: { variant: 'client' | 'admin'; children: ReactNode }) {
  const { profile, signOut, mode, switchMode, reachability, retryLive, submitting } = useSession()
  const { toast } = useToast()
  const { count: unread } = useUnreadCount()
  const { canInstall, promptInstall } = useInstallPrompt()
  const online = useOnlineStatus()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const clientNav: NavItem[] = [
    { to: '/', label: 'Accueil', icon: '🏠', end: true },
    { to: '/recharger', label: 'Recharger', icon: '💳' },
    { to: '/transactions', label: 'Demandes', icon: '🧾' },
    { to: '/messages', label: 'Messages', icon: '💬', badge: unread },
  ]

  const adminNav: NavItem[] = [
    { to: '/admin', label: 'Tableau de bord', icon: '📊', end: true },
    { to: '/admin/transactions', label: 'Transactions', icon: '💳', badge: unread },
    { to: '/admin/messages', label: 'Messagerie', icon: '💬' },
    { to: '/admin/clients', label: 'Clients', icon: '👥' },
    { to: '/diagnostic', label: 'Diagnostic', icon: '🩺' },
  ]

  const nav = variant === 'admin' ? adminNav : clientNav

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      toast.info('Déconnexion réussie', 'À bientôt sur PayKal.')
      navigate('/connexion', { replace: true })
    } catch (error) {
      toast.error('Déconnexion impossible', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <NavLink to={variant === 'admin' ? '/admin' : '/'} className="brand">
          <span className="brand-logo" aria-hidden="true">
            💠
          </span>
          <span>
            {APP_NAME}
            <small>{variant === 'admin' ? 'Espace administration' : APP_TAGLINE}</small>
          </span>
        </NavLink>

        <span className="header-spacer" />

        <div className="header-actions">
          {mode === 'demo' ? <Badge tone="live">MODE DÉMO</Badge> : null}
          {canInstall ? (
            <Button
              variant="light"
              size="sm"
              icon="📲"
              onClick={async () => {
                const accepted = await promptInstall()
                if (accepted) toast.success('PayKal installé', 'L’application est maintenant sur votre écran d’accueil.')
              }}
              title="Installer PayKal sur cet appareil"
            >
              <span className="nowrap">Installer</span>
            </Button>
          ) : null}
          <NavLink to={variant === 'admin' ? '/admin/clients' : '/profil'} className="user-chip" title="Mon profil">
            <Avatar name={profile?.full_name || profile?.email || 'PayKal'} />
            <span className="name">{profile?.full_name || profile?.email}</span>
          </NavLink>
          <Button variant="light" size="sm" onClick={handleSignOut} loading={busy || submitting} title="Se déconnecter">
            ⏻
          </Button>
        </div>
      </header>

      {/* Bandeau hors-ligne */}
      {!online ? (
        <div className="mode-banner" style={{ background: 'var(--red-100)', borderColor: '#fca5a5', color: '#7f1d1d' }}>
          <span aria-hidden="true">📴</span>
          Vous êtes hors-ligne : les demandes déposées hors connexion devront être renvoyées une fois le réseau rétabli.
        </div>
      ) : null}

      {/* Bandeau mode démonstration */}
      {mode === 'demo' ? (
        <div className="mode-banner">
          <span aria-hidden="true">🧪</span>
          Mode démonstration : données locales, aucun appel Supabase.
          {reachability.ok ? (
            <Button variant="secondary" size="xs" loading={busy} onClick={() => switchMode('live')}>
              Revenir au mode réel
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="xs"
              onClick={async () => {
                setBusy(true)
                await retryLive()
                setBusy(false)
              }}
              loading={busy}
            >
              Retester Supabase
            </Button>
          )}
        </div>
      ) : null}

      {/* Bandeau Supabase injoignable */}
      {mode === 'live' && reachability.checked && !reachability.ok ? (
        <div className="mode-banner">
          <span aria-hidden="true">🛰️</span>
          Supabase est injoignable : {reachability.detail}
          <Button variant="secondary" size="xs" onClick={() => switchMode('demo')}>
            Continuer en mode démo
          </Button>
        </div>
      ) : null}

      <main className="main" style={{ paddingBottom: variant === 'client' ? undefined : 40 }}>
        <nav className="tabs no-print" aria-label="Navigation principale">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `tab ${isActive ? 'active' : ''}`.trim()}
            >
              <span aria-hidden="true">{item.icon}</span> {item.label}
              {item.badge && item.badge > 0 ? <span className="count">{item.badge > 99 ? '99+' : item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        {children}

        <footer className="text-muted text-sm no-print" style={{ marginTop: 26, textAlign: 'center' }}>
          {APP_NAME} v{APP_VERSION} · numéro de transfert officiel <b>{TRANSFER_NUMBER}</b> ·{' '}
          <NavLink to="/diagnostic">Diagnostic</NavLink>
        </footer>
      </main>

      {variant === 'client' ? (
        <nav className="bottom-nav no-print" aria-label="Navigation mobile">
          {clientNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
              {item.badge && item.badge > 0 ? <span className="dot">{item.badge > 9 ? '9+' : item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
