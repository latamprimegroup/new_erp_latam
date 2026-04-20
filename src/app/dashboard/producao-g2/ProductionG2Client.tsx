'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
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
  bonusAtual?: number
  bonusProjetado?: number
  previsaoTotalSeBaterMeta?: number
}

type ProductionByCreatorRow = { creatorId: string; creatorName: string; count: number }

type MetaHistory = {
  validatedThisMonthToDate: number
  validatedLastMonthSamePeriod: number
  deltaVsLastMonth: number
  periodLabelThisMonth: string
  periodLabelPrevMonth: string
}

type RejectionInsight = { reason: string; count: number }

type ReviewPipeline = {
  avgHoursCreatedToApproval: number | null
  sampleSize: number
}

type RankingRow = {
  producerId: string
  name: string | null
  count: number
  rank: number
  badges: string[]
}

export function ProductionG2Client() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const darkStyles = {
    metaCard: isDark ? { background: '#151d2e', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#f3f4f6' } : {},
    metaCardOk: isDark ? { background: '#151d2e', borderColor: 'rgba(16, 185, 129, 0.5)', color: '#f3f4f6' } : {},
    select: isDark ? { background: '#151d2e', color: '#f9fafb', borderColor: 'rgba(255,255,255,0.25)' } : {},
    card: isDark ? { background: '#151d2e' } : {},
    thead: isDark ? { background: 'rgba(21, 29, 46, 0.95)' } : {},
    th: isDark ? { color: '#e5e7eb' } : {},
    td: isDark ? { color: '#f3f4f6' } : {},
    muted: isDark ? { color: '#d1d5db' } : {},
    accent: isDark ? { color: '#60a5fa' } : {},
  }
  const canApprove = session?.user?.role === 'ADMIN' || session?.user?.role === 'FINANCE'
  const [items, setItems] = useState<Item[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [meta, setMeta] = useState<MetaEngine | null>(null)
  const [productionByCreator, setProductionByCreator] = useState<ProductionByCreatorRow[]>([])
  const [metaHistory, setMetaHistory] = useState<MetaHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('')
  const [rejectionInsights, setRejectionInsights] = useState<RejectionInsight[]>([])
  const [reviewPipeline, setReviewPipeline] = useState<ReviewPipeline | null>(null)
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [showRejectLog, setShowRejectLog] = useState(false)
  const [rejectModal, setRejectModal] = useState<{
    id: string
    reason: string
    reclassify: boolean
    loading: boolean
  } | null>(null)

  useEffect(() => {
    if (searchParams.get('openForm') !== '1') return
    setShowForm(true)
    router.replace('/dashboard/producao-g2', { scroll: false })
  }, [searchParams, router])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterCreator) params.set('creatorId', filterCreator)
    if (filterCurrency) params.set('currency', filterCurrency)
    const [listRes, dashRes, metaRes, rankRes] = await Promise.all([
      fetch(`/api/production-g2?${params}`),
      fetch(`/api/production-g2/dashboard?${params}`),
      fetch('/api/production-g2/agent/meta'),
      fetch('/api/production-g2/agent/ranking'),
    ])
    if (listRes.ok) {
      const d = await listRes.json()
      setItems(d.items || d)
    }
    if (dashRes.ok) {
      const k = await dashRes.json()
      setKpis(k.kpis ?? k)
      const rows: ProductionByCreatorRow[] = Array.isArray(k.productionByCreator) ? k.productionByCreator : []
      setProductionByCreator([...rows].sort((a, b) => b.count - a.count))
      setMetaHistory(k.metaHistory ?? null)
      setRejectionInsights(Array.isArray(k.rejectionInsights) ? k.rejectionInsights : [])
      setReviewPipeline(k.reviewPipeline ?? null)
    } else {
      setRejectionInsights([])
      setReviewPipeline(null)
    }
    if (rankRes.ok) {
      const rj = await rankRes.json()
      setRanking(Array.isArray(rj.ranking) ? rj.ranking : [])
    } else {
      setRanking([])
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

  async function handleReject(id: string, reason: string, reclassify: boolean) {
    if (!reason.trim()) return
    const res = await fetch(`/api/production-g2/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectedReason: reason.trim() }),
    })
    if (!res.ok) {
      alert((await res.json()).error || 'Erro')
      return
    }
    if (reclassify) {
      const rc = await fetch(`/api/production-g2/${id}/reclassify-to-stock`, { method: 'POST' })
      if (!rc.ok) {
        alert((await rc.json()).error || 'Reprovada, mas falhou ao reclassificar para estoque')
      }
    }
    setRejectModal(null)
    load()
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
        <Link href="/dashboard/producao-g2/nova" className="btn-primary">
          + Nova Produção G2
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
          {session?.user?.role === 'PRODUCER' &&
            (meta.previsaoTotalSeBaterMeta ?? 0) > 0 && (
              <p className="text-sm mt-3 font-medium" style={darkStyles.metaCard}>
                Calculadora (pagamento): se atingir {meta.metaMaxima} contas validadas no mês, previsão total ~{' '}
                <span style={darkStyles.accent}>
                  R${' '}
                  {(meta.previsaoTotalSeBaterMeta ?? 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>{' '}
                (salário + por conta + bônus por faixa — conferir fechamento oficial).
              </p>
            )}
          {session?.user?.role === 'PRODUCER' && (
            <p className="text-xs mt-2" style={darkStyles.muted}>
              Bônus variável (faixa) hoje: R${' '}
              {(meta.bonusAtual ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · projetado no ritmo
              atual: R${' '}
              {(meta.bonusProjetado ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          )}
          <p className="text-[11px] mt-3 opacity-80" style={darkStyles.muted}>
            Com variáveis de ambiente (Slack e/ou WhatsApp), o sistema pode avisar automaticamente quando o
            necessário/dia ultrapassar o limite configurado — ver .env.example.
          </p>
        </div>
      )}

      {reviewPipeline?.avgHoursCreatedToApproval != null &&
        reviewPipeline.sampleSize >= 3 &&
        kpis &&
        kpis.inReview > 0 && (
          <p className="text-sm px-1" style={darkStyles.muted}>
            Previsão de fila (revisão): em média ~{reviewPipeline.avgHoursCreatedToApproval} h entre registro e
            aprovação ({reviewPipeline.sampleSize} casos nos últimos 90 dias, mesmo recorte dos filtros). Com{' '}
            {kpis.inReview} em revisão, referência de ~
            {Math.ceil(kpis.inReview * reviewPipeline.avgHoursCreatedToApproval)} h de fila (ordem real pode variar).
          </p>
        )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Produzido hoje', value: kpis.totalToday, color: '#60a5fa', key: 't1' },
            { label: 'Produzido no mês', value: kpis.totalMonth, color: '#60a5fa', key: 't2' },
            { label: 'Em revisão', value: kpis.inReview, color: '#fbbf24', key: 'rev' },
            { label: 'Reprovadas', value: kpis.rejected, color: '#f87171', key: 'rej' },
            { label: 'Aprovadas', value: kpis.approved, color: '#34d399', key: 'ok' },
            { label: 'Taxa aprovação', value: `${kpis.approvalRate}%`, color: '#60a5fa', key: 'rate' },
          ].map((k) => (
            <div key={k.key} className="card" style={darkStyles.card}>
              <p className="text-sm" style={darkStyles.muted}>{k.label}</p>
              <p className="text-2xl font-bold" style={isDark ? { color: k.color } : {}}>{k.value}</p>
              {k.key === 'rej' && kpis.rejected > 0 && rejectionInsights.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRejectLog((v) => !v)}
                  className="mt-2 text-xs underline text-left"
                  style={isDark ? { color: '#f87171' } : { color: '#b91c1c' }}
                >
                  {showRejectLog ? 'Ocultar resumo de motivos' : 'Ver resumo de motivos'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showRejectLog && rejectionInsights.length > 0 && (
        <div className="card p-4 rounded-xl" style={darkStyles.card}>
          <h3 className="text-sm font-semibold mb-2" style={darkStyles.td}>
            Log de reprovação (G2 — recorte atual)
          </h3>
          <ul className="space-y-2 text-sm" style={darkStyles.muted}>
            {rejectionInsights.map((r) => (
              <li key={r.reason} className="flex justify-between gap-3 border-b border-white/10 pb-2 last:border-0">
                <span className="break-words pr-2">{r.reason}</span>
                <span className="shrink-0 font-medium tabular-nums" style={darkStyles.td}>
                  {r.count}×
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranking.length > 0 && (
        <div className="card p-4 rounded-xl" style={darkStyles.card}>
          <h3 className="text-sm font-semibold mb-3" style={darkStyles.td}>
            Ranking do mês (produção validada — G2 + contas clássicas)
          </h3>
          <ol className="space-y-2 text-sm">
            {ranking.slice(0, 8).map((row) => {
              const isMe = row.producerId === session?.user?.id
              return (
                <li
                  key={row.producerId}
                  className="flex justify-between gap-2 rounded-lg px-2 py-1.5"
                  style={
                    isMe
                      ? { background: 'rgba(96, 165, 250, 0.15)', ...darkStyles.td }
                      : darkStyles.muted
                  }
                >
                  <span>
                    <span className="font-mono tabular-nums mr-2 opacity-70">#{row.rank}</span>
                    {row.name || row.producerId}
                    {row.badges?.length ? (
                      <span className="ml-2 text-[10px] opacity-80">({row.badges.join(', ')})</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-semibold" style={darkStyles.accent}>
                    {row.count}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {(productionByCreator.length > 0 || metaHistory) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {productionByCreator.length > 0 && (
            <div className="card p-4 rounded-xl" style={darkStyles.card}>
              <h3 className="text-sm font-semibold mb-3" style={darkStyles.td}>
                Distribuição de carga (G2 aprovada / enviada ao estoque)
              </h3>
              <p className="text-xs mb-3" style={darkStyles.muted}>
                Volume por produtor no filtro atual — ajuda a equilibrar a operação.
              </p>
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...productionByCreator.map((r) => r.count), 1)
                  return productionByCreator.map((row) => (
                    <div key={row.creatorId}>
                      <div className="flex justify-between text-xs mb-0.5" style={darkStyles.muted}>
                        <span className="truncate pr-2" title={row.creatorName}>
                          {row.creatorName}
                        </span>
                        <span className="shrink-0 font-medium" style={darkStyles.td}>
                          {row.count}
                        </span>
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-white/10"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all duration-500"
                          style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {metaHistory && (
            <div className="card p-4 rounded-xl" style={darkStyles.card}>
              <h3 className="text-sm font-semibold mb-3" style={darkStyles.td}>
                Histórico de meta (validadas — mesmo recorte do motor)
              </h3>
              <p className="text-xs mb-3" style={darkStyles.muted}>
                Produção geral + G2 com conferência registrada: mês atual até hoje vs. mesmo período no mês
                anterior.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                  <p className="text-xs" style={darkStyles.muted}>
                    Este período
                  </p>
                  <p className="text-2xl font-bold" style={darkStyles.accent}>
                    {metaHistory.validatedThisMonthToDate}
                  </p>
                  <p className="text-[10px] mt-1" style={darkStyles.muted}>
                    {metaHistory.periodLabelThisMonth}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 p-3 bg-white/5">
                  <p className="text-xs" style={darkStyles.muted}>
                    Mês passado (mesmo recorte)
                  </p>
                  <p className="text-2xl font-bold" style={darkStyles.td}>
                    {metaHistory.validatedLastMonthSamePeriod}
                  </p>
                  <p className="text-[10px] mt-1" style={darkStyles.muted}>
                    {metaHistory.periodLabelPrevMonth}
                  </p>
                </div>
              </div>
              <p
                className={`mt-3 text-sm font-medium ${
                  metaHistory.deltaVsLastMonth >= 0 ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {metaHistory.deltaVsLastMonth >= 0 ? '▲' : '▼'}{' '}
                {Math.abs(metaHistory.deltaVsLastMonth)} vs. mês anterior neste recorte
              </p>
            </div>
          )}
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
                  <th className="text-left px-4 py-3 text-sm font-medium" style={darkStyles.th}>
                    Motivo reprovação
                  </th>
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
                    <td className="px-4 py-3 text-sm max-w-[220px]" style={darkStyles.td}>
                      {item.status === 'REPROVADA' && item.rejectedReason?.trim() ? (
                        <span className="inline-flex items-start gap-1.5" title={item.rejectedReason}>
                          <AlertCircle
                            className="w-4 h-4 shrink-0 mt-0.5 text-red-400"
                            aria-hidden
                          />
                          <span className="line-clamp-2 break-words">{item.rejectedReason}</span>
                        </span>
                      ) : (
                        <span style={darkStyles.muted}>—</span>
                      )}
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
                            onClick={() =>
                              setRejectModal({ id: item.id, reason: '', reclassify: true, loading: false })
                            }
                            className="hover:underline text-sm mr-2"
                            style={isDark ? { color: '#f87171' } : {}}
                          >
                            G2 Rejeitada
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
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md">
            <h3 className="text-base font-semibold mb-2">Reprovar conta G2</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Ao reprovar, você pode mover automaticamente para estoque de Google Verificação Anunciante.
            </p>
            <label className="block text-sm mb-2">Motivo da reprovação</label>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((s) => (s ? { ...s, reason: e.target.value } : s))}
              className="input-field min-h-[90px]"
              placeholder="Ex.: G2 rejeitada por inconsistência de documento."
            />
            <label className="flex items-center gap-2 text-sm mt-3">
              <input
                type="checkbox"
                checked={rejectModal.reclassify}
                onChange={(e) =>
                  setRejectModal((s) => (s ? { ...s, reclassify: e.target.checked } : s))
                }
              />
              Mover para estoque como Google Verificação Anunciante
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary text-sm" onClick={() => setRejectModal(null)}>
                Cancelar
              </button>
              <button
                className="btn-primary text-sm"
                disabled={rejectModal.loading || !rejectModal.reason.trim()}
                onClick={async () => {
                  setRejectModal((s) => (s ? { ...s, loading: true } : s))
                  await handleReject(rejectModal.id, rejectModal.reason, rejectModal.reclassify)
                }}
              >
                Confirmar G2 Rejeitada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
