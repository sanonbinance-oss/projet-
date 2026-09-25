/* ==========================================================================
 * PayKal — génération du reçu PDF (jsPDF, 100 % côté navigateur)
 * ========================================================================== */

import { jsPDF } from 'jspdf'
import { APP_NAME, CURRENCY, TRANSFER_NUMBER } from './config'
import { formatAmountShort, formatDateTime, methodLabel, STATUS_LABELS } from './format'
import type { Transaction } from './types'

const COLORS = {
  teal: [11, 122, 117] as const,
  tealSoft: [230, 244, 243] as const,
  ink: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  amber: [180, 83, 9] as const,
  green: [21, 128, 61] as const,
  red: [185, 28, 28] as const,
}

const statusColor = (status: Transaction['status']) =>
  status === 'approved' ? COLORS.green : status === 'rejected' ? COLORS.red : COLORS.amber

/** Nom de fichier du reçu : PayKal-Recu-PK-20260110-A1B2.pdf */
export function receiptFilename(transaction: Transaction): string {
  const reference = (transaction.reference || transaction.id).replace(/[^\w-]/g, '')
  return `PayKal-Recu-${reference}.pdf`
}

export interface ReceiptOptions {
  /** Data URL de la capture d'écran à joindre en pièce (optionnel). */
  proofDataUrl?: string | null
}

/** Construit le document PDF (sans le télécharger). */
export function buildReceipt(transaction: Transaction, options: ReceiptOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  doc.setProperties({
    title: `Reçu PayKal ${transaction.reference}`,
    subject: `Rechargement ${formatAmountShort(transaction.amount, transaction.currency)}`,
    author: APP_NAME,
    creator: `${APP_NAME} PWA`,
  })

  /* ----------------------------- Bandeau haut ----------------------------- */
  doc.setFillColor(...COLORS.teal)
  doc.rect(0, 0, pageWidth, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(APP_NAME, margin, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Messagerie & rechargement sécurisés', margin, 21.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('REÇU DE RECHARGEMENT', pageWidth - margin, 14, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`N° ${transaction.reference}`, pageWidth - margin, 20.5, { align: 'right' })
  doc.text(`Émis le ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, 26, { align: 'right' })

  /* ------------------------------- Montant -------------------------------- */
  let y = 48
  doc.setFillColor(...COLORS.tealSoft)
  doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...COLORS.muted)
  doc.text('MONTANT DE LA DEMANDE', margin + 6, y + 9)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...COLORS.ink)
  doc.text(formatAmountShort(transaction.amount, transaction.currency ?? CURRENCY), margin + 6, y + 20)

  // Badge de statut
  const label = STATUS_LABELS[transaction.status].toUpperCase()
  doc.setFontSize(10)
  const badgeWidth = Math.max(34, doc.getTextWidth(label) + 12)
  const badgeX = pageWidth - margin - badgeWidth - 6
  const color = statusColor(transaction.status)
  doc.setFillColor(color[0], color[1], color[2])
  doc.roundedRect(badgeX, y + 7, badgeWidth, 12, 6, 6, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text(label, badgeX + badgeWidth / 2, y + 15, { align: 'center' })

  /* ------------------------------- Détails -------------------------------- */
  y += 36
  const rows: Array<[string, string]> = [
    ['Titulaire du compte', transaction.client?.full_name || 'Client PayKal'],
    ['E-mail', transaction.client?.email || '—'],
    ['Téléphone', transaction.client?.phone || transaction.sender_phone || '—'],
    ['Date de la demande', formatDateTime(transaction.created_at)],
    ['Moyen de paiement', methodLabel(transaction.method)],
    ['Numéro de transfert PayKal', transaction.transfer_number || TRANSFER_NUMBER],
    ['Nom de l’expéditeur', transaction.sender_name || '—'],
    ['Téléphone de l’expéditeur', transaction.sender_phone || '—'],
    ['Devise', transaction.currency ?? CURRENCY],
    [
      'Traitement',
      transaction.processed_at ? formatDateTime(transaction.processed_at) : 'En cours de vérification',
    ],
  ]

  doc.setFontSize(10.5)
  for (const [key, value] of rows) {
    doc.setDrawColor(...COLORS.line)
    doc.setLineWidth(0.2)
    doc.line(margin, y + 4.5, pageWidth - margin, y + 4.5)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    doc.text(key, margin, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.ink)
    const wrapped = doc.splitTextToSize(String(value), contentWidth * 0.55)
    doc.text(wrapped, pageWidth - margin, y, { align: 'right' })
    y += 6 + (wrapped.length - 1) * 5
  }

  /* ------------------------- Notes et observations ------------------------ */
  y += 6
  if (transaction.client_note) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.ink)
    doc.text('Message du client', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    const note = doc.splitTextToSize(transaction.client_note, contentWidth)
    doc.text(note, margin, y + 5.5)
    y += 5.5 + note.length * 4.8 + 4
  }
  if (transaction.admin_note) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.ink)
    doc.text('Observation de l’administration', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    const note = doc.splitTextToSize(transaction.admin_note, contentWidth)
    doc.text(note, margin, y + 5.5)
    y += 5.5 + note.length * 4.8 + 4
  }

  /* --------------------------- Capture du reçu ---------------------------- */
  if (options.proofDataUrl) {
    try {
      const format = options.proofDataUrl.includes('image/png') ? 'PNG' : 'JPEG'
      const maxWidth = contentWidth
      const maxHeight = 78
      let width = maxWidth
      let height = maxHeight
      try {
        const props = doc.getImageProperties(options.proofDataUrl)
        const ratio = props.height / props.width
        width = maxWidth
        height = width * ratio
        if (height > maxHeight) {
          height = maxHeight
          width = height / ratio
        }
      } catch {
        /* dimensions inconnues : on garde l'encadré par défaut */
      }
      if (y + height + 20 > doc.internal.pageSize.getHeight()) {
        doc.addPage()
        y = 24
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...COLORS.ink)
      doc.text('Preuve de paiement téléversée', margin, y)
      y += 4
      doc.setDrawColor(...COLORS.line)
      doc.roundedRect(margin, y, width, height, 2, 2, 'S')
      doc.addImage(options.proofDataUrl, format, margin + 1, y + 1, width - 2, height - 2)
      y += height + 10
    } catch (error) {
      console.warn('[PayKal] Capture non intégrée au PDF :', error)
    }
  }

  /* -------------------------------- Note bas ------------------------------- */
  const pageHeight = doc.internal.pageSize.getHeight()
  const footerY = Math.max(y + 8, pageHeight - 32)
  doc.setDrawColor(...COLORS.line)
  doc.line(margin, footerY, pageWidth - margin, footerY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.text(
    `Numéro de transfert PayKal : ${TRANSFER_NUMBER} · Ce reçu est généré automatiquement par l'application ${APP_NAME}.`,
    margin,
    footerY + 6,
  )
  doc.text(
    'Document à conserver. Pour toute réclamation, ouvrez la messagerie PayKal et indiquez le numéro de référence ci-dessus.',
    margin,
    footerY + 11,
  )
  doc.setFontSize(8)
  doc.text(`PayKal v1.0.0 · ${doc.getNumberOfPages()} page(s)`, pageWidth - margin, footerY + 18, { align: 'right' })

  /* ------------------------------ Filigrane ------------------------------- */
  if (transaction.status === 'pending') {
    doc.setTextColor(241, 245, 249)
    doc.setFontSize(58)
    doc.setFont('helvetica', 'bold')
    doc.text('EN ATTENTE', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 })
  } else if (transaction.status === 'rejected') {
    doc.setTextColor(254, 242, 242)
    doc.setFontSize(58)
    doc.setFont('helvetica', 'bold')
    doc.text('REFUSÉ', pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 })
  }

  return doc
}

