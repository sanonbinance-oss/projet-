/* ==========================================================================
 * PayKal — tableau de bord administrateur
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { ProofViewer } from '../../components/ProofViewer'
import { ReviewDialog } from '../../components/ReviewDialog'
import { TransactionCard } from '../../components/TransactionCard'
import { Alert, Button, Card, EmptyState, SkeletonList, Stat } from '../../components/ui'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import { CURRENCY } from '../../lib/config'
import { describeError, formatAmountShort, formatRelative } from '../../lib/format'
import type { AppStats, ThreadSummary, Transaction } from '../../lib/types'

export default function AdminDashboard() {
  const { api, profile } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [pending, setPending] = useState<Transaction[]>([])
  const [recent, setRecent] = useState<Transaction[]>([])
  const [stats, setStats] = useState<AppStats | null>(null)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Transaction | null>(null)
  const [reviewing, setReviewing] = useState<{ transaction: Transaction; action: 'approved' | 'rejected' } | null>(null)

  const load = useCallback(async () => {
    try {
      const [all, summary, threadList] = await Promise.all([
        api.listTransactions({ limit: 60 }),
        api.stats(),
        api.listThreads(),
      ])
      setPending(all.filter((transaction) => transaction.status === 'pending'))
      setRecent(all.slice(0, 5))
      setStats(summary)
      setThreads(threadList.slice(0, 4))
      setError(null)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const unsubscribe = api.subscribeRealtime(() => {
      void load()
    })
    return () => {
      unsubscribe()
    }
  }, [api, load])

  const unreadTotal = threads.reduce((total, thread) => total + thread.unread, 0)

  return (
    <AppShell variant="admin">
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <p>
            Connecté en tant que <b>{profile?.full_name || profile?.email}</b> · gestion des transactions et de la
            messagerie.
          </p>
        </div>
        <div className="btn row">
          <Button variant="secondary" icon="🔄" onClick={() => void load()} loading={loading}>
            Actualiser
          </Button>
          <Button icon="💳" onClick={() => navigate('/admin/transactions')}>
            Toutes les transactions
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="error" title="Chargement impossible">
          {error}
        </Alert>
      ) : null}

      <div className="grid cols-4 mb-2">
        <Stat label="En attente" value={stats?.pending ?? '—'} tone="pending" sub="À traiter" />
        <Stat
          label="Validé"
          value={stats?.approved ?? '—'}
          tone="approved"
          sub={stats ? formatAmountShort(stats.approvedAmount, CURRENCY) : ''}
        />
        <Stat label="Refusé" value={stats?.rejected ?? '—'} tone="rejected" />
        <Stat
          label="Clients"
          value={stats?.clients ?? '—'}
          sub={stats ? `${stats.total} demandes au total` : ''}
        />
      </div>

      {stats && stats.pendingAmount > 0 ? (
        <Alert tone="warn" title="Rechargements en attente de validation">
          {formatAmountShort(stats.pendingAmount, CURRENCY)} de transferts déclarés restent à vérifier. Comparez chaque
          capture au relevé du numéro PayKal avant de valider.
        </Alert>
      ) : null}

      <Card
        title={`File d’attente de validation (${pending.length})`}
        action={
          pending.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/transactions')}>
              Traiter tout
            </Button>
          ) : null
        }
      >
        {loading ? (
          <SkeletonList count={2} />
        ) : pending.length === 0 ? (
          <EmptyState icon="🎉" title="Aucune demande en attente" message="Tous les paiements reçus ont été traités." />
        ) : (
          <div className="tx-list">
            {pending.slice(0, 4).map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                showClient
                onViewProof={setViewing}
              >
                <Button
                  variant="success"
                  size="sm"
                  icon="✅"
                  onClick={() => setReviewing({ transaction, action: 'approved' })}
                >
                  Valider
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon="⛔"
                  onClick={() => setReviewing({ transaction, action: 'rejected' })}
                >
                  Refuser
                </Button>
              </TransactionCard>
            ))}
          </div>
        )}
      </Card>

      <div className="grid cols-2">
        <Card
          title="Messagerie des clients"
          action={
            <Link className="btn ghost sm" to="/admin/messages">
              Ouvrir {unreadTotal > 0 ? `(${unreadTotal} non lus)` : ''}
            </Link>
          }
        >
          {threads.length === 0 ? (
            <p className="text-muted text-sm mb-0">Aucune conversation pour l’instant.</p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.user_id}
                type="button"
                className="thread"
                onClick={() => navigate(`/admin/messages?client=${thread.user_id}`)}
              >
                <div className="row">
                  <div>
                    <div className="t">{thread.full_name}</div>
                    <div className="d">{thread.last_message}</div>
                  </div>
                  {thread.unread > 0 ? <span className="unread">{thread.unread}</span> : null}
                </div>
                <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                  {formatRelative(thread.last_message_at)}
                </div>
              </button>
            ))
          )}
        </Card>

        <Card
          title="Dernières activités"
          action={
            <Link className="btn ghost sm" to="/admin/transactions">
              Journal complet
            </Link>
          }
        >
          {loading ? (
            <SkeletonList count={2} />
          ) : recent.length === 0 ? (
            <p className="text-muted text-sm mb-0">Aucune transaction enregistrée.</p>
          ) : (
            <div className="tx-list">
              {recent.map((transaction) => (
                <TransactionCard key={transaction.id} transaction={transaction} showClient onViewProof={setViewing} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Raccourcis administration">
        <div className="grid cols-3">
          <Button variant="secondary" icon="💳" onClick={() => navigate('/admin/transactions')}>
            Transactions
          </Button>
          <Button variant="secondary" icon="💬" onClick={() => navigate('/admin/messages')}>
            Messagerie globale
          </Button>
          <Button variant="secondary" icon="👥" onClick={() => navigate('/admin/clients')}>
            Fichier clients
          </Button>
          <Button variant="secondary" icon="🩺" onClick={() => navigate('/diagnostic')}>
            Diagnostic
          </Button>
          <Button
            variant="secondary"
            icon="⬇️"
            onClick={() => {
              void load()
              toast.info('Données rafraîchies', 'Les exportations CSV se font depuis l’écran Transactions.')
            }}
          >
            Rafraîchir les données
          </Button>
        </div>
      </Card>

      {viewing ? <ProofViewer transaction={viewing} onClose={() => setViewing(null)} /> : null}
      {reviewing ? (
        <ReviewDialog
          transaction={reviewing.transaction}
          action={reviewing.action}
          onClose={() => setReviewing(null)}
          onDone={() => void load()}
        />
      ) : null}
    </AppShell>
  )
}
