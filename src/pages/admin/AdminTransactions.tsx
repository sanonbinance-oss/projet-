/* ==========================================================================
 * PayKal — gestion des transactions (administrateur)
 * Vue détaillée des paiements reçus + validation / refus
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '../../components/AppShell'
import { ProofViewer } from '../../components/ProofViewer'
import { ReviewDialog } from '../../components/ReviewDialog'
import { TransactionCard } from '../../components/TransactionCard'
import { Alert, Button, Card, Chips, EmptyState, Input, SkeletonList, Stat } from '../../components/ui'
import { useSession } from '../../context/SessionContext'
import { useToast } from '../../context/ToastContext'
import { CURRENCY } from '../../lib/config'
import { describeError, formatAmountShort } from '../../lib/format'
import type { Transaction, TxStatus } from '../../lib/types'

type Filter = TxStatus | 'all'

export default function AdminTransactions() {
  const { api } = useSession()
  const { toast } = useToast()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Transaction | null>(null)
  const [reviewing, setReviewing] = useState<{ transaction: Transaction; action: 'approved' | 'rejected' } | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const rows = await api.listTransactions({ status: filter })
        setTransactions(rows)
        setError(null)
      } catch (err) {
        setError(describeError(err))
      } finally {
        setLoading(false)
      }
    },
    [api, filter],
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

  const visible = transactions.filter((transaction) => {
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return [
      transaction.reference,
      transaction.client?.full_name,
      transaction.client?.email,
      transaction.client?.phone,
      transaction.sender_name,
      transaction.sender_phone,
      String(transaction.amount),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  })

  const totals = visible.reduce(
    (accumulator, transaction) => {
      accumulator.count += 1
      accumulator.amount += transaction.amount
      return accumulator
    },
    { count: 0, amount: 0 },
  )

  return (
    <AppShell variant="admin">
      <div className="page-head">
        <div>
          <h1>Transactions & validations</h1>
          <p>Vérifiez la capture du reçu, puis validez ou refusez chaque paiement reçu.</p>
        </div>
        <div className="btn row">
          <Button variant="secondary" icon="🔄" onClick={() => void load()} loading={loading}>
            Actualiser
          </Button>
          <Button
            variant="secondary"
            icon="⬇️"
            onClick={async () => {
              try {
                const { downloadTransactionsCsv } = await import('../../lib/csv')
                downloadTransactionsCsv(visible)
                toast.success('Export CSV généré', `${visible.length} transaction(s) exportée(s).`)
              } catch (err) {
                toast.error('Export impossible', describeError(err))
              }
            }}
          >
            Exporter CSV
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="error" title="Chargement impossible">
          {error}
        </Alert>
      ) : null}

      <div className="grid cols-3 mb-2">
        <Stat label="Transactions affichées" value={totals.count} />
        <Stat label="Montant cumulé affiché" value={formatAmountShort(totals.amount, CURRENCY)} />
        <Stat
          label="Filtre actif"
          value={filter === 'all' ? 'Toutes' : filter === 'pending' ? 'En attente' : filter === 'approved' ? 'Validées' : 'Refusées'}
          sub={search ? `Recherche : « ${search} »` : 'Aucune recherche'}
        />
      </div>

      <Card tight>
        <div className="grid" style={{ gap: 12 }}>
          <Chips<Filter>
            options={[
              { value: 'pending', label: '⏳ En attente' },
              { value: 'approved', label: '✅ Validées' },
              { value: 'rejected', label: '❌ Refusées' },
              { value: 'all', label: 'Toutes' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une référence, un client, un numéro ou un montant…"
            aria-label="Rechercher une transaction"
          />
        </div>
      </Card>

      {loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Aucune transaction à afficher"
          message="Modifiez le filtre ou la recherche. Les nouvelles demandes apparaissent automatiquement."
        />
      ) : (
        <div className="tx-list">
          {visible.map((transaction) => (
            <TransactionCard key={transaction.id} transaction={transaction} showClient onViewProof={setViewing}>
              {transaction.status === 'pending' ? (
                <>
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
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="♻️"
                  onClick={() => setReviewing({ transaction, action: 'approved' })}
                  title="Modifier la décision"
                >
                  Corriger la décision
                </Button>
              )}
            </TransactionCard>
          ))}
        </div>
      )}

      {viewing ? <ProofViewer transaction={viewing} onClose={() => setViewing(null)} /> : null}
      {reviewing ? (
        <ReviewDialog
          transaction={reviewing.transaction}
          action={reviewing.action}
          onClose={() => setReviewing(null)}
          onDone={() => void load(true)}
        />
      ) : null}
    </AppShell>
  )
}
