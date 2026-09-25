/* ==========================================================================
 * PayKal — contexte de session (authentification + mode de données)
 * ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getApi, getDataMode, onDataModeChange, pingSupabase, setDataMode } from '../lib/backend'
import { describeError } from '../lib/format'
import type { Api, DataMode, Profile, Role, SignUpResult } from '../lib/types'
import { useToast } from './ToastContext'

interface Reachability {
  checked: boolean
  ok: boolean
  detail: string
}

interface SessionValue {
  ready: boolean
  profile: Profile | null
  role: Role | null
  isAdmin: boolean
  api: Api
  mode: DataMode
  submitting: boolean
  reachability: Reachability
  backendError: string | null
  signIn: (email: string, password: string) => Promise<Profile>
  signUp: (input: { email: string; password: string; fullName: string; phone?: string }) => Promise<SignUpResult>
  signOut: () => Promise<void>
  updateProfile: (patch: { fullName?: string; phone?: string }) => Promise<void>
  refresh: () => Promise<void>
  switchMode: (next: DataMode) => void
  retryLive: () => Promise<boolean>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const [api, setApi] = useState<Api>(() => getApi())
  const [mode, setMode] = useState<DataMode>(() => getDataMode())
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [reachability, setReachability] = useState<Reachability>({ checked: false, ok: true, detail: '' })

  /** Recharge le profil depuis le backend courant. */
  const refresh = useCallback(async () => {
    try {
      const current = await api.getCurrentProfile()
      setProfile(current)
      setBackendError(null)
    } catch (error) {
      setProfile(null)
      setBackendError(describeError(error))
    }
  }, [api])

  /* Démarrage : on vérifie la joignabilité du backend puis on restaure la session. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let ping: { ok: boolean; detail: string }
      if (mode === 'demo') {
        ping = { ok: true, detail: 'Mode démonstration actif : aucune donnée ne quitte votre appareil.' }
      } else {
        ping = await pingSupabase()
      }
      if (cancelled) return
      setReachability({ checked: true, ...ping })
      await refresh()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, refresh])

  /* Changements d'état d'authentification (connexion, déconnexion, refresh token). */
  useEffect(() => {
    const unsubscribe = api.onAuthStateChange(() => {
      void refresh()
    })
    return () => {
      unsubscribe()
    }
  }, [api, refresh])

  /* Bascule live <-> démo. */
  useEffect(() => {
    const unsubscribe = onDataModeChange((next) => {
      setMode(next)
      setApi(getApi())
      setProfile(null)
      setReady(false)
      setReachability({ checked: false, ok: true, detail: '' })
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setSubmitting(true)
      try {
        const result = await api.signIn(email, password)
        setProfile(result)
        return result
      } finally {
        setSubmitting(false)
      }
    },
    [api],
  )

  const signUp = useCallback(
    async (input: { email: string; password: string; fullName: string; phone?: string }) => {
      setSubmitting(true)
      try {
        const result = await api.signUp(input)
        if (result.profile) setProfile(result.profile)
        return result
      } finally {
        setSubmitting(false)
      }
    },
    [api],
  )

  const signOut = useCallback(async () => {
    setSubmitting(true)
    try {
      await api.signOut()
      setProfile(null)
    } finally {
      setSubmitting(false)
    }
  }, [api])

  const updateProfile = useCallback(
    async (patch: { fullName?: string; phone?: string }) => {
      const updated = await api.updateProfile(patch)
      setProfile(updated)
    },
    [api],
  )

  const switchMode = useCallback(
    (next: DataMode) => {
      if (next === mode) return
      setDataMode(next)
    },
    [mode],
  )

  const retryLive = useCallback(async () => {
    setReachability({ checked: false, ok: true, detail: '' })
    const ping = await pingSupabase()
    setReachability({ checked: true, ...ping })
    if (ping.ok) {
      setDataMode('live')
      toast.success('Connexion Supabase rétablie', ping.detail)
      return true
    }
    toast.error('Supabase toujours injoignable', ping.detail)
    return false
  }, [toast])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      profile,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      api,
      mode,
      submitting,
      reachability,
      backendError,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refresh,
      switchMode,
      retryLive,
    }),
    [
      ready,
      profile,
      api,
      mode,
      submitting,
      reachability,
      backendError,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refresh,
      switchMode,
      retryLive,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession() doit être utilisé à l’intérieur de <SessionProvider>.')
  return context
}
