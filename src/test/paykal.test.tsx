/* ==========================================================================
 * PayKal — tests de parcours (mode démonstration, aucun réseau)
 * --------------------------------------------------------------------------
 * Couvre : écran de connexion (2 rôles), accès client et administration,
 * dépôt d'un rechargement avec capture, validation/refus admin, messagerie,
 * génération du reçu PDF, routes SPA profondes et règles de sécurité des rôles.
 * ========================================================================== */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { MODE_STORAGE_KEY } from '../lib/config'
import { resetDemoData } from '../lib/demoApi'

/**
 * jsdom ne décode aucune image (ni canvas ni Image.onload) : on remplace le
 * pipeline de compression par une version de test qui conserve le fichier
 * d'origine. La logique de compression est testée séparément (voir plus bas).
 */
vi.mock('../lib/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/image')>()
  return {
    ...original,
    prepareProof: async (file: File) => ({
      blob: file,
      file,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      width: 512,
      height: 512,
      originalBytes: file.size,
      bytes: file.size,
      compressed: false,
    }),
  }
})

/** Prépare l'application en mode démonstration, sur la route donnée. */
function renderApp(route = '/') {
  localStorage.setItem(MODE_STORAGE_KEY, 'demo')
  window.history.pushState({}, '', route)
  return render(<App />)
}

/** Clique le premier lien de navigation portant ce libellé (onglets + nav mobile). */
async function navLink(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const links = await screen.findAllByRole('link', { name })
  await user.click(links[0])
}

async function loginAsClient(user: ReturnType<typeof userEvent.setup>) {
  renderApp('/connexion')
  await screen.findByRole('heading', { name: /PayKal/i })
  await user.click(await screen.findByRole('button', { name: /Awa Diop/i }))
  await user.click(screen.getByRole('button', { name: /Se connecter/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /Bonjour Awa/i })).toBeInTheDocument())
}

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  renderApp('/connexion')
  await screen.findByRole('heading', { name: /PayKal/i })
  await user.click(screen.getByRole('tab', { name: /Administration/i }))
  await user.click(await screen.findByRole('button', { name: /Administrateur$/i }))
  await user.click(screen.getByRole('button', { name: /Se connecter/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /Tableau de bord/i })).toBeInTheDocument())
}

beforeEach(() => {
  resetDemoData()
})

describe('Écran de connexion', () => {
  it('affiche les deux interfaces (client et administration)', async () => {
    renderApp('/connexion')
    expect(await screen.findByRole('heading', { name: /PayKal/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Client \/ Parent/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Administration/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Créer un compte client/i })).toHaveAttribute('href', '/inscription')
  })

  it('refuse une connexion avec des identifiants invalides', async () => {
    const user = userEvent.setup()
    renderApp('/connexion')
    await user.type(await screen.findByLabelText(/Adresse e-mail/i), 'inconnu@paykal.app')
    await user.type(screen.getByLabelText(/^Mot de passe/), 'MauvaisPass1')
    await user.click(screen.getByRole('button', { name: /Se connecter/i }))
    expect(await screen.findByText(/Aucun compte de démonstration/i)).toBeInTheDocument()
  })

  it('crée un compte client depuis le formulaire d’inscription', async () => {
    const user = userEvent.setup()
    renderApp('/inscription')
    await user.type(await screen.findByLabelText(/Nom complet/i), 'Fatou Ndiaye')
    await user.type(screen.getByLabelText(/Adresse e-mail/i), 'fatou@paykal.app')
    await user.type(screen.getByLabelText(/Téléphone/i), '0777889900')
    await user.type(screen.getByLabelText(/^Mot de passe/i), 'Secret123')
    await user.type(screen.getByLabelText(/Confirmation du mot de passe/i), 'Secret123')
    await user.click(screen.getByRole('button', { name: /Créer mon compte/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /Bonjour Fatou/i })).toBeInTheDocument())
  })
})

