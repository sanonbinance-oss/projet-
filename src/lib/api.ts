/* ==========================================================================
 * PayKal — API « live » : implémentation Supabase
 * (Auth, PostgreSQL, Realtime, Storage)
 * ========================================================================== */

import { supabase } from './supabaseClient'
import {
  PROOF_SIGNED_URL_TTL,
  RECEIPT_BUCKET,
  TRANSFER_NUMBER,
  MAX_PROOF_BYTES,
  CURRENCY,
} from './config'
import { describeError } from './format'
import type {
  Api,
  AppStats,
  Message,
  NewTransactionInput,
  Profile,
  Role,
  SignUpResult,
  ThreadSummary,
  Transaction,
  TransactionFilter,
  TxStatus,
} from './types'

/* ----------------------------- Utilitaires -------------------------------- */

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function newReference(): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `PK-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

/** Convertit une ligne `transactions` en objet typé (tolérant aux colonnes absentes). */
function mapTransaction(row: Record<string, unknown>): Transaction {
  const num = (value: unknown, fallback = 0) => {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return {
    id: String(row.id),
    reference: String(row.reference ?? row.id),
    user_id: String(row.user_id),
    amount: num(row.amount),
    currency: String(row.currency ?? CURRENCY),
    method: (row.method as Transaction['method']) ?? 'autre',
    sender_name: (row.sender_name as string | null) ?? null,
    sender_phone: (row.sender_phone as string | null) ?? null,
    transfer_number: String(row.transfer_number ?? TRANSFER_NUMBER),
    proof_path: (row.proof_path as string | null) ?? null,
    proof_url: (row.proof_url as string | null) ?? null,
    client_note: (row.client_note as string | null) ?? null,
    status: (row.status as TxStatus) ?? 'pending',
    admin_note: (row.admin_note as string | null) ?? null,
    processed_at: (row.processed_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    client: null,
  }
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    full_name: String(row.full_name ?? ''),
    phone: String(row.phone ?? ''),
    role: (row.role as Role) ?? 'client',
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    sender_id: String(row.sender_id ?? ''),
    sender_role: (row.sender_role as Role) ?? 'client',
    body: String(row.body ?? ''),
    attachment_path: (row.attachment_path as string | null) ?? null,
    read_by_admin: Boolean(row.read_by_admin),
    read_by_client: Boolean(row.read_by_client),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Récupère (ou crée) la ligne `profiles` de l'utilisateur connecté.
 * Filet de sécurité si le trigger `handle_new_user()` n'a pas été installé.
 */
async function ensureProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const user = userData.user
  if (!user) return null

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) {
    // Table absente -> on laisse remonter un message clair via describeError()
    throw error
  }
  if (data) return mapProfile(data as Record<string, unknown>)

  const fallbackProfile = {
    id: user.id,
    email: user.email ?? '',
    full_name: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''),
    phone: String(user.user_metadata?.phone ?? ''),
    role: 'client' as const,
  }
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .upsert(fallbackProfile, { onConflict: 'id' })
    .select('*')
    .maybeSingle()
  if (insertError) throw insertError
  return created ? mapProfile(created as Record<string, unknown>) : mapProfile(fallbackProfile)
}

/* -------------------------------------------------------------------------- */
/*                             Implémentation live                             */
/* -------------------------------------------------------------------------- */

export const liveApi: Api = {
  mode: 'live',

  /* ------------------------------ Auth ---------------------------------- */

  async getCurrentProfile() {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return null
    return ensureProfile()
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new Error(describeError(error))
    if (!data.user) throw new Error('Connexion impossible : aucun utilisateur retourné.')
    const profile = await ensureProfile()
    if (!profile) throw new Error('Profil introuvable après connexion.')
    return profile
  },

  async signUp({ email, password, fullName, phone }): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName, phone: phone ?? '' },
        emailRedirectTo: `${window.location.origin}/connexion`,
      },
    })
    if (error) throw new Error(describeError(error))

    // Session immédiate => confirmation d'e-mail désactivée côté Supabase.
    if (data.session) {
      const profile = await ensureProfile()
      return { profile, needsEmailConfirmation: false }
    }
    return { profile: null, needsEmailConfirmation: true }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error && !describeError(error).toLowerCase().includes('session')) {
      throw new Error(describeError(error))
    }
  },

  async updateProfile({ fullName, phone }) {
    const uid = await currentUserId()
    if (!uid) throw new Error('Session expirée : reconnectez-vous.')
    const patch: Record<string, unknown> = {}
    if (fullName !== undefined) patch.full_name = fullName
    if (phone !== undefined) patch.phone = phone
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select('*').maybeSingle()
    if (error) throw new Error(describeError(error))
    if (!data) throw new Error('Mise à jour impossible : profil introuvable.')
    return mapProfile(data as Record<string, unknown>)
  },

  onAuthStateChange(callback) {
    const { data } = supabase.auth.onAuthStateChange(() => {
      // Un léger délai évite un état intermédiaire pendant le rafraîchissement du jeton.
      window.setTimeout(callback, 0)
    })
    return () => data.subscription.unsubscribe()
  },

  /* --------------------------- Transactions ------------------------------ */

  async listTransactions(filter: TransactionFilter = {}) {
    let query = supabase.from('transactions').select('*').order('created_at', { ascending: false })
    if (filter.userId) query = query.eq('user_id', filter.userId)
    if (filter.status && filter.status !== 'all') query = query.eq('status', filter.status)
    if (filter.limit) query = query.limit(filter.limit)

    const { data, error } = await query
    if (error) throw new Error(describeError(error))
    let transactions = (data ?? []).map((row) => mapTransaction(row as Record<string, unknown>))

    if (filter.search) {
      const needle = filter.search.trim().toLowerCase()
      transactions = transactions.filter((tx) =>
        [tx.reference, tx.sender_name, tx.sender_phone, String(tx.amount), tx.client?.full_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
    }

    // Infos client (l'admin voit tous les profils grâce aux politiques RLS).
    const ids = Array.from(new Set(transactions.map((tx) => tx.user_id)))
    if (ids.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', ids)
      if (!profileError && profiles) {
        const byId = new Map<string, Transaction['client']>()
        for (const profile of profiles as Array<Record<string, unknown>>) {
          byId.set(String(profile.id), {
            id: String(profile.id),
            full_name: (profile.full_name as string | null) ?? null,
            email: (profile.email as string | null) ?? null,
            phone: (profile.phone as string | null) ?? null,
          })
        }
        transactions = transactions.map((tx) => ({ ...tx, client: byId.get(tx.user_id) ?? null }))
      }
    }

    return transactions
  },

  async getTransaction(id) {
    const { data, error } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(describeError(error))
    return data ? mapTransaction(data as Record<string, unknown>) : null
  },

  async createTransaction(input: NewTransactionInput, proof: File | null) {
    const uid = await currentUserId()
    if (!uid) throw new Error('Session expirée : reconnectez-vous avant de déposer une demande.')

    let proofPath: string | null = null
    if (proof) {
      if (proof.size > MAX_PROOF_BYTES) {
        throw new Error('La capture est trop volumineuse (8 Mo maximum).')
      }
      const extension = (proof.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      proofPath = `${uid}/${Date.now()}-${randomId()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(proofPath, proof, {
        cacheControl: '3600',
        upsert: false,
        contentType: proof.type || 'image/jpeg',
      })
      if (uploadError) {
        const detail = describeError(uploadError)
        throw new Error(`Échec du téléversement de la capture : ${detail}`)
      }
    }

    const payload = {
      reference: newReference(),
      user_id: uid,
      amount: input.amount,
      currency: CURRENCY,
      method: input.method,
      sender_name: input.senderName?.trim() || null,
      sender_phone: input.senderPhone?.trim() || null,
      transfer_number: TRANSFER_NUMBER,
      proof_path: proofPath,
      client_note: input.clientNote?.trim() || null,
      status: 'pending' as const,
    }

    const { data, error } = await supabase.from('transactions').insert(payload).select('*').maybeSingle()
    if (error) throw new Error(describeError(error))
    if (!data) throw new Error('La demande a été créée mais aucune donnée n’a été retournée.')

    const transaction = mapTransaction(data as Record<string, unknown>)

    // Message automatique dans la conversation, pour tracer la demande.
    try {
      await supabase.from('messages').insert({
        user_id: uid,
        sender_id: uid,
        sender_role: 'client',
        body: `📥 Nouvelle demande de rechargement ${transaction.reference} : ${transaction.amount.toLocaleString('fr-FR')} ${CURRENCY} (${input.method}). Reçu déposé, en attente de validation.`,
      })
    } catch {
      /* non bloquant : la demande est déjà enregistrée */
    }

    return transaction
  },

  async reviewTransaction({ id, status, adminNote }) {
    const adminId = await currentUserId()
    if (!adminId) throw new Error('Session expirée : reconnectez-vous.')
    const { error } = await supabase
      .from('transactions')
      .update({
        status,
        admin_note: adminNote?.trim() || null,
        processed_at: new Date().toISOString(),
        processed_by: adminId,
      })
      .eq('id', id)
    if (error) throw new Error(describeError(error))

    // Notification automatique au client.
    const { data: tx } = await supabase.from('transactions').select('*').eq('id', id).maybeSingle()
    if (tx) {
      const row = mapTransaction(tx as Record<string, unknown>)
      const label = status === 'approved' ? '✅ validée' : '❌ refusée'
      await supabase.from('messages').insert({
        user_id: row.user_id,
        sender_id: adminId,
        sender_role: 'admin',
        body:
          `Votre demande de rechargement ${row.reference} (${row.amount.toLocaleString('fr-FR')} ${row.currency}) a été ${label}.` +
          (adminNote?.trim() ? ` Motif : ${adminNote.trim()}` : ''),
      })
    }
  },

  async stats(): Promise<AppStats> {
    const { data, error } = await supabase.from('transactions').select('id, amount, status, user_id')
    if (error) throw new Error(describeError(error))
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const stats: AppStats = {
      total: rows.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      clients: 0,
    }
    const clients = new Set<string>()
    for (const row of rows) {
      const amount = Number(row.amount) || 0
      clients.add(String(row.user_id))
      if (row.status === 'approved') {
        stats.approved += 1
        stats.approvedAmount += amount
      } else if (row.status === 'rejected') {
        stats.rejected += 1
      } else {
        stats.pending += 1
        stats.pendingAmount += amount
      }
    }
    stats.clients = clients.size
    return stats
  },

  /* ---------------------------- Messagerie ------------------------------- */

  async listConversation(conversationUserId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', conversationUserId)
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) throw new Error(describeError(error))
    return (data ?? []).map((row) => mapMessage(row as Record<string, unknown>))
  },

  async listThreads(): Promise<ThreadSummary[]> {
    const [{ data: messages, error: messageError }, { data: profiles, error: profileError }] = await Promise.all([
      supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(2000),
      supabase.from('profiles').select('id, full_name, email, phone'),
    ])
    if (messageError) throw new Error(describeError(messageError))
    if (profileError) throw new Error(describeError(profileError))

    const profileById = new Map<string, Record<string, unknown>>()
    for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
      profileById.set(String(profile.id), profile)
    }

    const grouped = new Map<string, Message[]>()
    for (const row of (messages ?? []) as Array<Record<string, unknown>>) {
      const message = mapMessage(row)
      const list = grouped.get(message.user_id) ?? []
      list.push(message)
      grouped.set(message.user_id, list)
    }

    const threads: ThreadSummary[] = []
    for (const [userId, list] of grouped) {
      const last = list[list.length - 1]
      const profile = profileById.get(userId)
      threads.push({
        user_id: userId,
        full_name: (profile?.full_name as string) || (profile?.email as string) || 'Client PayKal',
        email: (profile?.email as string) ?? '',
        phone: (profile?.phone as string) ?? '',
        last_message: last.body,
        last_message_at: last.created_at,
        last_sender_role: last.sender_role,
        unread: list.filter((message) => message.sender_role === 'client' && !message.read_by_admin).length,
        message_count: list.length,
      })
    }

    return threads.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
  },

  async sendMessage({ conversationUserId, body, role }) {
    const senderId = await currentUserId()
    if (!senderId) throw new Error('Session expirée : reconnectez-vous.')
    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: conversationUserId,
        sender_id: senderId,
        sender_role: role,
        body: body.trim(),
        read_by_client: role === 'client',
        read_by_admin: role === 'admin',
      })
      .select('*')
      .maybeSingle()
    if (error) throw new Error(describeError(error))
    if (!data) throw new Error("Le message n'a pas pu être enregistré.")
    return mapMessage(data as Record<string, unknown>)
  },

  async markConversationRead({ conversationUserId, role }) {
    const column = role === 'admin' ? 'read_by_admin' : 'read_by_client'
    const { error } = await supabase
      .from('messages')
      .update({ [column]: true })
      .eq('user_id', conversationUserId)
      .eq(column, false)
    if (error) {
      // Non bloquant : la lecture reste possible même si la mise à jour échoue.
      console.warn('[PayKal] markConversationRead :', describeError(error))
    }
  },

  /* ------------------------------ Clients -------------------------------- */

  async listClients() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(describeError(error))
    return (data ?? []).map((row) => mapProfile(row as Record<string, unknown>))
  },

  /* ------------------------------- Preuves ------------------------------- */

  async getProofUrl(path) {
    if (!path) return null
    if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, PROOF_SIGNED_URL_TTL)
    if (error || !data) {
      // Repli : bucket public
      const { data: publicData } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path)
      return publicData?.publicUrl ?? null
    }
    return data.signedUrl
  },

  /* ------------------------------ Realtime ------------------------------- */

  subscribeRealtime(callback) {
    const channel = supabase
      .channel(`paykal-changes-${randomId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => callback())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => callback())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  },
}