/** Génère et télécharge le reçu PDF. */
export function downloadReceipt(transaction: Transaction, options: ReceiptOptions = {}): void {
  const doc = buildReceipt(transaction, options)
  doc.save(receiptFilename(transaction))
}

/** Ouvre le reçu dans un nouvel onglet (utile sur iOS où le téléchargement est capricieux). */
export function openReceipt(transaction: Transaction, options: ReceiptOptions = {}): void {
  const doc = buildReceipt(transaction, options)
  const url = doc.output('bloburl')
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Convertit un SVG (data URL) en JPEG : jsPDF ne sait pas intégrer le SVG. */
async function rasterizeSvgImage(dataUrl: string): Promise<string | null> {
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG illisible'))
      image.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || 480
    canvas.height = image.naturalHeight || 720
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

/** Tente de récupérer la capture pour l'intégrer au PDF (silencieux en cas d'échec CORS). */
export async function fetchProofAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) {
    return url.includes('image/svg') ? rasterizeSvgImage(url) : url
  }
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    const isImage = blob.type.startsWith('image/') || blob.type.includes('svg')
    if (!isImage) return null
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('lecture impossible'))
      reader.readAsDataURL(blob)
    })
    return dataUrl.includes('image/svg') ? rasterizeSvgImage(dataUrl) : dataUrl
  } catch {
    return null
  }
}