describe('Espace client', () => {
  it('affiche le numéro de transfert 074452674 sur l’accueil et la page de rechargement', async () => {
    const user = userEvent.setup()
    await loginAsClient(user)
    expect(screen.getAllByText('074452674').length).toBeGreaterThan(0)

    await navLink(user, /Recharger/i)
    await waitFor(() => expect(screen.getByRole('heading', { name: /Recharger mon compte/i })).toBeInTheDocument())
    expect(screen.getAllByText('074452674').length).toBeGreaterThan(0)
  })

  it('exige une capture et un montant valide avant l’envoi', async () => {
    const user = userEvent.setup()
    await loginAsClient(user)
    await navLink(user, /Recharger/i)
    await screen.findByRole('heading', { name: /Recharger mon compte/i })

    await user.click(screen.getByRole('button', { name: /Envoyer ma demande de rechargement/i }))
    expect(await screen.findByText(/Saisissez un montant valide/i)).toBeInTheDocument()
    expect(screen.getByText(/Joignez la capture d’écran du transfert/i)).toBeInTheDocument()
  })

  it('dépose une demande de rechargement avec capture et affiche la référence', async () => {
    const user = userEvent.setup()
    await loginAsClient(user)
    await navLink(user, /Recharger/i)
    await screen.findByRole('heading', { name: /Recharger mon compte/i })

    await user.type(screen.getByLabelText(/Montant transféré/i), '7500')

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'recu.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    await user.click(screen.getByRole('button', { name: /Envoyer ma demande de rechargement/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /Demande envoyée/i })).toBeInTheDocument())
    expect(screen.getAllByText(/PK-\d{8}-[A-Z0-9]{4}/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Télécharger le reçu PDF/i })).toBeInTheDocument()
  })

  it('permet d’envoyer un message à l’administration', async () => {
    const user = userEvent.setup()
    await loginAsClient(user)
    await navLink(user, /Messages/i)
    await screen.findByRole('heading', { name: /Messagerie/i })

    const composer = document.querySelector('.composer') as HTMLElement
    await user.type(within(composer).getByRole('textbox'), 'Bonjour, où en est mon transfert ?')
    await user.click(within(composer).getByRole('button', { name: /Envoyer/i }))
    expect(await screen.findByText('Bonjour, où en est mon transfert ?')).toBeInTheDocument()
  })
})

describe('Espace administration', () => {
  it('affiche le tableau de bord avec la file d’attente de validation', async () => {
    const user = userEvent.setup()
    await loginAsAdmin(user)
    expect(screen.getByRole('heading', { name: /File d’attente de validation/i })).toBeInTheDocument()
    // Les statistiques arrivent de façon asynchrone (fetch du backend démo).
    expect(await screen.findByText(/Rechargements en attente de validation/i)).toBeInTheDocument()
  })

  it('valide un paiement alors en attente', async () => {
    const user = userEvent.setup()
    await loginAsAdmin(user)
    await navLink(user, /Transactions/i)
    await screen.findByRole('heading', { name: /Transactions & validations/i })

    const validerButtons = await screen.findAllByRole('button', { name: /Valider$/i })
    await user.click(validerButtons[0])

    const dialog = await screen.findByRole('dialog', { name: /Valider le paiement/i })
    await user.type(within(dialog).getByLabelText(/Commentaire/i), 'Transfert vérifié.')
    await user.click(within(dialog).getByRole('button', { name: /Valider et recharger/i }))

    await waitFor(() => expect(screen.getByText(/Paiement validé/i)).toBeInTheDocument(), { timeout: 4000 })
  })

  it('exige un motif pour refuser un paiement', async () => {
    const user = userEvent.setup()
    await loginAsAdmin(user)
    await navLink(user, /Transactions/i)
    await screen.findByRole('heading', { name: /Transactions & validations/i })

    const refuserButtons = await screen.findAllByRole('button', { name: /Refuser$/i })
    await user.click(refuserButtons[0])

    const dialog = await screen.findByRole('dialog', { name: /Refuser le paiement/i })
    await user.click(within(dialog).getByRole('button', { name: /Refuser la demande/i }))
    expect(await within(dialog).findByText(/Indiquez un motif de refus/i)).toBeInTheDocument()
  })

  it('affiche la preuve (capture) d’un paiement reçu', async () => {
    const user = userEvent.setup()
    await loginAsAdmin(user)
    await navLink(user, /Transactions/i)
    await screen.findByRole('heading', { name: /Transactions & validations/i })

    const proofs = await screen.findAllByRole('button', { name: /Voir la capture/i })
    await user.click(proofs[0])
    const dialog = await screen.findByRole('dialog', { name: /Capture du reçu/i })
    expect(await within(dialog).findByAltText(/écran du reçu/i)).toBeInTheDocument()
  })

  it('affiche la messagerie globale et le fichier clients', async () => {
    const user = userEvent.setup()
    await loginAsAdmin(user)

    await navLink(user, /Messagerie/i)
    await screen.findByRole('heading', { name: /Messagerie globale/i })
    expect((await screen.findAllByText(/Awa Diop/)).length).toBeGreaterThan(0)

    await navLink(user, /Clients/i)
    await screen.findByRole('heading', { name: /Fichier clients/i })
    expect(await screen.findByText(/Clients inscrits/i)).toBeInTheDocument()
  })
})

