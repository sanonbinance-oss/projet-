/* ==========================================================================
 * PayKal — dépôt d'une demande de rechargement (numéro + montant + capture)
 * ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Alert, Button, Card, CopyButton, Field, Input, Textarea } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { CURRENCY, PAYMENT_METHODS, QUICK_AMOUNTS, TRANSFER_NUMBER } from '../lib/config'
import { describeError, formatAmountShort, formatPhone, parseAmount } from '../lib/format'
import { humanSize, prepareProof, type PreparedImage } from '../lib/image'
import type { PaymentMethod, Transaction } from '../lib/types'

export default function Recharge() {
  const { api, profile } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [amountRaw, setAmountRaw] = useState(() => searchParams.get('montant') ?? '')
  const [method, setMethod] = useState<PaymentMethod>('wave')
  const [senderName, setSenderName] = useState(profile?.full_name ?? '')
  const [senderPhone, setSenderPhone] = useState(profile?.phone ?? '')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<PreparedImage | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<Transaction | null>(null)

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw])

  useEffect(() => {
    if (profile) {
      setSenderName((current) => current || profile.full_name)
      setSenderPhone((current) => current || profile.phone)
    }
  }, [profile])

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return
    setPreparing(true)
    setError(null)
    try {
      const prepared = await prepareProof(file)
      setProof(prepared)
      setFieldErrors((current) => ({ ...current, proof: '' }))
      if (prepared.compressed) {
        toast.info('Capture optimisée', `${humanSize(prepared.originalBytes)} → ${humanSize(prepared.bytes)} avant envoi.`)
      }
    } catch (err) {
      setError(describeError(err))
      setProof(null)
    } finally {
      setPreparing(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    void handleFile(file)
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  const validate = () => {
    const errors: Record<string, string> = {}
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Saisissez un montant valide (supérieur à 0).'
    else if (amount < 100) errors.amount = 'Le montant minimum accepté est de 100 FCFA.'
    else if (amount > 5_000_000) errors.amount = 'Pour ce montant, contactez l’administration par messagerie.'
    if (!proof) errors.proof = 'Joignez la capture d’écran du transfert : c’est la preuve exigée par l’administration.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async () => {
    setError(null)
    if (!validate()) {
      toast.warning('Formulaire incomplet', 'Vérifiez le montant et la capture du reçu.')
      return
    }
    setSubmitting(true)
    try {
      const transaction = await api.createTransaction(
        {
          amount,
          method,
          senderName,
          senderPhone,
          clientNote: note,
        },
        proof?.file ?? null,
      )
      setCreated(transaction)
      toast.success('Demande envoyée ✅', `Référence ${transaction.reference}. L’administration va vérifier votre reçu.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(describeError(err))
      toast.error('Dépôt impossible', describeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setCreated(null)
    setAmountRaw('')
    setNote('')
    setProof(null)
    setMethod('wave')
  }

  const downloadPendingReceipt = async () => {
    if (!created) return
    try {
      const { downloadReceipt, fetchProofAsDataUrl } = await import('../lib/pdf')
      const proofUrl = created.proof_path ? await api.getProofUrl(created.proof_path) : null
      const proofDataUrl = proofUrl ? (created.proof_url ?? proofUrl) : await fetchProofAsDataUrl(proof?.dataUrl ?? null)
      downloadReceipt(created, { proofDataUrl: created.proof_url ?? proofDataUrl ?? proof?.dataUrl ?? null })
      toast.success('Reçu PDF généré', created.reference)
    } catch (err) {
      toast.error('Reçu PDF impossible', describeError(err))
    }
  }

  /* ----------------------------- Confirmation ----------------------------- */
  if (created) {
    return (
      <AppShell variant="client">
        <Card>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.6rem' }} aria-hidden="true">
              ✅
            </div>
            <h1 style={{ marginTop: 6 }}>Demande envoyée !</h1>
            <p className="text-muted">
              Votre dépôt est <b>en attente de validation</b>. L’administration vérifie la capture et recharge votre
              compte ; vous serez notifié dans la messagerie.
            </p>
          </div>

          <div className="tx-note admin" style={{ textAlign: 'center' }}>
            <div className="text-muted text-sm">Référence de la demande</div>
            <div className="tx-ref" style={{ fontSize: '1.15rem', margin: '4px 0 8px' }}>
              {created.reference}
            </div>
            <div className="tx-amount">{formatAmountShort(created.amount, created.currency)}</div>
            <div className="pill-row" style={{ justifyContent: 'center', marginTop: 10 }}>
              <CopyButton
                value={created.reference}
                label="Copier la référence"
                onCopied={() => toast.success('Référence copiée', created.reference)}
              />
            </div>
          </div>

          <div className="btn row" style={{ marginTop: 14 }}>
            <Button variant="secondary" icon="🧾" onClick={downloadPendingReceipt}>
              Télécharger le reçu PDF
            </Button>
            <Button variant="secondary" icon="📄" onClick={() => navigate('/transactions')}>
              Suivre mes demandes
            </Button>
            <Button variant="secondary" icon="💬" onClick={() => navigate('/messages')}>
              Écrire à l’administration
            </Button>
            <Button variant="ghost" icon="➕" onClick={resetForm}>
              Nouvelle demande
            </Button>
          </div>
        </Card>
      </AppShell>
    )
  }

  /* -------------------------------- Formulaire ---------------------------- */
  return (
    <AppShell variant="client">
      <div className="page-head">
        <div>
          <h1>Recharger mon compte</h1>
          <p>Transfert mobile money → dépôt de la capture → validation par l’administration.</p>
        </div>
      </div>

      {/* Étape 1 : numéro */}
      <div className="transfer-box mb-2">
        <div className="label">Étape 1 — Effectuez le transfert au numéro</div>
        <div className="transfer-number">{formatPhone(TRANSFER_NUMBER)}</div>
        <div className="row">
          <CopyButton
            value={TRANSFER_NUMBER}
            label="Copier le numéro"
            onCopied={() => toast.success('Numéro copié', TRANSFER_NUMBER)}
          />
          <Button variant="light" size="sm" icon="💬" onClick={() => navigate('/messages')}>
            Un souci de transfert ?
          </Button>
        </div>
        <p className="text-sm" style={{ margin: '10px 0 0', opacity: 0.9 }}>
          Conservez la capture d’écran du transfert : elle doit indiquer le montant, la date et le numéro destinataire.
        </p>
      </div>

      {error ? (
        <Alert tone="error" title="Attention" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card title="Étape 2 — Montant et moyen de paiement">
        <Field
          label={`Montant transféré (${CURRENCY === 'XOF' ? 'FCFA' : CURRENCY})`}
          htmlFor="amount"
          error={fieldErrors.amount}
          required
        >
          <Input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="5 000"
            value={amountRaw}
            aria-invalid={Boolean(fieldErrors.amount)}
            onChange={(event) => setAmountRaw(event.target.value)}
          />
        </Field>

        {fieldErrors.amount ? null : Number.isFinite(amount) && amount > 0 ? (
          <div className="text-muted text-sm" style={{ marginTop: -6, marginBottom: 12 }}>
            Montant saisi : <b>{formatAmountShort(amount, CURRENCY)}</b>
          </div>
        ) : null}

        <div className="chips mb-2">
          {QUICK_AMOUNTS.map((quick) => (
            <button
              type="button"
              key={quick}
              className={`chip ${Number(amountRaw.replace(/\s/g, '')) === quick ? 'active' : ''}`.trim()}
              onClick={() => setAmountRaw(String(quick))}
            >
              {formatAmountShort(quick, CURRENCY)}
            </button>
          ))}
        </div>

        <fieldset className="mb-2">
          <legend>Moyen utilisé</legend>
          <div className="radio-list">
            {PAYMENT_METHODS.map((option) => (
              <label key={option.value} className={`radio-item ${method === option.value ? 'active' : ''}`.trim()}>
                <input
                  type="radio"
                  name="method"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value as PaymentMethod)}
                />
                <span>
                  <span className="t">{option.label}</span>
                  <span className="d">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid cols-2">
          <Field label="Nom de l’expéditeur" htmlFor="senderName" hint="Celui qui a effectué le transfert.">
            <Input
              id="senderName"
              value={senderName}
              autoComplete="name"
              placeholder="Awa Diop"
              onChange={(event) => setSenderName(event.target.value)}
            />
          </Field>
          <Field label="Téléphone de l’expéditeur" htmlFor="senderPhone">
            <Input
              id="senderPhone"
              type="tel"
              inputMode="tel"
              value={senderPhone}
              autoComplete="tel"
              placeholder="07 01 02 03 04"
              onChange={(event) => setSenderPhone(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Message pour l’administration (optionnel)" htmlFor="note">
          <Textarea
            id="note"
            rows={3}
            value={note}
            placeholder="Ex. : transfert effectué depuis le compte de ma mère, reçu partiel…"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </Card>

      <Card title="Étape 3 — Capture d’écran du reçu" >
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`.trim()}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
          }}
        >
          <div className="icon" aria-hidden="true">
            {preparing ? '⏳' : '📤'}
          </div>
          <div className="t">{preparing ? 'Optimisation de la capture…' : 'Touchez pour choisir la capture'}</div>
          <div className="d">PNG, JPG ou WEBP · 8 Mo maximum · compressée automatiquement avant l’envoi</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onPick}
            aria-label="Choisir la capture d’écran du reçu"
          />
        </div>

        {fieldErrors.proof ? (
          <div className="error" role="alert" style={{ marginTop: 8 }}>
            {fieldErrors.proof}
          </div>
        ) : null}

        {proof ? (
          <div className="preview">
            <img src={proof.dataUrl} alt="Aperçu de la capture du reçu" />
            <div className="meta">
              <span>
                {proof.width && proof.height ? `${proof.width}×${proof.height} px · ` : ''}
                {humanSize(proof.bytes)}
                {proof.compressed ? ` (compressée depuis ${humanSize(proof.originalBytes)})` : ''}
              </span>
              <Button
                variant="ghost"
                size="xs"
                icon="🗑️"
                onClick={() => {
                  setProof(null)
                }}
              >
                Retirer
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <Alert tone="info" title="Ce qui se passe ensuite">
          1️⃣ L’administration vérifie le transfert et la capture. 2️⃣ Votre demande passe en <b>Validé</b> (ou{' '}
          <b>Refusé</b> avec un motif). 3️⃣ Vous êtes notifié dans la messagerie et pouvez télécharger le reçu PDF.
        </Alert>
        <Button block icon="🚀" loading={submitting} onClick={submit} disabled={preparing}>
          Envoyer ma demande de rechargement
        </Button>
      </Card>
    </AppShell>
  )
}
