/* ==========================================================================
 * PayKal — export CSV du journal des transactions (interface admin)
 * ========================================================================== */

import { formatDateTime, methodLabel, STATUS_LABELS } from './format'
import type { Transaction } from './types'

function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Export « Excel France » : séparateur point-virgule + BOM UTF-8.
 * Le fichier s'ouvre directement proprement dans Excel / LibreOffice.
 */
export function transactionsToCsv(transactions: Transaction[]): string {
  const headers = [
    'Reference',
    'Date de la demande',
    'Client',
    'E-mail',
    'Telephone',
    'Montant',
    'Devise',
    'Moyen de paiement',
    'Expediteur',
    'Telephone expediteur',
    'Numero de transfert',
    'Statut',
    'Note admin',
    'Traite le',
    'Reçu televerse',
  ]

  const lines = transactions.map((tx) =>
    [
      tx.reference,
      formatDateTime(tx.created_at),
      tx.client?.full_name ?? '',
      tx.client?.email ?? '',
      tx.client?.phone ?? '',
      tx.amount.toFixed(2).replace('.', ','),
      tx.currency,
      methodLabel(tx.method),
      tx.sender_name ?? '',
      tx.sender_phone ?? '',
      tx.transfer_number,
      STATUS_LABELS[tx.status],
      tx.admin_note ?? '',
      tx.processed_at ? formatDateTime(tx.processed_at) : '',
      tx.proof_path ? 'oui' : 'non',
    ]
      .map(escapeCell)
      .join(';'),
  )

  return `\uFEFF${[headers.join(';'), ...lines].join('\r\n')}`
}

export function downloadTransactionsCsv(transactions: Transaction[]): void {
  const csv = transactionsToCsv(transactions)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const link = document.createElement('a')
  link.href = url
  link.download = `paykal-transactions-${stamp}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