describe('Rôles et routes', () => {
  it('redirige un visiteur non connecté vers la connexion', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'demo')
    window.history.pushState({}, '', '/admin')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Administration/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Se connecter/i })).toBeInTheDocument()
  })

  it('renvoie un client connecté hors de l’espace administrateur', async () => {
    const user = userEvent.setup()
    await loginAsClient(user)
    // Un client tente d'ouvrir /admin : retour à son espace.
    window.history.pushState({}, '', '/admin')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(screen.getByRole('heading', { name: /Bonjour Awa/i })).toBeInTheDocument())
  })

  it('affiche la page 404 pour une route inconnue', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'demo')
    window.history.pushState({}, '', '/route-inexistante')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Page introuvable/i })).toBeInTheDocument()
  })

  it('rend la page de diagnostic accessible', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'demo')
    window.history.pushState({}, '', '/diagnostic')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Diagnostic PayKal/i })).toBeInTheDocument()
    expect((await screen.findAllByText(/sxtlttaswhodbtcjjdyn\.supabase\.co/)).length).toBeGreaterThan(0)
    // Les contrôles de diagnostic s'exécutent et affichent leurs résultats.
    expect(await screen.findByText(/Résultats des vérifications|Vérifications en cours/i, {}, { timeout: 6000 })).toBeInTheDocument()
  })
})

describe('Configuration Supabase de repli', () => {
  it('compile l’URL et la clé publique de repli dans le module de configuration', async () => {
    const config = await import('../lib/config')
    expect(config.FALLBACK_SUPABASE_URL).toBe('https://sxtlttaswhodbtcjjdyn.supabase.co')
    expect(config.FALLBACK_SUPABASE_ANON_KEY).toBe('sb_publishable_52fS1oqVHBvScTshCyU2lQ_dWruxGkn')
    expect(config.SUPABASE_URL).toMatch(/^https:\/\/sxtlttaswhodbtcjjdyn\.supabase\.co$/)
    expect(config.SUPABASE_ANON_KEY).toBe(config.FALLBACK_SUPABASE_ANON_KEY)
    expect(config.isSupabaseConfigured()).toBe(true)
    expect(config.TRANSFER_NUMBER).toBe('074452674')
    expect(config.RECEIPT_BUCKET).toBe('receipts')
  })

  it('crée un client Supabase complet (Auth, base de données, Storage, Realtime)', async () => {
    const { getSupabase } = await import('../lib/supabaseClient')
    const { SUPABASE_URL } = await import('../lib/config')
    const client = getSupabase()
    expect(SUPABASE_URL).toBe('https://sxtlttaswhodbtcjjdyn.supabase.co')
    expect(client.from).toBeTypeOf('function')
    expect(client.channel).toBeTypeOf('function')
    expect(client.auth.getSession).toBeTypeOf('function')
    expect(client.storage.from).toBeTypeOf('function')
    // Un seul client pour toute l'application (pas de recréation à chaque appel).
    expect(getSupabase()).toBe(client)
  })
})

