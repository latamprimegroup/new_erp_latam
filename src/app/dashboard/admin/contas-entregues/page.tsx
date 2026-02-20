'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Account = {
  id: string
  platform: string
  type: string
  googleAdsCustomerId: string | null
  status: string
  deliveredAt: string | null
  client: { user: { name: string | null; email: string } } | null
}

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai',
  TIKTOK_ADS: 'TikTok',
  OTHER: 'Outro',
}

export default function AdminContasEntreguesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    const params = filter ? `?hasCustomerId=${filter}` : ''
    fetch(`/api/admin/contas-entregues${params}`)
      .then((r) => r.json())
      .then(setAccounts)
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
                  <th className="pb-2 pr-4">Conta</th>
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Customer ID</th>
                  <th className="pb-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      {PLATFORM_LABELS[a.platform]} — {a.type} ({a.id.slice(0, 8)})
                    </td>
                    <td className="py-3 pr-4">{a.client?.user?.name || a.client?.user?.email || '—'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
