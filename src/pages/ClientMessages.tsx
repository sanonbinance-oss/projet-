/* ==========================================================================
 * PayKal — messagerie de l'espace client
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ChatView } from '../components/ChatView'
import { Alert, Button, Card, Textarea } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { describeError, formatPhone } from '../lib/format'
import { TRANSFER_NUMBER } from '../lib/config'

const SUGGESTIONS = [
  'Bonjour, j’ai effectué un transfert et déposé la capture. Pouvez-vous vérifier ?',
  'Mon reçu a été refusé, que dois-je corriger ?',
  'Pouvez-vous confirmer le montant reçu sur mon compte ?',
]

export default function ClientMessages() {
  const { api, profile } = useSession()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reference = searchParams.get('ref')

  useEffect(() => {
    if (reference) {
      setDraft(`Bonjour, au sujet de ma demande ${reference} : `)
    }
  }, [reference])

  const sendSuggestion = async (text: string) => {
    if (!profile) return
    setSending(true)
    try {
      await api.sendMessage({ conversationUserId: profile.id, body: text, role: 'client' })
      toast.success('Message envoyé', 'L’administration vous répond dans la conversation ci-dessous.')
      setDraft('')
    } catch (err) {
      setError(describeError(err))
      toast.error('Envoi impossible', describeError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <AppShell variant="client">
      <div className="page-head">
        <div>
          <h1>Messagerie</h1>
          <p>Échangez directement avec l’administration PayKal (aucun tiers ne peut lire cette conversation).</p>
        </div>
      </div>

      {error ? (
        <Alert tone="error" title="Messagerie indisponible" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Card tight>
        <div className="row-between">
          <div className="text-muted text-sm">
            Assistance PayKal · transfert au <b>{formatPhone(TRANSFER_NUMBER)}</b>
          </div>
          <span className="badge info">🔒 Conversation privée</span>
        </div>
      </Card>

      {profile ? (
        <ChatView
          role="client"
          conversationUserId={profile.id}
          title={profile.full_name || profile.email}
          subtitle="Administration PayKal — réponse en général rapide"
          emptyMessage="Envoyez votre premier message : indiquez votre référence de demande, une capture ou toute question sur votre transfert."
        />
      ) : null}

      <Card title="Messages rapides">
        <div className="grid">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="secondary"
              size="sm"
              loading={sending}
              onClick={() => void sendSuggestion(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        <div className="sep" />
        <Textarea
          value={draft}
          rows={2}
          placeholder="Message libre (utilisez la zone de saisie de la conversation ci-dessus)"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="sm" variant="ghost" disabled={!draft.trim()} loading={sending} onClick={() => void sendSuggestion(draft.trim())}>
          Envoyer ce message
        </Button>
      </Card>
    </AppShell>
  )
}
