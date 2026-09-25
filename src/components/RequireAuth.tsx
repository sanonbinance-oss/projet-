/* ==========================================================================
 * PayKal — garde de routes (client / administrateur)
 * ========================================================================== */

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { Spinner } from './ui'
import type { Role } from '../lib/types'

export function FullScreenLoader({ message = 'Ouverture de PayKal…' }: { message?: string }) {
  return (
    <div className="loading-screen">
      <div>
        <Spinner dark large />
        <p style={{ marginTop: 12 }}>{message}</p>
      </div>
    </div>
  )
}

export function RequireAuth({ role, children }: { role: Role; children: ReactNode }) {
  const { ready, profile } = useSession()
  const location = useLocation()

  if (!ready) return <FullScreenLoader />

  if (!profile) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname, role }} />
  }

  // Un administrateur connecté n'a rien à faire dans l'espace client (et inversement).
  if (profile.role !== role) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/'} replace />
  }

  return <>{children}</>
}

/** Redirige un utilisateur déjà connecté depuis /connexion ou /inscription. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { ready, profile } = useSession()
  if (!ready) return <FullScreenLoader />
  if (profile) return <Navigate to={profile.role === 'admin' ? '/admin' : '/'} replace />
  return <>{children}</>
}
