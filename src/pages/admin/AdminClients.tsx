/* ==========================================================================
 * PayKal — fichier clients (administrateur)
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/AppShell'
import { Alert, Avatar, Button, Card, EmptyState, Input, SkeletonList, Stat } from '../../components/ui'
import { useSession } from '../../context/SessionContext'
import { CURRENCY } from '../../lib/config'
import { describeError, formatAmountShort, formatDate, formatPhone } from '../../lib/format'
import type { Profile, Transaction } from '../../lib/types'

interface ClientRow {
  profile: Profile
  transactions: Transaction[]
  approvedAmount: number
  pendingCount: number
}

export default function AdminClients() {
  const { api } = useSession()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Profile[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const [profiles, rows] = await Promise.all([api.listClients(), api.listTransactions({ limit: 500 })])
      setClients(profiles.filter((profile) => profile.role === 'client'))
      setTransactions(rows)
      setError(null)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const rows: ClientRow[] = useMemo(
    () =>
      clients.map((profile) => {
        const own = transactions.filter((transaction) => transaction.user_id === profile.id)
        return {
          profile,
          transactions: own,
          approvedAmount: own
            .filter((transaction) => transaction.status === 'approved')
            .reduce((sum, transaction) => sum + transaction.amount, 0),
          pendingCount: own.filter((transaction) => transaction.status === 'pending').length,
        }
      }),
    [clients, transactions],
  )

  const visible = rows.filter((row) => {
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return [row.profile.full_name, row.profile.email, row.profile.phone].some((value) =>
      value.toLowerCase().includes(needle),
    )
  })

  const totalApproved = rows.reduce((sum, row) => sum + row.approvedAmount, 0)

  return (
    <AppShell variant="admin">
      <div className="page-head">
        <div>
          <h1>Fichier clients</h1>
          <p>Suivi des comptes, volumes rechargés et demandes en attente.</p>
        </div>
        <Button variant="secondary" icon="🔄" onClick={() => void load()} loading={loading}>
          Actualiser
        </Button>
      </div>

      {error ? (
        <Alert tone="error" title="Chargement impossible">
          {error}
        </Alert>
      ) : null}

      <div className="grid cols-3 mb-2">
        <Stat label="Clients inscrits" value={rows.length} />
        <Stat label="Volume validé" value={formatAmountShort(totalApproved, CURRENCY)} tone="approved" />
        <Stat
          label="Demandes en attente"
          value={rows.reduce((sum, row) => sum + row.pendingCount, 0)}
          tone="pending"
        />
      </div>

      <Card tight>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un client (nom, e-mail, téléphone)…"
          aria-label="Rechercher un client"
        />
      </Card>

      {loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Aucun client trouvé"
          message="Les comptes créés depuis l’application apparaîtront ici automatiquement."
        />
      ) : (
        <div className="tx-list">
          {visible.map(({ profile, transactions: own, approvedAmount, pendingCount }) => (
            <article className="tx" key={profile.id}>
              <div className="tx-top">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Avatar name={profile.full_name || profile.email} size="lg" />
                  <div>
                    <div className="tx-ref">{profile.full_name || 'Client sans nom'}</div>
                    <div className="text-muted text-sm">{profile.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="tx-amount">{formatAmountShort(approvedAmount, CURRENCY)}</div>
                  <div className="text-muted text-sm">{own.length} demande(s) · {pendingCount} en attente</div>
                </div>
              </div>

              <div className="tx-meta">
                <span>
                  📞 <b>{profile.phone ? formatPhone(profile.phone) : '—'}</b>
                </span>
                <span>
                  📅 Inscrit le <b>{formatDate(profile.created_at)}</b>
                </span>
                {pendingCount > 0 ? <span className="badge pending">⏳ {pendingCount} à valider</span> : null}
              </div>

              <div className="tx-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="💬"
                  onClick={() => navigate(`/admin/messages?client=${profile.id}`)}
                >
                  Ouvrir la conversation
                </Button>
                <Button variant="ghost" size="sm" icon="💳" onClick={() => navigate('/admin/transactions')}>
                  Voir ses transactions
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
