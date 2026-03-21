'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useTheme } from '@/contexts/ThemeContext'

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
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const darkStyles = {
    metaCard: isDark ? { background: '#151d2e', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#e5e7eb' } : {},
    metaCardOk: isDark ? { background: '#151d2e', borderColor: 'rgba(16, 185, 129, 0.5)', color: '#e5e7eb' } : {},
    select: isDark ? { background: '#151d2e', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' } : {},
    card: isDark ? { background: '#151d2e' } : {},
    thead: isDark ? { background: 'rgba(21, 29, 46, 0.95)' } : {},
    th: isDark ? { color: '#d1d5db' } : {},
    td: isDark ? { color: '#e5e7eb' } : {},
    muted: isDark ? { color: '#9ca3af' } : {},
    accent: isDark ? { color: '#60a5fa' } : {},
  }
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
        <h1 className="text-2xl font-bold" style={isDark ? { color: '#f3f4f6' } : {}}>Produção Google G2</h1>
        <Link
          href="/dashboard/producao-g2/nova"
          className="btn-primary"
        >
          Nova Produção G2
        </Link>
      </div>

      {meta && (
        <div
          className={`motor-meta-card rounded-xl border-2 p-5 shadow-ads transition-all duration-300 ${
            meta.metaEmRisco
              ? 'border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/50'
              : 'no-risco border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/50'
          }`}
          style={meta.metaEmRisco ? darkStyles.metaCard : darkStyles.metaCardOk}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold" style={darkStyles.metaCard}>
              Motor de meta — {meta.metaEmRisco ? '⚠ Meta em risco' : '✓ No ritmo'}
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={isDark ? { color: '#60a5fa' } : {}}>{meta.producaoAtual}</span>
              <span style={darkStyles.muted}>/ {meta.metaMaxima}</span>
              <span className="text-sm font-medium" style={darkStyles.muted}>({meta.percentual}%)</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <p style={darkStyles.muted}>Projeção do mês</p>
              <p className="font-semibold" style={darkStyles.metaCard}>{meta.projecao}</p>
            </div>
            <div>
              <p style={darkStyles.muted}>Ritmo médio/dia</p>
              <p className="font-semibold" style={darkStyles.metaCard}>{meta.producaoDiariaMedia}</p>
            </div>
            <div>
              <p style={darkStyles.muted}>Necessário/dia</p>
              <p className="font-semibold" style={meta.metaEmRisco && isDark ? { color: '#fbbf24' } : darkStyles.metaCard}>
                {meta.producaoDiariaNecessaria}
              </p>
            </div>
            <div>
              <p style={darkStyles.muted}>Dias restantes</p>
              <p className="font-semibold" style={darkStyles.metaCard}>{meta.diasRestantes}</p>
            </div>
          </div>
        </div>
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Produzido hoje', value: kpis.totalToday, color: '#60a5fa' },
            { label: 'Produzido no mês', value: kpis.totalMonth, color: '#60a5fa' },
            { label: 'Em revisão', value: kpis.inReview, color: '#fbbf24' },
            { label: 'Reprovadas', value: kpis.rejected, color: '#f87171' },
            { label: 'Aprovadas', value: kpis.approved, color: '#34d399' },
            { label: 'Taxa aprovação', value: `${kpis.approvalRate}%`, color: '#60a5fa' },
          ].map((k) => (
            <div key={k.label} className="card" style={darkStyles.card}>
              <p className="text-sm" style={darkStyles.muted}>{k.label}</p>
              <p className="text-2xl font-bold" style={isDark ? { color: k.color } : {}}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border px-4 py-2 text-sm w-auto min-w-[140px] focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 outline-none"
          style={darkStyles.select}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={filterCurrency}
          onChange={(e) => setFilterCurrency(e.target.value)}
          className="rounded-lg border px-4 py-2 text-sm w-auto min-w-[140px] focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 outline-none"
          style={darkStyles.select}
        >
          <option value="">Todas as moedas</option>
          <option value="BRL">BRL</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0 rounded-2xl" style={darkStyles.card}>
        {loading ? (
          <div className="p-8 text-center" style={darkStyles.muted}>Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center" style={darkStyles.muted}>Nenhum registro encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200" style={darkStyles.thead}>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>Código</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>Tarefa</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>Responsável</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>Criado em</th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={darkStyles.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-primary-50/30 transition-colors">
                    <td className="px-4 py-3" style={darkStyles.td}>
                      <Link
                        href={`/dashboard/producao-g2/${item.id}`}
                        className="hover:underline font-mono text-sm"
                        style={darkStyles.accent}
                      >
                        {item.codeG2}
                      </Link>
                      <span className="text-xs block" style={darkStyles.muted}>{item.itemId}</span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={darkStyles.td}>{item.taskName}</td>
                    <td className="px-4 py-3 text-sm" style={darkStyles.td}>{item.creator?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={isDark ? (item.status === 'APROVADA' || item.status === 'ENVIADA_ESTOQUE' ? { background: 'rgba(16,185,129,0.3)', color: '#34d399' } : item.status === 'REPROVADA' ? { background: 'rgba(239,68,68,0.3)', color: '#f87171' } : item.status === 'EM_REVISAO' ? { background: 'rgba(245,158,11,0.3)', color: '#fbbf24' } : { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' }) : {}}
                      >
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={darkStyles.td}>
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/producao-g2/${item.id}`}
                        className="hover:underline text-sm mr-2"
                        style={darkStyles.accent}
                      >
                        Ver
                      </Link>
                      {canApprove && item.status === 'EM_REVISAO' && (
                        <>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="hover:underline text-sm mr-2"
                            style={darkStyles.accent}
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            className="hover:underline text-sm mr-2"
                            style={isDark ? { color: '#f87171' } : {}}
                          >
                            Reprovar
                          </button>
                        </>
                      )}
                      {canApprove && item.status === 'APROVADA' && !item.stockAccountId && (
                        <button
                          onClick={() => handleSendToStock(item.id)}
                          className="hover:underline text-sm"
                          style={darkStyles.accent}
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
