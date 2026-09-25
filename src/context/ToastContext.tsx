/* ==========================================================================
 * PayKal — système de notifications (toasts)
 * --------------------------------------------------------------------------
 * `toast` est une fonction appelable qui expose aussi des raccourcis :
 *   toast({ kind: 'success', title: '…' })
 *   toast.success('Titre', 'Message optionnel')
 * ========================================================================== */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastInput {
  kind?: ToastKind
  title: string
  message?: string
  durationMs?: number
}

export interface ToastFn {
  (input: ToastInput): void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
}

interface Toast extends Required<Omit<ToastInput, 'durationMs'>> {
  id: number
}

interface ToastContextValue {
  toast: ToastFn
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastKind, string> = {
  success: '✅',
  error: '⛔',
  info: 'ℹ️',
  warning: '⚠️',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    ({ kind = 'info', title, message = '', durationMs }: ToastInput) => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-4), { id, kind, title, message }])
      const timeout = durationMs ?? (kind === 'error' ? 9000 : kind === 'warning' ? 7000 : 4500)
      window.setTimeout(() => remove(id), timeout)
    },
    [remove],
  )

  const toast = useMemo<ToastFn>(() => {
    const callable = ((input: ToastInput) => push(input)) as ToastFn
    callable.success = (title, message) => push({ kind: 'success', title, message })
    callable.error = (title, message) => push({ kind: 'error', title, message })
    callable.info = (title, message) => push({ kind: 'info', title, message })
    callable.warning = (title, message) => push({ kind: 'warning', title, message })
    return callable
  }, [push])

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`toast ${item.kind}`}
            onClick={() => remove(item.id)}
            title="Cliquer pour fermer"
          >
            <span aria-hidden="true">{ICONS[item.kind]}</span>
            <div>
              <div className="t">{item.title}</div>
              {item.message ? <div className="m">{item.message}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast() doit être utilisé à l’intérieur de <ToastProvider>.')
  return context
}