describe('Reçu PDF', () => {
  it('génère un PDF non vide pour une transaction validée', async () => {
    const { buildReceipt, receiptFilename } = await import('../lib/pdf')
    const transaction = {
      id: 'tx-1',
      reference: 'PK-20260925-TEST',
      user_id: 'demo-client-0001',
      amount: 12500,
      currency: 'XOF',
      method: 'wave' as const,
      sender_name: 'Awa Diop',
      sender_phone: '0701020304',
      transfer_number: '074452674',
      proof_path: null,
      proof_url: null,
      client_note: 'Merci',
      status: 'approved' as const,
      admin_note: 'Reçu conforme.',
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client: { id: 'demo-client-0001', full_name: 'Awa Diop', email: 'client@paykal.app', phone: '0701020304' },
    }
    const doc = buildReceipt(transaction)
    const output = doc.output('arraybuffer')
    expect(output.byteLength).toBeGreaterThan(1500)
    expect(receiptFilename(transaction)).toBe('PayKal-Recu-PK-20260925-TEST.pdf')
  })
})

describe('Préparation des captures (pipeline image)', () => {
  it('accepte les formats image et refuse les autres', async () => {
    const { isAcceptedProof, prepareProof, humanSize } = await vi.importActual<typeof import('../lib/image')>('../lib/image')
    expect(isAcceptedProof(new File([new Uint8Array([1])], 'recu.png', { type: 'image/png' }))).toBe(true)
    expect(isAcceptedProof(new File([new Uint8Array([1])], 'notes.pdf', { type: 'application/pdf' }))).toBe(false)
    expect(humanSize(2048)).toBe('2 Ko')
    await expect(prepareProof(new File([new Uint8Array([1])], 'virus.exe', { type: 'application/x-msdownload' }))).rejects.toThrow(
      /Format non pris en charge/i,
    )
  })

  it('refuse les fichiers au-delà de 8 Mo', async () => {
    const { prepareProof } = await vi.importActual<typeof import('../lib/image')>('../lib/image')
    const big = new File([new Uint8Array(1024)], 'enorme.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 })
    await expect(prepareProof(big)).rejects.toThrow(/trop volumineux/i)
  })
})

describe('Formatage et erreurs', () => {
  it('formate montants, dates et statuts en français', async () => {
    const { formatAmountShort, parseAmount, statusLabel, methodLabel, initials } = await import('../lib/format')
    // L'Intl français utilise une espace fine insécable (U+202F) : on la normalise.
    expect(formatAmountShort(12500).replace(/[\u202f\u00a0]/g, ' ')).toBe('12 500 FCFA')
    expect(parseAmount('12 500 FCFA')).toBe(12500)
    expect(parseAmount('5,5')).toBe(5.5)
    expect(statusLabel('pending')).toBe('En attente')
    expect(statusLabel('approved')).toBe('Validé')
    expect(methodLabel('orange_money')).toBe('Orange Money')
    expect(initials('Awa Diop')).toBe('AD')
  })

  it('traduit l’erreur « Failed to fetch » en message compréhensible', async () => {
    const { describeError } = await import('../lib/format')
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/Impossible de joindre le serveur PayKal/i)
    expect(describeError({ message: 'relation "transactions" does not exist', code: '42P01' })).toMatch(
      /supabase\/schema\.sql/i,
    )
  })
})

describe('Export CSV', () => {
  it('produit un CSV lisible avec les colonnes attendues', async () => {
    const { transactionsToCsv } = await import('../lib/csv')
    const csv = transactionsToCsv([
      {
        id: 'tx-2',
        reference: 'PK-20260925-CSV1',
        user_id: 'demo-client-0002',
        amount: 2000,
        currency: 'XOF',
        method: 'mtn_momo',
        sender_name: 'Moussa Traoré',
        sender_phone: '0755667788',
        transfer_number: '074452674',
        proof_path: 'demo/proof.png',
        proof_url: null,
        client_note: null,
        status: 'pending',
        admin_note: null,
        processed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: { id: 'demo-client-0002', full_name: 'Moussa Traoré', email: 'moussa@paykal.app', phone: '0755667788' },
      },
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Reference;Date de la demande;Client')
    expect(csv).toContain('PK-20260925-CSV1')
    expect(csv).toContain('En attente')
  })
})
