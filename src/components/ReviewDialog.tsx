/* ==========================================================================
 * PayKal — boîte de dialogue de validation / refus d'un paiement (admin)
 * ========================================================================== */

import { useState } from 'react'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { describeError, formatAmountShort, methodLabel } from '../lib/format'
import type { Transaction } from '../lib/types'
import { Alert, Button, Modal, Textarea } from './ui'

interface ReviewDialogProps {
  transaction: Transaction
  action: 'approved' | 'rejected'
  onClose: () => void
  onDone: () => void
}

const PRESETS: Record<'approved' | 'rejected', string[]> = {
  approved: [
    'Transfert vérifié : montant et destinataire conformes.',
    'Reçu conforme, compte rechargé.',
  ],
  rejected: [
    'Montant du transfert différent de celui déclaré.',
    'Capture illisible ou incomplète : merci de redéposer une nouvelle capture.',
    'Aucun transfert reçu au numéro PayKal pour cette référence.',
  ],
}

export function ReviewDialog({ transaction, action, onClose, onDone }: ReviewDialogProps) {
  const { api } = useSession()
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = action === 'approved'

  const submit = async () => {
    if (!approve && note.trim().length < 5) {
      setError('Indiquez un motif de refus (5 caractères minimum) : le client le recevra dans la messagerie.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.reviewTransaction({ id: transaction.id, status: action, adminNote: note })
      toast.success(
        approve ? 'Paiement validé ✅' : 'Paiement refusé',
        `${transaction.reference} · ${formatAmountShort(transaction.amount, transaction.currency)}`,
      )
      onDone()
      onClose()
    } catch (err) {
      const message = describeError(err)
      setError(message)
      toast.error('Action impossible', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={approve ? 'Valider le paiement' : 'Refuser le paiement'}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant={approve ? 'success' : 'danger'} icon={approve ? '✅' : '⛔'} loading={busy} onClick={submit}>
            {approve ? 'Valider et recharger' : 'Refuser la demande'}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" title="Action impossible">{error}</Alert> : null}

      <div className="tx-note admin">
        <div>
          <b>Référence :</b> {transaction.reference}
        </div>
        <div>
          <b>Client :</b> {transaction.client?.full_name || '—'}{' '}
          {transaction.client?.phone ? `· ${transaction.client.phone}` : ''}
        </div>
        <div>
          <b>Montant :</b> {formatAmountShort(transaction.amount, transaction.currency)} ·{' '}
          <b>Moyen :</b> {methodLabel(transaction.method)}
        </div>
        <div>
          <b>Expéditeur déclaré :</b> {transaction.sender_name || '—'} · {transaction.sender_phone || '—'}
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="admin-note">{approve ? 'Commentaire (optionnel)' : 'Motif du refus (obligatoire)'}</label>
        <Textarea
          id="admin-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            approve ? 'Ex. : transfert confirmé, compte rechargé.' : 'Ex. : montant différent de celui déclaré.'
          }
        />
        <div className="chips" style={{ marginTop: 8 }}>
          {PRESETS[action].map((preset) => (
            <button type="button" key={preset} className="chip" onClick={() => setNote(preset)}>
              {preset.length > 42 ? `${preset.slice(0, 42)}…` : preset}
            </button>
          ))}
        </div>
      </div>

      <Alert tone="info" title="Notification automatique">
        Un message est envoyé au client dans sa conversation PayKal avec le statut{note ? ' et votre commentaire' : ''}.
      </Alert>
    </Modal>
  )
}
