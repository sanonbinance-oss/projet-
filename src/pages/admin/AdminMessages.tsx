/* ==========================================================================
 * PayKal — messagerie globale (administrateur)
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { ChatView } from '../../components/ChatView'
import { Alert, Button, Card, EmptyState, Input, SkeletonList } from '../../components/ui'
import { useSession } from '../../context/SessionContext'
import { describeError, formatRelative } from '../../lib/format'
import type { ThreadSummary } from '../../lib/types'

export default function AdminMessages() {
  const { api } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const selected = searchParams.get('client')

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const rows = await api.listThreads()
        setThreads(rows)
        setError(null)
        // Sélection automatique de la première conversation
        if (!searchParams.get('client') && rows.length > 0) {
          setSearchParams({ client: rows[0].user_id }, { replace: true })
        }
      } catch (err) {
        setError(describeError(err))
      } finally {
        setLoading(false)
      }
    },
    [api, searchParams, setSearchParams],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsubscribe = api.subscribeRealtime(() => {
      void load(true)
    })
    return () => {
      unsubscribe()
    }
  }, [api, load])

  const visibleThreads = threads.filter((thread) => {
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return [thread.full_name, thread.email, thread.phone, thread.last_message].some((value) =>
      value.toLowerCase().includes(needle),
    )
  })

  const currentThread = threads.find((thread) => thread.user_id === selected) ?? null
  const unreadTotal = threads.reduce((total, thread) => total + thread.unread, 0)

  return (
    <AppShell variant="admin">
      <div className="page-head">
        <div>
          <h1>Messagerie globale</h1>
          <p>
            {threads.length} conversation(s) · {unreadTotal} message(s) client non lu(s)
          </p>
        </div>
        <Button variant="secondary" icon="🔄" onClick={() => void load()} loading={loading}>
          Actualiser
        </Button>
      </div>

      {error ? (
        <Alert tone="error" title="Messagerie indisponible">
          {error}
        </Alert>
      ) : null}

      <div className="grid cols-2" style={{ alignItems: 'start', gridTemplateColumns: currentThread ? undefined : '1fr' }}>
        <Card title="Conversations" tight>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un client…"
            aria-label="Rechercher une conversation"
          />
          <div style={{ marginTop: 10 }}>
            {loading ? (
              <SkeletonList count={3} />
            ) : visibleThreads.length === 0 ? (
              <EmptyState icon="💬" title="Aucune conversation" message="Les échanges clients apparaîtront ici." />
            ) : (
              visibleThreads.map((thread) => (
                <button
                  key={thread.user_id}
                  type="button"
                  className={`thread ${thread.user_id === selected ? 'active' : ''}`.trim()}
                  onClick={() => setSearchParams({ client: thread.user_id })}
                >
                  <div className="row">
                    <div>
                      <div className="t">{thread.full_name}</div>
                      <div className="d">{thread.last_message}</div>
                    </div>
                    {thread.unread > 0 ? <span className="unread">{thread.unread}</span> : null}
                  </div>
                  <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                    {thread.last_sender_role === 'admin' ? 'Vous : ' : ''}
                    {formatRelative(thread.last_message_at)} · {thread.message_count} message(s)
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {currentThread ? (
          <ChatView
            key={currentThread.user_id}
            role="admin"
            conversationUserId={currentThread.user_id}
            title={currentThread.full_name}
            subtitle={`${currentThread.email}${currentThread.phone ? ` · ${currentThread.phone}` : ''}`}
            emptyMessage="Aucun message dans cette conversation. Vous pouvez démarrer l’échange."
            onSent={() => void load(true)}
          />
        ) : (
          <Card>
            <EmptyState
              icon="👈"
              title="Sélectionnez une conversation"
              message="Choisissez un client dans la liste pour lire et répondre à ses messages."
            />
          </Card>
        )}
      </div>
    </AppShell>
  )
}
