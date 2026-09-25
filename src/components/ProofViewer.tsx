/* ==========================================================================
 * PayKal — visionneuse des captures d'écran de reçu
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { useSession } from '../context/SessionContext'
import { describeError } from '../lib/format'
import type { Transaction } from '../lib/types'
import { Alert, Button, Modal, Spinner } from './ui'

interface ProofViewerProps {
  transaction: Transaction
  onClose: () => void
}

export function ProofViewer({ transaction, onClose }: ProofViewerProps) {
  const { api } = useSession()
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const signed = await api.getProofUrl(transaction.proof_path)
        if (cancelled) return
        setUrl(signed)
      } catch (err) {
        if (!cancelled) setError(describeError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, transaction.proof_path])

  return (
    <Modal
      title={`Capture du reçu — ${transaction.reference}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" size="sm" icon="➕" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
            Zoom
          </Button>
          <Button variant="secondary" size="sm" icon="➖" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
            Réduire
          </Button>
          {url ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon="↗️"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              >
                Ouvrir
              </Button>
              <a className="btn secondary sm" href={url} download={`recu-${transaction.reference}`}>
                ⬇️ Télécharger
              </a>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" title="Capture illisible">{error}</Alert> : null}

      {loading ? (
        <div className="proof-missing">
          <Spinner dark /> <p style={{ marginTop: 8 }}>Chargement de la capture…</p>
        </div>
      ) : url ? (
        <div className="proof-frame">
          <img
            src={url}
            alt={`Capture d'écran du reçu ${transaction.reference}`}
            style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease' }}
          />
        </div>
      ) : (
        <div className="proof-missing">
          <div style={{ fontSize: '1.8rem' }} aria-hidden="true">
            🖼️
          </div>
          <b>Aucune capture disponible</b>
          <p className="text-sm" style={{ marginTop: 6 }}>
            Le client n’a pas joint de preuve, ou le lien a expiré. Demandez-lui de redéposer la capture depuis la
            messagerie.
          </p>
        </div>
      )}

      <div className="tx-meta" style={{ marginTop: 12 }}>
        <span>
          <b>Montant déclaré :</b> {transaction.amount.toLocaleString('fr-FR')} {transaction.currency}
        </span>
        <span>
          <b>Expéditeur :</b> {transaction.sender_name || '—'} · {transaction.sender_phone || '—'}
        </span>
        <span>
          <b>Chemin de stockage :</b> <span className="mono">{transaction.proof_path || '—'}</span>
        </span>
      </div>
    </Modal>
  )
}
