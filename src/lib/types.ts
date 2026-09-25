/* ==========================================================================
 * PayKal — types du domaine (partagés entre l'API "live" Supabase
 * et le backend de démonstration local)
 * ========================================================================== */

export type Role = 'client' | 'admin'

export type DataMode = 'live' | 'demo'

/** 'pending' = En attente · 'approved' = Validé · 'rejected' = Refusé */
export type TxStatus = 'pending' | 'approved' | 'rejected'

export type PaymentMethod = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'autre'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string
  role: Role
  created_at: string
}

export interface Transaction {
  id: string
  reference: string
  user_id: string
  amount: number
  currency: string
  method: PaymentMethod
  sender_name: string | null
  sender_phone: string | null
  transfer_number: string
  proof_path: string | null
  proof_url: string | null
  client_note: string | null
  status: TxStatus
  admin_note: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  /** Renseigné côté admin : informations du client qui a déposé la demande. */
  client?: TransactionClient | null
}

export interface TransactionClient {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
}

export interface Message {
  id: string
  user_id: string
  sender_id: string
  sender_role: Role
  body: string
  attachment_path: string | null
  read_by_admin: boolean
  read_by_client: boolean
  created_at: string
}

export interface ThreadSummary {
  user_id: string
  full_name: string
  email: string
  phone: string
  last_message: string
  last_message_at: string
  last_sender_role: Role
  unread: number
  message_count: number
}

export interface NewTransactionInput {
  amount: number
  method: PaymentMethod
  senderName?: string
  senderPhone?: string
  clientNote?: string
}

export interface TransactionFilter {
  userId?: string
  status?: TxStatus | 'all'
  search?: string
  limit?: number
}

export interface SignUpResult {
  profile: Profile | null
  /** true si Supabase demande la confirmation de l'e-mail avant connexion. */
  needsEmailConfirmation: boolean
}

export interface AppStats {
  total: number
  pending: number
  approved: number
  rejected: number
  approvedAmount: number
  pendingAmount: number
  clients: number
}

/** Contrat d'API implémenté par `api.ts` (Supabase) et `demoApi.ts` (local). */
export interface Api {
  readonly mode: DataMode

  /* --- Authentification ------------------------------------------------- */
  getCurrentProfile(): Promise<Profile | null>
  signIn(email: string, password: string): Promise<Profile>
  signUp(input: { email: string; password: string; fullName: string; phone?: string }): Promise<SignUpResult>
  signOut(): Promise<void>
  updateProfile(patch: { fullName?: string; phone?: string }): Promise<Profile>
  /** S'abonne aux changements d'authentification (retourne la fonction de désabonnement). */
  onAuthStateChange(callback: () => void): () => void

  /* --- Transactions ----------------------------------------------------- */
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>
  getTransaction(id: string): Promise<Transaction | null>
  createTransaction(input: NewTransactionInput, proof: File | null): Promise<Transaction>
  reviewTransaction(input: { id: string; status: 'approved' | 'rejected'; adminNote?: string }): Promise<void>
  stats(): Promise<AppStats>

  /* --- Messagerie ------------------------------------------------------- */
  listConversation(conversationUserId: string): Promise<Message[]>
  listThreads(): Promise<ThreadSummary[]>
  sendMessage(input: { conversationUserId: string; body: string; role: Role }): Promise<Message>
  markConversationRead(input: { conversationUserId: string; role: Role }): Promise<void>

  /* --- Clients (admin) -------------------------------------------------- */
  listClients(): Promise<Profile[]>

  /* --- Preuves de paiement ---------------------------------------------- */
  getProofUrl(path: string | null): Promise<string | null>

  /* --- Temps réel ------------------------------------------------------- */
  /** Retourne une fonction de désabonnement. `callback` est appelé à chaque changement. */
  subscribeRealtime(callback: () => void): () => void
}
