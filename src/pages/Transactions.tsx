/* ==========================================================================
 * PayKal — suivi des demandes de rechargement (espace client)
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ProofViewer } from '../components/ProofViewer'
import { TransactionCard } from '../components/TransactionCard'
import { Alert, Button, Card, Chips, EmptyState, SkeletonList, Stat } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { CURRENCY } from '../lib/config'
import { describeError, formatAmountShort } from '../lib/format'
import type { Transaction, TxStatus } from '../lib/types'

type Filter = TxStatus | 'all'

export default function Transactions() {
  const { api, profile } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Transaction | null>(null)
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!profile) return
      if (!silent) setLoading(true)
      try {
        const rows = await api.listTransactions({ userId: profile.id, status: filter })
        setTransactions(rows)
        setError(null)
      } catch (err) {
        setError(describeError(err))
      } finally {
        setLoading(false)
      }
    },
    [api, profile, filter],
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

  const handleReceipt = async (transaction: Transaction) => {
    setReceiptBusy(transaction.id)
    try {
      const { downloadReceipt, fetchProofAsDataUrl } = await import('../lib/pdf')
      const url = transaction.proof_path ? await api.getProofUrl(transaction.proof_path) : null
      const proofDataUrl = await fetchProofAsDataUrl(url)
      downloadReceipt(transaction, { proofDataUrl })
      toast.success('Reçu PDF généré', transaction.reference)
    } catch (err) {
      toast.error('Reçu PDF impossible', describeError(err))
    } finally {
      setReceiptBusy(null)
    }
  }

  const approved = transactions.filter((transaction) => transaction.status === 'approved')
  const pending = transactions.filter((transaction) => transaction.status === 'pending')

  return (
    <AppShell variant="client">
      <div className="page-head">
        <div>
          <h1>Mes demandes de rechargement</h1>
          <p>Statut en temps réel : En attente → Validé / Refusé, avec reçu PDF téléchargeable.</p>
        </div>
        <Button variant="secondary" icon="🔄" onClick={() => void load()} loading={loading}>
          Actualiser
        </Button>
      </div>

      <div className="grid cols-3 mb-2">
        <Stat label="En attente" value={pending.length} tone="pending" />
        <Stat
          label="Validé"
          value={approved.length}
          tone="approved"
          sub={formatAmountShort(
            approved.reduce((sum, transaction) => sum + transaction.amount, 0),
            CURRENCY,
          )}
        />
        <Stat
          label="Total affiché"
          value={transactions.length}
          sub={filter === 'all' ? 'Toutes les demandes' : 'Filtre actif'}
        />
      </div>

      <Card tight>
        <Chips<Filter>
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'pending', label: '⏳ En attente' },
            { value: 'approved', label: '✅ Validé' },
            { value: 'rejected', label: '❌ Refusé' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Card>

      {error ? <Alert tone="error" title="Chargement impossible">{error}</Alert> : null}

      {loading ? (
        <SkeletonList count={3} />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="Aucune demande à afficher"
          message="Déposez une nouvelle demande de rechargement pour la voir apparaître ici avec son statut."
          action={
            <Button icon="💳" onClick={() => navigate('/recharger')} style={{ marginTop: 10 }}>
              Nouvelle recharge
            </Button>
          }
        />
      ) : (
        <div className="tx-list">
          {transactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              receiptLoading={receiptBusy === transaction.id}
              onViewProof={setViewing}
              onDownloadReceipt={handleReceipt}
            >
              <Button variant="ghost" size="sm" icon="💬" onClick={() => navigate(`/messages?ref=${transaction.reference}`)}>
                Demander une précision
              </Button>
            </TransactionCard>
          ))}
        </div>
      )}

      {viewing ? <ProofViewer transaction={viewing} onClose={() => setViewing(null)} /> : null}
    </AppShell>
  )
}
