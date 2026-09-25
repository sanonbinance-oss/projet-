/* ==========================================================================
 * PayKal — point d'entrée de l'application
 * ========================================================================== */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalErrorHandlers } from './lib/diagnostics'
import { registerServiceWorker } from './pwa'
import './styles.css'

installGlobalErrorHandlers()

const container = document.getElementById('root')
if (!container) {
  throw new Error('Élément #root introuvable dans index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* PWA : le Service Worker est enregistré uniquement en production. */
registerServiceWorker(() => {
  console.info('[PayKal] Nouvelle version disponible : elle sera appliquée au prochain chargement.')
})
