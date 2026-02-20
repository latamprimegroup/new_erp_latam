'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const PLATFORMS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai Ads',
  TIKTOK_ADS: 'TikTok Ads',
  OTHER: 'Outro',
}

type Account = {
  id: string
  platform: string
  type: string
  status: string
  salePrice: { toString: () => string } | null
  manager: { user: { name: string | null; email: string } } | null
  supplier: { name: string } | null
  createdAt: string
}

export default function ContasOfertadasPage() {
  const [list, setList] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/contas-ofertadas')
    const data = await res.json()
    if (res.ok) setList(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    const res = await fetch(`/api/admin/contas-ofertadas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'reject' ? { action, rejectionReason: rejectReason } : { action }),
    })
    if (res.ok) {
      setRejectingId(null)
      setRejectReason('')
      load()
    } else {
      const e = await res.json()
      alert(e.error || 'Erro')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Contas ofertadas pelos gestores</h1>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : list.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhuma conta pendente de aprovação.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Conta</th>
                  <th className="pb-2 pr-4">Gestor</th>
                  <th className="pb-2 pr-4">Fornecedor</th>
                  <th className="pb-2 pr-4">Preço</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">
                      {PLATFORMS[a.platform] || a.platform} — {a.type}
                    </td>
                    <td className="py-3 pr-4">{a.manager?.user?.name || a.manager?.user?.email || '—'}</td>
                    <td className="py-3 pr-4">{a.supplier?.name || '—'}</td>
                    <td className="py-3 pr-4">{a.salePrice ? `R$ ${Number(a.salePrice).toLocaleString()}` : '—'}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleAction(a.id, 'approve')}
                        className="text-green-600 hover:underline text-xs mr-2"
                      >
                        Aprovar
                      </button>
                      {rejectingId === a.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Motivo"
                            className="input-field py-1 px-2 text-xs w-32"
                          />
                          <button type="button" onClick={() => handleAction(a.id, 'reject')} className="text-red-600 text-xs">Ok</button>
                          <button type="button" onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-gray-500 text-xs">Cancelar</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRejectingId(a.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Rejeitar
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
