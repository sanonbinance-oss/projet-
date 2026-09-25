/* ==========================================================================
 * PayKal — composants d'interface réutilisables
 * ========================================================================== */

import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { STATUS_LABELS } from '../lib/format'
import type { TxStatus } from '../lib/types'

/* -------------------------------- Boutons --------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'light' | 'success' | 'danger' | 'warn'
  size?: 'md' | 'sm' | 'xs'
  block?: boolean
  loading?: boolean
  icon?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const classes = ['btn', variant === 'primary' ? '' : variant, size === 'md' ? '' : size, block ? 'block' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  )
}

/* ------------------------------- Formulaire ------------------------------- */

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
  required?: boolean
}

export function Field({ label, htmlFor, hint, error, children, required }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="hint">{hint}</div>
      ) : null}
    </div>
  )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`.trim()} {...rest} />
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`select ${className}`.trim()} {...rest}>
      {children}
    </select>
  )
}

/* --------------------------------- Cartes --------------------------------- */

export function Card({
  title,
  action,
  children,
  className = '',
  tight = false,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  tight?: boolean
}) {
  return (
    <section className={`card ${tight ? 'tight' : ''} ${className}`.trim()}>
      {title || action ? (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'accent' | 'pending' | 'approved' | 'rejected'
}) {
  return (
    <div className={`stat ${tone === 'default' ? '' : tone}`.trim()}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}

/* --------------------------------- Badges --------------------------------- */

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function StatusBadge({ status }: { status: TxStatus }) {
  const icon = status === 'approved' ? '✓' : status === 'rejected' ? '✕' : '⏳'
  return (
    <Badge tone={status}>
      <span aria-hidden="true">{icon}</span>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

/* ------------------------------- Divers ---------------------------------- */

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const parts = (name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const label =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : ''}`.trim()} aria-hidden="true">
      {label}
    </span>
  )
}

export function Spinner({ dark = false, large = false }: { dark?: boolean; large?: boolean }) {
  return <span className={`spinner ${dark ? 'dark' : ''} ${large ? 'lg' : ''}`.trim()} role="status" aria-label="Chargement" />
}

export function EmptyState({
  icon = '📭',
  title,
  message,
  action,
}: {
  icon?: string
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="icon" aria-hidden="true">
        {icon}
      </div>
      <div className="t">{title}</div>
      {message ? <p className="text-sm">{message}</p> : null}
      {action}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  onClose,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success'
  title?: string
  children: ReactNode
  onClose?: () => void
}) {
  const icon = tone === 'error' ? '⛔' : tone === 'warn' ? '⚠️' : tone === 'success' ? '✅' : 'ℹ️'
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <span className="icon" aria-hidden="true">
        {icon}
      </span>
      <div className="body">
        {title ? <b>{title}</b> : null}
        {children}
      </div>
      {onClose ? (
        <button className="close" onClick={onClose} aria-label="Fermer l’alerte">
          ×
        </button>
      ) : null}
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton" key={index} />
      ))}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  actions?: ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-head">
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer">
            ✕
          </Button>
        </div>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  )
}

/** Petit sélecteur d'options (méthode de paiement, filtres...). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="chips" role="group">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={`chip ${option.value === value ? 'active' : ''}`.trim()}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Champ « copier » lisible (numéro de transfert, référence...). */
export function CopyButton({
  value,
  label = 'Copier',
  onCopied,
}: {
  value: string
  label?: string
  onCopied?: () => void
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon="📋"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          onCopied?.()
        } catch {
          // Repli pour les navigateurs sans API clipboard (http:// local)
          const area = document.createElement('textarea')
          area.value = value
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          area.remove()
          onCopied?.()
        }
      }}
    >
      {label}
    </Button>
  )
}

/** Aide-mémoire : convertit un <input type="file"> en appel unique. */
export function fileFromEvent(event: ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files && event.target.files.length > 0 ? event.target.files[0] : null
}
