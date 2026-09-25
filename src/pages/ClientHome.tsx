/* ==========================================================================
 * PayKal — accueil de l'espace client
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Alert, Button, Card, CopyButton, EmptyState, SkeletonList, Stat } from '../components/ui'
import { TransactionCard } from '../components/TransactionCard'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { CURRENCY, QUICK_AMOUNTS, TRANSFER_NUMBER } from '../lib/config'
import { describeError, formatAmountShort, formatPhone, formatRelative } from '../lib/format'
import type { Message, Transaction } from '../lib/types'

export default function ClientHome() {
  const { api, profile, mode } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [lastMessage, setLastMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    try {
      const [rows, messages] = await Promise.all([
        api.listTransactions({ userId: profile.id, limit: 50 }),
        api.listConversation(profile.id),
      ])
      setTransactions(rows)
      setLastMessage(messages.length > 0 ? messages[messages.length - 1] : null)
      setError(null)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [api, profile])

  useEffect(() => {
    void load()
  }, [load])

  const pending = transactions.filter((transaction) => transaction.status === 'pending')
  const approved = transactions.filter((transaction) => transaction.status === 'approved')
  const totalApproved = approved.reduce((sum, transaction) => sum + transaction.amount, 0)

  const handleReceipt = async (transaction: Transaction) => {
    setReceiptBusy(transaction.id)
    try {
      // jsPDF est chargé à la demande : le bundle initial reste léger.
      const { downloadReceipt, fetchProofAsDataUrl } = await import('../lib/pdf')
      const proof = transaction.proof_path ? await api.getProofUrl(transaction.proof_path) : null
      const proofDataUrl = await fetchProofAsDataUrl(proof)
      downloadReceipt(transaction, { proofDataUrl })
      toast.success('Reçu PDF généré', `${transaction.reference} — vérifiez vos téléchargements.`)
    } catch (err) {
      toast.error('Reçu PDF impossible', describeError(err))
    } finally {
      setReceiptBusy(null)
    }
  }

  return (
    <AppShell variant="client">
      <div className="page-head">
        <div>
          <h1>Bonjour {profile?.full_name?.split(' ')[0] || '👋'}</h1>
          <p>Rechargez votre compte, suivez vos demandes et discutez avec l’administration.</p>
        </div>
        <Button icon="💳" onClick={() => navigate('/recharger')}>
          Nouvelle recharge
        </Button>
      </div>

      {error ? (
        <Alert tone="error" title="Chargement partiel">
          {error}
        </Alert>
      ) : null}

      {mode === 'demo' ? (
        <Alert tone="warn" title="Mode démonstration">
          Vous naviguez avec des données locales de test. Utilisez le bouton « Revenir au mode réel » dans le bandeau
          supérieur pour retrouver votre projet Supabase.
        </Alert>
      ) : null}

      {/* Numéro de transfert */}
      <div className="transfer-box mb-2">
        <div className="label">Numéro de transfert PayKal</div>
        <div className="transfer-number">{formatPhone(TRANSFER_NUMBER)}</div>
        <p style={{ margin: '0 0 10px', fontSize: '0.86rem', opacity: 0.9 }}>
          Effectuez le transfert du montant souhaité vers ce numéro (Wave, Orange Money, MTN, Moov…), puis déposez la
          capture du reçu. Votre compte est rechargé après validation par l’administration.
        </p>
        <div className="row">
          <CopyButton
            value={TRANSFER_NUMBER}
            label="Copier le numéro"
            onCopied={() => toast.success('Numéro copié', TRANSFER_NUMBER)}
          />
          <Button variant="light" size="sm" icon="🧾" onClick={() => navigate('/recharger')}>
            Déposer un reçu
          </Button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid cols-3 mb-2">
        <Stat label="Demandes en attente" value={pending.length} tone="pending" sub={pending.length ? 'Traitement sous 24 h' : 'Aucune demande en cours'} />
        <Stat label="Rechargements validés" value={approved.length} tone="approved" sub={formatAmountShort(totalApproved, CURRENCY)} />
        <Stat
          label="Total demandes"
          value={transactions.length}
          tone="default"
          sub={`Devise ${CURRENCY === 'XOF' ? 'FCFA' : CURRENCY}`}
        />
      </div>

      {/* Actions rapides */}
      <Card title="Actions rapides">
        <div className="grid cols-2">
          <Button variant="secondary" icon="💬" onClick={() => navigate('/messages')}>
            Ouvrir la messagerie
          </Button>
          <Button variant="secondary" icon="🧾" onClick={() => navigate('/transactions')}>
            Suivre mes demandes
          </Button>
        </div>
        <div className="sep" />
        <div className="text-muted text-sm">Montants fréquents</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {QUICK_AMOUNTS.slice(0, 5).map((amount) => (
            <button key={amount} type="button" className="chip" onClick={() => navigate(`/recharger?montant=${amount}`)}>
              {formatAmountShort(amount, CURRENCY)}
            </button>
          ))}
        </div>
      </Card>

      {/* Dernier message */}
      {lastMessage ? (
        <Card
          title="Dernier message de l’administration"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/messages')}>
              Répondre
            </Button>
          }
        >
          <p className="mb-0" style={{ fontSize: '0.9rem' }}>
            {lastMessage.sender_role === 'admin' ? '🏦' : '👤'} {lastMessage.body}
          </p>
          <div className="text-muted text-sm" style={{ marginTop: 6 }}>
            {formatRelative(lastMessage.created_at)}
          </div>
        </Card>
      ) : null}

      {/* Dernières demandes */}
      <Card
        title="Mes dernières demandes"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
            Tout voir
          </Button>
        }
      >
        {loading ? (
          <SkeletonList count={2} />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="Aucune demande pour l’instant"
            message={`Transférez un montant au ${TRANSFER_NUMBER} puis déposez la capture du reçu : votre demande apparaîtra ici.`}
            action={
              <Button icon="💳" onClick={() => navigate('/recharger')} style={{ marginTop: 10 }}>
                Déposer ma première demande
              </Button>
            }
          />
        ) : (
          <div className="tx-list">
            {transactions.slice(0, 3).map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transaction={transaction}
                receiptLoading={receiptBusy === transaction.id}
                onDownloadReceipt={handleReceipt}
              />
            ))}
          </div>
        )}
        <p className="text-muted text-sm" style={{ marginTop: 12 }}>
          Besoin d’aide ? <Link to="/messages">Écrivez à l’administration</Link> en indiquant la référence de votre
          demande.
        </p>
      </Card>
    </AppShell>
  )
}
