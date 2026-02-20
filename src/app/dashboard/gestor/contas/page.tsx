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

const STATUS: Record<string, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  AVAILABLE: 'Disponível',
}

type Account = {
  id: string
  platform: string
  type: string
  yearStarted: number | null
  niche: string | null
  minConsumed: { toString: () => string } | null
  purchasePrice: { toString: () => string } | null
  salePrice: { toString: () => string } | null
  markupPercent: { toString: () => string } | null
  status: string
  createdAt: string
}

export default function GerenciarContasPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    const params = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/gestor/contas${params}`)
      .then((r) => r.json())
      .then(setAccounts)
      .finally(() => setLoading(false))
  }, [filterStatus])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/gestor" className="text-gray-500 hover:text-gray-700">
            ← Voltar
          </Link>
          <h1 className="heading-1">
            Gerenciar Contas
          </h1>
        </div>
        <Link href="/dashboard/gestor/lancar" className="btn-primary">
          Lançar Nova Conta
        </Link>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : accounts.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhuma conta cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Plataforma</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Ano</th>
                  <th className="pb-2 pr-4">Preço compra</th>
                  <th className="pb-2 pr-4">Preço venda</th>
                  <th className="pb-2 pr-4">Markup</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{PLATFORMS[a.platform] || a.platform}</td>
                    <td className="py-3 pr-4">{a.type}</td>
                    <td className="py-3 pr-4">{a.yearStarted || '—'}</td>
                    <td className="py-3 pr-4">{a.purchasePrice ? `R$ ${Number(a.purchasePrice).toLocaleString()}` : '—'}</td>
                    <td className="py-3 pr-4">{a.salePrice ? `R$ ${Number(a.salePrice).toLocaleString()}` : '—'}</td>
                    <td className="py-3 pr-4">{a.markupPercent ? `${Number(a.markupPercent)}%` : '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          a.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          a.status === 'APPROVED' || a.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {STATUS[a.status] || a.status}
                      </span>
                    </td>
                    <td className="py-3">{new Date(a.createdAt).toLocaleDateString('pt-BR')}</td>
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
