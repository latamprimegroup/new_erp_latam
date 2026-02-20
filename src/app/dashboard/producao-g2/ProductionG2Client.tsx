'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  PARA_CRIACAO: 'Para Criação',
  CRIANDO_GMAIL: 'Criando Gmail',
  CRIANDO_GOOGLE_ADS: 'Criando Google Ads',
  VINCULANDO_CNPJ: 'Vinculando CNPJ',
  CONFIGURANDO_PERFIL_PAGAMENTO: 'Config. Perfil Pagamento',
  EM_REVISAO: 'Em Revisão',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  ENVIADA_ESTOQUE: 'Enviada para Estoque',
  ARQUIVADA: 'Arquivada',
}

type Item = {
  id: string
  taskName: string
  currency: string
  codeG2: string
  itemId: string
  status: string
  stockAccountId: string | null
  cnpjNumber: string | null
  siteUrl: string | null
  googleAdsCustomerId: string | null
  creatorId: string
  creator: { name: string | null }
  client: { user: { name: string | null } } | null
  deliveryGroup: { groupNumber: string } | null
  rejectedReason: string | null
  createdAt: string
}

type Kpis = {
  totalToday: number
  totalMonth: number
  inReview: number
  rejected: number
  approved: number
  approvalRate: number
}

type MetaEngine = {
  metaMaxima: number
  producaoAtual: number
  producaoDiariaMedia: number
  diasRestantes: number
  producaoDiariaNecessaria: number
  projecao: number
  metaEmRisco: boolean
  percentual: number
}

export function ProductionG2Client() {
  const { data: session } = useSession()
  const canApprove = session?.user?.role === 'ADMIN' || session?.user?.role === 'FINANCE'
  const [items, setItems] = useState<Item[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [meta, setMeta] = useState<MetaEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterCreator) params.set('creatorId', filterCreator)
    if (filterCurrency) params.set('currency', filterCurrency)
    const [listRes, dashRes, metaRes] = await Promise.all([
      fetch(`/api/production-g2?${params}`),
      fetch(`/api/production-g2/dashboard?${params}`),
      fetch('/api/production-g2/agent/meta'),
    ])
    if (listRes.ok) {
      const d = await listRes.json()
      setItems(d.items || d)
    }
    if (dashRes.ok) {
      const k = await dashRes.json()
      setKpis(k.kpis ?? k)
    }
    if (metaRes.ok) {
      setMeta(await metaRes.json())
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filterStatus, filterCreator, filterCurrency])

  async function handleApprove(id: string) {
    const res = await fetch(`/api/production-g2/${id}/approve`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) load()
    else {
      const msg = data.blockers?.length ? data.blockers.join('\n') : data.error
      alert(msg || 'Erro ao aprovar')
    }
  }

  async function handleReject(id: string) {
    const reason = prompt('Motivo da reprovação (obrigatório):')
    if (!reason?.trim()) return
    const res = await fetch(`/api/production-g2/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectedReason: reason }),
    })
    if (res.ok) load()
    else alert((await res.json()).error || 'Erro')
  }

  async function handleSendToStock(id: string) {
    const res = await fetch(`/api/production-g2/${id}/send-to-stock`, { method: 'POST' })
    if (res.ok) load()
    else alert((await res.json()).error || 'Erro')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ads-antracite">Produção Google G2</h1>
        <Link
          href="/dashboard/producao-g2/nova"
          className="btn-primary"
        >
          Nova Produção G2
        </Link>
      </div>

      {meta && (
        <div
          className={`card border-2 transition-all duration-300 ${
            meta.metaEmRisco
              ? 'border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/50'
              : 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Motor de meta — {meta.metaEmRisco ? '⚠ Meta em risco' : '✓ No ritmo'}
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary-600">{meta.producaoAtual}</span>
              <span className="text-slate-500">/ {meta.metaMaxima}</span>
              <span className="text-sm font-medium text-slate-600">({meta.percentual}%)</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <p className="text-slate-500">Projeção do mês</p>
              <p className="font-semibold text-slate-800">{meta.projecao}</p>
            </div>
            <div>
              <p className="text-slate-500">Ritmo médio/dia</p>
              <p className="font-semibold text-slate-800">{meta.producaoDiariaMedia}</p>
            </div>
            <div>
              <p className="text-slate-500">Necessário/dia</p>
              <p
                className={`font-semibold ${
                  meta.metaEmRisco ? 'text-amber-700' : 'text-slate-800'
                }`}
              >
                {meta.producaoDiariaNecessaria}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Dias restantes</p>
              <p className="font-semibold text-slate-800">{meta.diasRestantes}</p>
            </div>
          </div>
        </div>
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card">
            <p className="text-sm text-slate-600">Produzido hoje</p>
            <p className="text-2xl font-bold text-primary-600">{kpis.totalToday}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Produzido no mês</p>
            <p className="text-2xl font-bold text-primary-600">{kpis.totalMonth}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Em revisão</p>
            <p className="text-2xl font-bold text-amber-600">{kpis.inReview}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Reprovadas</p>
            <p className="text-2xl font-bold text-red-600">{kpis.rejected}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Aprovadas</p>
            <p className="text-2xl font-bold text-emerald-600">{kpis.approved}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Taxa aprovação</p>
            <p className="text-2xl font-bold text-primary-600">{kpis.approvalRate}%</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border-gray-300 text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={filterCurrency}
          onChange={(e) => setFilterCurrency(e.target.value)}
          className="rounded border-gray-300 text-sm"
        >
          <option value="">Todas as moedas</option>
          <option value="BRL">BRL</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0 rounded-2xl">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Nenhum registro encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Código</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Tarefa</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Responsável</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">Criado em</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-primary-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/producao-g2/${item.id}`}
                        className="text-primary-600 hover:underline font-mono text-sm"
                      >
                        {item.codeG2}
                      </Link>
                      <span className="text-xs text-slate-400 block">{item.itemId}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{item.taskName}</td>
                    <td className="px-4 py-3 text-sm">{item.creator?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === 'APROVADA' || item.status === 'ENVIADA_ESTOQUE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'REPROVADA'
                              ? 'bg-red-100 text-red-700'
                              : item.status === 'EM_REVISAO'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/producao-g2/${item.id}`}
                        className="text-primary-600 hover:underline text-sm mr-2"
                      >
                        Ver
                      </Link>
                      {canApprove && item.status === 'EM_REVISAO' && (
                        <>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="text-emerald-600 hover:underline text-sm mr-2"
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            className="text-red-600 hover:underline text-sm mr-2"
                          >
                            Reprovar
                          </button>
                        </>
                      )}
                      {canApprove && item.status === 'APROVADA' && !item.stockAccountId && (
                        <button
                          onClick={() => handleSendToStock(item.id)}
                          className="text-primary-600 hover:underline text-sm"
                        >
                          Enviar p/ Estoque
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
