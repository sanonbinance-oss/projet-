/* ==========================================================================
 * PayKal — backend de DÉMONSTRATION (100 % local, zéro réseau)
 * --------------------------------------------------------------------------
 * Activé uniquement si Supabase est injoignable ou si l'utilisateur choisit
 * explicitement le mode démo depuis l'écran de connexion ou le diagnostic.
 * Toutes les données vivent dans localStorage : idéal pour tester les deux
 * interfaces (client + admin) sans backend.
 *
 * ⚠️ Démonstration uniquement : les « mots de passe » ne sont pas chiffrés.
 * ========================================================================== */

import { CURRENCY, TRANSFER_NUMBER } from './config'
import type {
  Api,
  AppStats,
  Message,
  NewTransactionInput,
  PaymentMethod,
  Profile,
  Role,
  ThreadSummary,
  Transaction,
  TransactionFilter,
  TxStatus,
} from './types'

const STORAGE_KEY = 'paykal.demo.v2'

interface DemoDb {
  profiles: Profile[]
  transactions: Transaction[]
  messages: Message[]
  session: string | null
  passwords: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/*                    Captures d'écran factices (mode démo)                    */
/* -------------------------------------------------------------------------- */

function mockProofImage(amount: number, method: PaymentMethod, reference: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
  <rect width="480" height="720" fill="#0f172a"/>
  <rect x="16" y="16" width="448" height="688" rx="28" fill="#ffffff"/>
  <rect x="16" y="16" width="448" height="110" rx="28" fill="#0B7A75"/>
  <rect x="16" y="96" width="448" height="30" fill="#0B7A75"/>
  <text x="44" y="70" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">Transfert reussi</text>
  <text x="44" y="100" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#c8ece9">Réseau mobile money</text>
  <circle cx="240" cy="196" r="40" fill="#e6f4f3"/>
  <path d="M222 196l13 13 24-26" stroke="#0B7A75" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="240" y="292" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="bold" fill="#0f172a">${amount.toLocaleString('fr-FR')} ${CURRENCY}</text>
  <text x="240" y="322" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#64748b">Montant transféré</text>
  <line x1="44" y1="356" x2="436" y2="356" stroke="#e2e8f0" stroke-width="2"/>
  <text x="44" y="396" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#94a3b8">Bénéficiaire</text>
  <text x="436" y="396" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">PAYKAL • ${TRANSFER_NUMBER}</text>
  <text x="44" y="444" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#94a3b8">Moyen</text>
  <text x="436" y="444" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">${method.replace('_', ' ').toUpperCase()}</text>
  <text x="44" y="492" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#94a3b8">Référence</text>
  <text x="436" y="492" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">${reference}</text>
  <text x="44" y="540" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#94a3b8">Frais</text>
  <text x="436" y="540" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#0f172a">0 ${CURRENCY}</text>
  <rect x="44" y="580" width="392" height="70" rx="14" fill="#f1f5f9"/>
  <text x="64" y="612" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#64748b">Capture d'écran de démonstration</text>
  <text x="64" y="636" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#64748b">Générée localement par PayKal (mode démo)</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Preuves téléversées pendant la session (mode démo) : non persistées. */
const sessionProofs = new Map<string, string>()

/* -------------------------------------------------------------------------- */
/*                                 Seed initial                                */
/* -------------------------------------------------------------------------- */

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function reference(offset = 0): string {
  const date = new Date(Date.now() - offset * 86_400_000)
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `PK-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function seedDatabase(): DemoDb {
  const admin: Profile = {
    id: 'demo-admin-0001',
    email: 'admin@paykal.app',
    full_name: 'Administration PayKal',
    phone: '074452674',
    role: 'admin',
    created_at: iso(60 * 24 * 40),
  }
  const awa: Profile = {
    id: 'demo-client-0001',
    email: 'client@paykal.app',
    full_name: 'Awa Diop',
    phone: '0701020304',
    role: 'client',
    created_at: iso(60 * 24 * 12),
  }
  const moussa: Profile = {
    id: 'demo-client-0002',
    email: 'moussa@paykal.app',
    full_name: 'Moussa Traoré',
    phone: '0755667788',
    role: 'client',
    created_at: iso(60 * 24 * 5),
  }

  const transactions: Transaction[] = [
    {
      id: newId(),
      reference: 'PK-20260110-A1B2',
      user_id: awa.id,
      amount: 5000,
      currency: CURRENCY,
      method: 'wave',
      sender_name: 'Awa Diop',
      sender_phone: '0701020304',
      transfer_number: TRANSFER_NUMBER,
      proof_path: mockProofImage(5000, 'wave', 'PK-20260110-A1B2'),
      proof_url: mockProofImage(5000, 'wave', 'PK-20260110-A1B2'),
      client_note: 'Rechargement pour mes cours en ligne.',
      status: 'approved',
      admin_note: 'Reçu conforme, compte rechargé.',
      processed_at: iso(60 * 24 * 10),
      created_at: iso(60 * 24 * 10 + 40),
      updated_at: iso(60 * 24 * 10),
      client: { id: awa.id, full_name: awa.full_name, email: awa.email, phone: awa.phone },
    },
    {
      id: newId(),
      reference: reference(2),
      user_id: awa.id,
      amount: 12500,
      currency: CURRENCY,
      method: 'orange_money',
      sender_name: 'Awa Diop',
      sender_phone: '0701020304',
      transfer_number: TRANSFER_NUMBER,
      proof_path: mockProofImage(12500, 'orange_money', 'REF-DEMO-2'),
      proof_url: mockProofImage(12500, 'orange_money', 'REF-DEMO-2'),
      client_note: null,
      status: 'pending',
      admin_note: null,
      processed_at: null,
      created_at: iso(120),
      updated_at: iso(120),
      client: { id: awa.id, full_name: awa.full_name, email: awa.email, phone: awa.phone },
    },
    {
      id: newId(),
      reference: reference(1),
      user_id: moussa.id,
      amount: 2000,
      currency: CURRENCY,
      method: 'mtn_momo',
      sender_name: 'Moussa Traoré',
      sender_phone: '0755667788',
      transfer_number: TRANSFER_NUMBER,
      proof_path: mockProofImage(2000, 'mtn_momo', 'REF-DEMO-3'),
      proof_url: mockProofImage(2000, 'mtn_momo', 'REF-DEMO-3'),
      client_note: 'Reçu envoyé depuis le compte de ma sœur.',
      status: 'pending',
      admin_note: null,
      processed_at: null,
      created_at: iso(45),
      updated_at: iso(45),
      client: { id: moussa.id, full_name: moussa.full_name, email: moussa.email, phone: moussa.phone },
    },
    {
      id: newId(),
      reference: reference(4),
      user_id: moussa.id,
      amount: 800,
      currency: CURRENCY,
      method: 'wave',
      sender_name: 'Moussa Traoré',
      sender_phone: '0755667788',
      transfer_number: TRANSFER_NUMBER,
      proof_path: mockProofImage(800, 'wave', 'REF-DEMO-4'),
      proof_url: mockProofImage(800, 'wave', 'REF-DEMO-4'),
      client_note: 'Capture partielle, désolé.',
      status: 'rejected',
      admin_note: 'Montant illisible sur la capture, merci de redéposer la demande.',
      processed_at: iso(60 * 24 * 3),
      created_at: iso(60 * 24 * 3 + 200),
      updated_at: iso(60 * 24 * 3),
      client: { id: moussa.id, full_name: moussa.full_name, email: moussa.email, phone: moussa.phone },
    },
  ]

  const messages: Message[] = [
    {
      id: newId(),
      user_id: awa.id,
      sender_id: awa.id,
      sender_role: 'client',
      body: 'Bonjour, je viens de transférer 12 500 FCFA. Voici la capture.',
      attachment_path: null,
      read_by_admin: false,
      read_by_client: true,
      created_at: iso(119),
    },
    {
      id: newId(),
      user_id: awa.id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: 'Bonjour Awa, merci ! La capture est bien reçue, nous vérifions le transfert et revenons vers vous très vite.',
      attachment_path: null,
      read_by_admin: true,
      read_by_client: false,
      created_at: iso(112),
    },
    {
      id: newId(),
      user_id: moussa.id,
      sender_id: moussa.id,
      sender_role: 'client',
      body: 'Bonjour, mon reçu a été refusé. Puis-je renvoyer une nouvelle capture ?',
      attachment_path: null,
      read_by_admin: false,
      read_by_client: true,
      created_at: iso(44),
    },
    {
      id: newId(),
      user_id: moussa.id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: 'Bonjour Moussa, oui bien sûr : depuis « Recharger », déposez la capture complète et nous validons rapidement.',
      attachment_path: null,
      read_by_admin: true,
      read_by_client: false,
      created_at: iso(40),
    },
  ]

  return {
    profiles: [admin, awa, moussa],
    transactions,
    messages,
    session: null,
    passwords: {
      'admin@paykal.app': btoa('Admin#2024'),
      'client@paykal.app': btoa('Client#2024'),
      'moussa@paykal.app': btoa('Client#2024'),
    },
  }
}

/* -------------------------------------------------------------------------- */
/*                              Persistance locale                             */
/* -------------------------------------------------------------------------- */

let cache: DemoDb | null = null
const listeners = new Set<() => void>()

function load(): DemoDb {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb
      if (parsed && Array.isArray(parsed.profiles) && Array.isArray(parsed.transactions)) {
        cache = parsed
        return cache
      }
    }
  } catch {
    /* données corrompues -> ré-initialisation */
  }
  cache = seedDatabase()
  save()
  return cache
}

function save(): void {
  if (!cache) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.warn('[PayKal][démo] Sauvegarde locale impossible :', error)
  }
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* ignoré */
    }
  }
}

function wait<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms))
}

function currentProfile(db: DemoDb): Profile | null {
  if (!db.session) return null
  return db.profiles.find((profile) => profile.id === db.session) ?? null
}

function attachClient(db: DemoDb, transaction: Transaction): Transaction {
  const profile = db.profiles.find((item) => item.id === transaction.user_id)
  return {
    ...transaction,
    client: profile
      ? { id: profile.id, full_name: profile.full_name, email: profile.email, phone: profile.phone }
      : null,
  }
}

export function resetDemoData(): void {
  cache = seedDatabase()
  save()
  notify()
}

export const demoAccounts = [
  { role: 'admin' as Role, email: 'admin@paykal.app', password: 'Admin#2024', label: 'Administrateur' },
  { role: 'client' as Role, email: 'client@paykal.app', password: 'Client#2024', label: 'Client — Awa Diop' },
  { role: 'client' as Role, email: 'moussa@paykal.app', password: 'Client#2024', label: 'Client — Moussa Traoré' },
]

/* -------------------------------------------------------------------------- */
/*                                API de démo                                  */
/* -------------------------------------------------------------------------- */

export const demoApi: Api = {
  mode: 'demo',

  async getCurrentProfile() {
    return wait(currentProfile(load()))
  },

  async signIn(email, password) {
    const db = load()
    const normalized = email.trim().toLowerCase()
    const profile = db.profiles.find((item) => item.email.toLowerCase() === normalized)
    if (!profile) throw new Error('Aucun compte de démonstration ne correspond à cet e-mail.')
    const expected = db.passwords[normalized]
    if (!expected || btoa(password) !== expected) {
      throw new Error('Mot de passe incorrect. (démo — voir les comptes proposés ci-dessous)')
    }
    db.session = profile.id
    save()
    notify()
    return wait(profile)
  },

  async signUp({ email, password, fullName, phone }) {
    const db = load()
    const normalized = email.trim().toLowerCase()
    if (db.profiles.some((item) => item.email.toLowerCase() === normalized)) {
      throw new Error('Un compte existe déjà avec cet e-mail.')
    }
    const profile: Profile = {
      id: `demo-client-${newId().slice(0, 8)}`,
      email: normalized,
      full_name: fullName.trim(),
      phone: phone?.trim() ?? '',
      role: 'client',
      created_at: new Date().toISOString(),
    }
    db.profiles.push(profile)
    db.passwords[normalized] = btoa(password)
    db.session = profile.id
    save()
    notify()
    return wait({ profile, needsEmailConfirmation: false })
  },

  async signOut() {
    const db = load()
    db.session = null
    save()
    notify()
    return wait(undefined)
  },

  async updateProfile({ fullName, phone }) {
    const db = load()
    const profile = currentProfile(db)
    if (!profile) throw new Error('Session expirée : reconnectez-vous.')
    if (fullName !== undefined) profile.full_name = fullName
    if (phone !== undefined) profile.phone = phone
    save()
    notify()
    return wait(profile)
  },

  onAuthStateChange(callback) {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },

  async listTransactions(filter: TransactionFilter = {}) {
    const db = load()
    let rows = db.transactions.map((transaction) => attachClient(db, transaction))
    if (filter.userId) rows = rows.filter((transaction) => transaction.user_id === filter.userId)
    if (filter.status && filter.status !== 'all') rows = rows.filter((transaction) => transaction.status === filter.status)
    if (filter.search) {
      const needle = filter.search.trim().toLowerCase()
      rows = rows.filter((transaction) =>
        [transaction.reference, transaction.sender_name, transaction.client?.full_name, String(transaction.amount)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
    }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    if (filter.limit) rows = rows.slice(0, filter.limit)
    return wait(rows)
  },

  async getTransaction(id) {
    const db = load()
    const found = db.transactions.find((transaction) => transaction.id === id)
    return wait(found ? attachClient(db, found) : null)
  },

  async createTransaction(input: NewTransactionInput, proof: File | null) {
    const db = load()
    const profile = currentProfile(db)
    if (!profile) throw new Error('Session expirée : reconnectez-vous.')

    const id = newId()
    const ref = reference()
    let proofUrl: string | null = null
    if (proof) {
      // createObjectURL peut être indisponible (vieux navigateur, environnement de test).
      try {
        proofUrl = URL.createObjectURL(proof)
        if (proofUrl) sessionProofs.set(id, proofUrl)
      } catch {
        proofUrl = null
      }
    }

    const transaction: Transaction = {
      id,
      reference: ref,
      user_id: profile.id,
      amount: input.amount,
      currency: CURRENCY,
      method: input.method,
      sender_name: input.senderName?.trim() || profile.full_name,
      sender_phone: input.senderPhone?.trim() || profile.phone,
      transfer_number: TRANSFER_NUMBER,
      proof_path: proofUrl,
      proof_url: proofUrl,
      client_note: input.clientNote?.trim() || null,
      status: 'pending',
      admin_note: null,
      processed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client: { id: profile.id, full_name: profile.full_name, email: profile.email, phone: profile.phone },
    }
    db.transactions.unshift(transaction)
    db.messages.push({
      id: newId(),
      user_id: profile.id,
      sender_id: profile.id,
      sender_role: 'client',
      body: `📥 Nouvelle demande de rechargement ${ref} : ${input.amount.toLocaleString('fr-FR')} ${CURRENCY} (${input.method}). Reçu déposé, en attente de validation.`,
      attachment_path: null,
      read_by_admin: false,
      read_by_client: true,
      created_at: new Date().toISOString(),
    })
    save()
    notify()
    return wait(transaction)
  },

  async reviewTransaction({ id, status, adminNote }) {
    const db = load()
    const admin = currentProfile(db)
    const transaction = db.transactions.find((item) => item.id === id)
    if (!transaction) throw new Error('Transaction introuvable.')
    transaction.status = status as TxStatus
    transaction.admin_note = adminNote?.trim() || null
    transaction.processed_at = new Date().toISOString()
    transaction.updated_at = transaction.processed_at
    db.messages.push({
      id: newId(),
      user_id: transaction.user_id,
      sender_id: admin?.id ?? 'demo-admin-0001',
      sender_role: 'admin',
      body:
        `Votre demande de rechargement ${transaction.reference} (${transaction.amount.toLocaleString('fr-FR')} ${CURRENCY}) a été ` +
        (status === 'approved' ? '✅ validée.' : '❌ refusée.') +
        (adminNote?.trim() ? ` Motif : ${adminNote.trim()}` : ''),
      attachment_path: null,
      read_by_admin: true,
      read_by_client: false,
      created_at: new Date().toISOString(),
    })
    save()
    notify()
    return wait(undefined)
  },

  async stats(): Promise<AppStats> {
    const db = load()
    const stats: AppStats = {
      total: db.transactions.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      clients: db.profiles.filter((profile) => profile.role === 'client').length,
    }
    for (const transaction of db.transactions) {
      if (transaction.status === 'approved') {
        stats.approved += 1
        stats.approvedAmount += transaction.amount
      } else if (transaction.status === 'rejected') {
        stats.rejected += 1
      } else {
        stats.pending += 1
        stats.pendingAmount += transaction.amount
      }
    }
    return wait(stats, 120)
  },

  async listConversation(conversationUserId) {
    const db = load()
    const rows = db.messages
      .filter((message) => message.user_id === conversationUserId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    return wait(rows)
  },

  async listThreads(): Promise<ThreadSummary[]> {
    const db = load()
    const grouped = new Map<string, Message[]>()
    for (const message of db.messages) {
      const list = grouped.get(message.user_id) ?? []
      list.push(message)
      grouped.set(message.user_id, list)
    }
    const threads: ThreadSummary[] = []
    for (const [userId, list] of grouped) {
      list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      const last = list[list.length - 1]
      const profile = db.profiles.find((item) => item.id === userId)
      threads.push({
        user_id: userId,
        full_name: profile?.full_name || 'Client PayKal',
        email: profile?.email ?? '',
        phone: profile?.phone ?? '',
        last_message: last.body,
        last_message_at: last.created_at,
        last_sender_role: last.sender_role,
        unread: list.filter((message) => message.sender_role === 'client' && !message.read_by_admin).length,
        message_count: list.length,
      })
    }
    threads.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
    return wait(threads)
  },

  async sendMessage({ conversationUserId, body, role }) {
    const db = load()
    const profile = currentProfile(db)
    if (!profile) throw new Error('Session expirée : reconnectez-vous.')
    const message: Message = {
      id: newId(),
      user_id: conversationUserId,
      sender_id: profile.id,
      sender_role: role,
      body: body.trim(),
      attachment_path: null,
      read_by_client: role === 'client',
      read_by_admin: role === 'admin',
      created_at: new Date().toISOString(),
    }
    db.messages.push(message)
    save()
    notify()
    return wait(message, 90)
  },

  async markConversationRead({ conversationUserId, role }) {
    const db = load()
    let changed = false
    for (const message of db.messages) {
      if (message.user_id !== conversationUserId) continue
      if (role === 'admin' && !message.read_by_admin) {
        message.read_by_admin = true
        changed = true
      }
      if (role === 'client' && !message.read_by_client) {
        message.read_by_client = true
        changed = true
      }
    }
    if (changed) {
      save()
      notify()
    }
    return wait(undefined, 60)
  },

  async listClients() {
    const db = load()
    return wait([...db.profiles].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))
  },

  async getProofUrl(path) {
    if (!path) return null
    if (sessionProofs.has(path)) return sessionProofs.get(path) ?? null
    return wait(path, 40)
  },

  subscribeRealtime(callback) {
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  },
}
