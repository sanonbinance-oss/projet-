/* ==========================================================================
 * PayKal — intégration PWA (Service Worker + invite d'installation)
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Enregistre le Service Worker (`/sw.js`, à la racine de dist/).
 * Désactivé en développement pour ne pas masquer les modifications de code.
 */
export function registerServiceWorker(onUpdateReady?: () => void): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdateReady?.()
              try {
                registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
              } catch {
                /* ignoré */
              }
            }
          })
        })
      })
      .catch((error) => {
        console.warn('[PayKal] Service Worker non enregistré :', error)
      })
  })
}

/** État de l'installation PWA (bouton « Installer l'application »). */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    return Boolean(standalone)
  })

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
    return choice.outcome === 'accepted'
  }, [promptEvent])

  return { canInstall: Boolean(promptEvent) && !installed, installed, promptInstall }
}

/** Suit l'état du réseau (bandeau hors-ligne). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
