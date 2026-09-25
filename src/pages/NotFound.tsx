/* ==========================================================================
 * PayKal — page 404 (route inconnue)
 * ========================================================================== */

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useSession } from '../context/SessionContext'

export default function NotFound() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useSession()

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <div className="logo" aria-hidden="true">
            🧭
          </div>
          <h1>Page introuvable</h1>
          <p>
            La route <span className="mono">{location.pathname}</span> n’existe pas dans PayKal.
          </p>
        </div>

        <Card>
          <p className="text-muted text-sm">
            Si vous êtes arrivé ici après un rafraîchissement de page, vérifiez que le fichier{' '}
            <span className="mono">_redirects</span> (règle <span className="mono">/* /index.html 200</span>) est bien
            présent à la racine du site Netlify.
          </p>
          <div className="btn row">
            <Button
              icon="🏠"
              onClick={() => navigate(profile?.role === 'admin' ? '/admin' : '/', { replace: true })}
            >
              Retour à l’accueil
            </Button>
            <Link className="btn secondary" to="/diagnostic">
              🩺 Diagnostic
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
