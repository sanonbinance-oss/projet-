/* ==========================================================================
 * PayKal — messagerie (partagée entre l'espace client et l'administration)
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { dayLabel, describeError, formatTime, initials } from '../lib/format'
import type { Message, Role } from '../lib/types'
import { Avatar, Alert, Button, EmptyState, SkeletonList, Textarea } from './ui'

interface ChatViewProps {
  /** Rôle de l'utilisateur qui consulte la conversation. */
  role: Role
  /** Identifiant du CLIENT propriétaire de la conversation. */
  conversationUserId: string
  title: string
  subtitle?: string
  /** Message affiché quand la conversation est vide. */
  emptyMessage?: string
  onSent?: () => void
}

export function ChatView({ role, conversationUserId, title, subtitle, emptyMessage, onSent }: ChatViewProps) {
  const { api, profile } = useSession()
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!conversationUserId) return
      if (!silent) setLoading(true)
      try {
        const rows = await api.listConversation(conversationUserId)
        setMessages(rows)
        setError(null)
        await api.markConversationRead({ conversationUserId, role })
      } catch (err) {
        setError(describeError(err))
      } finally {
        setLoading(false)
      }
    },
    [api, conversationUserId, role],
  )

  useEffect(() => {
    void load()
  }, [load])

  /* Temps réel : rafraîchissement à chaque nouveau message. */
  useEffect(() => {
    const unsubscribe = api.subscribeRealtime(() => {
      void load(true)
    })
    return () => {
      unsubscribe()
    }
  }, [api, load])

  /* Défilement automatique en bas. */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setSending(true)
    try {
      const created = await api.sendMessage({ conversationUserId, body, role })
      setMessages((current) => [...current, created])
      setDraft('')
      onSent?.()
    } catch (err) {
      toast.error('Message non envoyé', describeError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <Avatar name={title} />
        <div>
          <div className="t">{title}</div>
          <div className="d">{subtitle || (role === 'admin' ? 'Conversation client' : 'Administration PayKal')}</div>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="ghost" size="xs" icon="🔄" onClick={() => void load()} title="Actualiser">
            Actualiser
          </Button>
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {error ? <Alert tone="error" title="Messagerie indisponible">{error}</Alert> : null}

        {loading ? (
          <SkeletonList count={4} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon="💬"
            title="Aucun message pour l’instant"
            message={emptyMessage ?? 'Écrivez votre premier message : l’administration répond généralement en quelques instants.'}
          />
        ) : (
          messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null
            const showDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at)
            const mine = message.sender_id === profile?.id
            const isSystem = message.body.startsWith('📥')
            return (
              <div key={message.id} style={{ display: 'contents' }}>
                {showDay ? <div className="day-sep">{dayLabel(message.created_at)}</div> : null}
                <div className={`bubble ${isSystem ? 'system' : mine ? 'me' : 'them'}`}>
                  {!mine && !isSystem ? (
                    <b style={{ display: 'block', fontSize: '0.74rem', opacity: 0.75, marginBottom: 3 }}>
                      {message.sender_role === 'admin' ? 'Administration PayKal' : initials(title)}
                    </b>
                  ) : null}
                  {message.body}
                  <span className="time">{formatTime(message.created_at)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="composer">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={role === 'admin' ? 'Répondre au client…' : 'Écrire à l’administration…'}
          rows={1}
          aria-label="Votre message"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <Button icon="➤" onClick={send} loading={sending} disabled={!draft.trim()}>
          Envoyer
        </Button>
      </div>
    </div>
  )
}
