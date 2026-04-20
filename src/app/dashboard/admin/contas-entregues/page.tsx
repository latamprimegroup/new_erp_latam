'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Account = {
  id: string
  clientId: string | null
  platform: string
  type: string
  googleAdsCustomerId: string | null
  status: string
  deliveredAt: string | null
  lastSpendSyncAt: string | null
  spent: string | number | null
  rmaHistoryCount?: number
  client: { id: string; user: { name: string | null; email: string } } | null
  manager: { user: { name: string | null; email: string } } | null
  supplier: { name: string } | null
}

function googleAdsOverviewUrl(customerId: string | null): string | null {
  if (!customerId) return null
  const digits = customerId.replace(/\D/g, '')
  if (digits.length !== 10) return null
  return `https://ads.google.com/aw/overview?ocid=${digits}`
}

type SpendSyncDot = 'none' | 'waiting' | 'ok' | 'stale'

function spendSyncDot(a: Account): SpendSyncDot {
  if (!a.googleAdsCustomerId) return 'none'
  if (!a.lastSpendSyncAt) return 'waiting'
  const h = (Date.now() - new Date(a.lastSpendSyncAt).getTime()) / 3600000
  if (h <= 72) return 'ok'
  return 'stale'
}

const SYNC_DOT_META: Record<
  SpendSyncDot,
  { label: string; className: string }
> = {
  none: { label: 'Sem Customer ID para sync', className: 'bg-gray-300 dark:bg-gray-600' },
  waiting: { label: 'Customer ID vinculado; aguardando primeira sincronização de gastos', className: 'bg-amber-400' },
  ok: { label: 'Sincronização de gastos recente (últimas 72h)', className: 'bg-emerald-500' },
  stale: { label: 'Sem sync recente — verificar token ou conta no Google Ads', className: 'bg-red-500' },
}

function formatBRL(value: string | number | null | undefined): string {
  const n = value == null ? 0 : typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export default function AdminContasEntreguesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [clientSpendGoogle, setClientSpendGoogle] = useState<Record<string, number>>({})

  function load() {
    const params = filter ? `?hasCustomerId=${filter}` : ''
    fetch(`/api/admin/contas-entregues${params}`)
      .then((r) => r.json())
      .then((d: Account[] | { accounts?: Account[]; clientSpendGoogle?: Record<string, number> }) => {
        if (Array.isArray(d)) {
          setAccounts(d)
          setClientSpendGoogle({})
        } else {
          setAccounts(d.accounts ?? [])
          setClientSpendGoogle(d.clientSpendGoogle ?? {})
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [filter])

  async function handleSave(accountId: string) {
    if (!customerId.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/contas/${accountId}/google-ads-id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleAdsCustomerId: customerId.trim() }),
      })
      if (res.ok) {
        load()
        setEditing(null)
        setCustomerId('')
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Contas Entregues – Customer ID Google Ads</h1>
      </div>

      <p className="text-gray-600 text-sm mb-6">
        Vincule o Customer ID do Google Ads às contas entregues para que os clientes possam sincronizar gastos.
      </p>

      <div className="card">
        <div className="flex gap-2 mb-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-field py-1.5 px-2 w-48 text-sm"
          >
            <option value="">Todas</option>
            <option value="false">Sem Customer ID</option>
            <option value="true">Com Customer ID</option>
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : accounts.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhuma conta entregue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-2 w-10" title="Status da sincronização de gastos">
                    Sync
                  </th>
                  <th className="pb-2 pr-4">Conta</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Gestor / Fornecedor</th>
                  <th className="pb-2 pr-4">Gasto (últ. sync)</th>
                  <th className="pb-2 pr-4">Customer ID</th>
                  <th className="pb-2 pr-4">Google Ads</th>
                  <th className="pb-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const dot = spendSyncDot(a)
                  const syncMeta = SYNC_DOT_META[dot]
                  const adsUrl = googleAdsOverviewUrl(a.googleAdsCustomerId)
                  const clientTotal =
                    a.clientId != null ? clientSpendGoogle[a.clientId] : undefined
                  return (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-2 align-middle">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${syncMeta.className}`}
                        title={syncMeta.label}
                        aria-label={syncMeta.label}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          Google Ads — {a.type} ({a.id.slice(0, 8)})
                        </span>
                        {(a.rmaHistoryCount ?? 0) > 0 ? (
                          <span
                            className="rounded bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.5 font-medium"
                            title="Histórico de solicitações de reposição (RMA) nesta conta"
                          >
                            RMA ×{a.rmaHistoryCount}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div>{a.client?.user?.name || a.client?.user?.email || '—'}</div>
                      {clientTotal != null && clientTotal > 0 && (
                        <div className="text-xs text-gray-500 mt-0.5" title="Soma do gasto sincronizado (todas as contas Google Ads deste cliente na lista)">
                          Total cliente: {formatBRL(clientTotal)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      <div>{a.manager?.user?.name || a.manager?.user?.email || '—'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{a.supplier?.name || '—'}</div>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{formatBRL(a.spent)}</td>
                    <td className="py-3 pr-4">
                      {editing === a.id ? (
                        <input
                          type="text"
                          value={customerId}
                          onChange={(e) => setCustomerId(e.target.value)}
                          placeholder="123-456-7890"
                          className="input-field w-36 text-sm"
                        />
                      ) : (
                        <span className={a.googleAdsCustomerId ? 'text-green-600' : 'text-gray-400'}>
                          {a.googleAdsCustomerId || '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {adsUrl ? (
                        <a
                          href={adsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 text-sm hover:underline"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {editing === a.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(a.id)}
                            disabled={saving}
                            className="btn-primary text-sm py-1 px-2"
                          >
                            {saving ? '...' : 'Salvar'}
                          </button>
                          <button
                            onClick={() => { setEditing(null); setCustomerId(''); }}
                            className="btn-secondary text-sm py-1 px-2"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(a.id)
                            setCustomerId(a.googleAdsCustomerId || '')
                          }}
                          className="text-primary-600 text-sm hover:underline"
                        >
                          {a.googleAdsCustomerId ? 'Editar' : 'Vincular'}
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
