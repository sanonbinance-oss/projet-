/* ==========================================================================
 * PayKal — carte d'une transaction (client + admin)
 * ========================================================================== */

import type { ReactNode } from 'react'
import { formatAmountShort, formatDateTime, methodLabel, STATUS_DESCRIPTIONS } from '../lib/format'
import { TRANSFER_NUMBER } from '../lib/config'
import type { Transaction } from '../lib/types'
import { Badge, Button, StatusBadge } from './ui'

interface TransactionCardProps {
  transaction: Transaction
  /** Affiche le nom du client (interface admin). */
  showClient?: boolean
  onViewProof?: (transaction: Transaction) => void
  onDownloadReceipt?: (transaction: Transaction) => void
  receiptLoading?: boolean
  /** Boutons supplémentaires (validation / refus côté admin). */
  children?: ReactNode
}

export function TransactionCard({
  transaction,
  showClient = false,
  onViewProof,
  onDownloadReceipt,
  receiptLoading = false,
  children,
}: TransactionCardProps) {
  const clientName = transaction.client?.full_name || transaction.client?.email || 'Client PayKal'

  return (
    <article className={`tx ${transaction.status}`}>
      <div className="tx-top">
        <div>
          <div className="tx-ref">{transaction.reference}</div>
          <div className="text-muted text-sm">{formatDateTime(transaction.created_at)}</div>
        </div>
        <div className="text-right">
          <div className="tx-amount">{formatAmountShort(transaction.amount, transaction.currency)}</div>
          <StatusBadge status={transaction.status} />
        </div>
      </div>

      <div className="tx-meta">
        {showClient ? (
          <span>
            👤 <b>{clientName}</b>
            {transaction.client?.phone ? ` · ${transaction.client.phone}` : ''}
          </span>
        ) : null}
        <span>
          💳 <b>{methodLabel(transaction.method)}</b>
        </span>
        <span>
          🎯 <b>{transaction.transfer_number || TRANSFER_NUMBER}</b>
        </span>
        {transaction.sender_name ? (
          <span>
            ✍️ <b>{transaction.sender_name}</b>
            {transaction.sender_phone ? ` · ${transaction.sender_phone}` : ''}
          </span>
        ) : null}
        <span>
          {transaction.proof_path ? (
            <Badge tone="info">🖼️ Reçu joint</Badge>
          ) : (
            <Badge tone="neutral">Sans capture</Badge>
          )}
        </span>
        {transaction.processed_at ? (
          <span>
            🕒 Traité le <b>{formatDateTime(transaction.processed_at)}</b>
          </span>
        ) : null}
      </div>

      {transaction.client_note ? <div className="tx-note">💬 Message du client : {transaction.client_note}</div> : null}

      {transaction.admin_note ? (
        <div className={`tx-note ${transaction.status === 'rejected' ? 'reject' : 'admin'}`}>
          {transaction.status === 'rejected' ? '⛔ Motif du refus : ' : '🏦 Observation admin : '}
          {transaction.admin_note}
        </div>
      ) : null}

      {!transaction.admin_note ? <div className="text-muted text-sm">{STATUS_DESCRIPTIONS[transaction.status]}</div> : null}

      <div className="tx-actions">
        {transaction.proof_path && onViewProof ? (
          <Button variant="secondary" size="sm" icon="🔍" onClick={() => onViewProof(transaction)}>
            Voir la capture
          </Button>
        ) : null}
        {onDownloadReceipt ? (
          <Button
            variant="secondary"
            size="sm"
            icon="🧾"
            loading={receiptLoading}
            onClick={() => onDownloadReceipt(transaction)}
          >
            Reçu PDF
          </Button>
        ) : null}
        {children}
      </div>
    </article>
  )
}
