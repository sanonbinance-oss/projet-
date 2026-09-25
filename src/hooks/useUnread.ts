/* ==========================================================================
 * PayKal — compteur de messages non lus (badges de navigation)
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../context/SessionContext'

/**
 * Client : nombre de messages de l'admin non lus.
 * Admin : somme des messages clients non lus, toutes conversations confondues.
 * Se met à jour au fil des évènements Realtime et toutes les 45 s.
 */
export function useUnreadCount(): { count: number; refresh: () => Promise<void> } {
  const { api, profile, ready, mode } = useSession()
  const [count, setCount] = useState(0)

  const compute = useCallback(async () => {
    if (!profile) {
      setCount(0)
      return
    }
    try {
      if (profile.role === 'admin') {
        const threads = await api.listThreads()
        setCount(threads.reduce((total, thread) => total + thread.unread, 0))
      } else {
        const messages = await api.listConversation(profile.id)
        setCount(messages.filter((message) => message.sender_role === 'admin' && !message.read_by_client).length)
      }
    } catch {
      /* silencieux : un badge n'est pas critique */
    }
  }, [api, profile])

  useEffect(() => {
    if (!ready) return
    void compute()
  }, [ready, compute])

  useEffect(() => {
    if (!ready) return
    const unsubscribe = api.subscribeRealtime(() => {
      void compute()
    })
    const timer = window.setInterval(() => {
      void compute()
    }, 45000)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [api, ready, compute])

  // En mode démo, on force un recalcul dès qu'un évènement local survient.
  useEffect(() => {
    if (mode !== 'demo') return
    void compute()
  }, [mode, compute])

  return { count, refresh: compute }
}
