'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Segunda-feira da semana civil (data local) para agregar o gráfico por semana. */
function weekStartMondayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(y, m - 1, d)
  const diff = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - diff)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

const REMARKETING_MSG =
  'Olá! Notamos que faz um tempo desde seu último fechamento na Ads Ativos. Podemos ajudar com novas contas ou suporte?'

function buildWaUrl(whatsapp: string | null | undefined): string | null {
  const digits = (whatsapp || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${n}?text=${encodeURIComponent(REMARKETING_MSG)}`
}

function inactive30d(lastPurchaseAt: string | null): boolean {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  return !lastPurchaseAt || new Date(lastPurchaseAt) < cutoff
}

function CrmStatusBadge({ status }: { status: string }) {
  const base = 'inline-flex px-2 py-0.5 rounded text-[11px] font-medium'
  if (status === 'VIP') return <span className={`${base} bg-amber-500/20 text-amber-300 border border-amber-500/40`}>VIP</span>
  if (status === 'INATIVO')
    return <span className={`${base} bg-zinc-800 text-zinc-400 border border-zinc-600`}>Inativo</span>
  return <span className={`${base} bg-emerald-500/15 text-emerald-300 border border-emerald-500/35`}>Ativo</span>
}

type DashboardPayload = {
  periodo: { from: string; to: string }
  fechamentoDiarioTimezone?: string
  notaSerieGrafico?: string
  revenue: number
  spend: number
  roiPercent: number | null
  cpaReal: number | null
  ordersCount: number
  distinctClients: number
  ltvTotal: number
  daily: { data: string; investimento: number; faturamento: number }[]
  campaignAttribution?: { campanha: string; faturamento: number; pedidos: number; pctFaturamento: number }[]
  campaignAttributionTotalRevenue?: number
}

type ClientRow = {
  id: string
  clientCode: string | null
  nome: string
  email: string | null
  whatsapp: string | null
  contato: string
  utmSource: string | null
  utmCampaign: string | null
  origem: string
  status: string
  ltv: number | null
  lastPurchaseAt: string | null
  pedidos: {
    id: string
    valor: number
    status: string
    pagoEm: string | null
    criadoEm: string
    produto: string
  }[]
}

type RemarketingItem = {
  clientId: string
  nome: string
  email: string | null
  whatsapp: string | null
  ultimaCompra: string | null
  waUrl: string | null
  mailtoUrl: string | null
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCrmCsv(rows: ClientRow[]) {
  const headers = [
    'client_code',
    'id',
    'nome',
    'email',
    'contato',
    'whatsapp',
    'utm_source',
    'utm_campaign',
    'origem',
    'status',
    'ltv',
    'ultima_compra',
    'qtd_pedidos',
  ]
  const lines = [
    headers.join(','),
    ...rows.map((c) =>
      [
        csvCell(c.clientCode),
        csvCell(c.id),
        csvCell(c.nome),
        csvCell(c.email),
        csvCell(c.contato),
        csvCell(c.whatsapp),
        csvCell(c.utmSource),
        csvCell(c.utmCampaign),
        csvCell(c.origem),
        csvCell(c.status),
        c.ltv != null ? String(c.ltv) : '',
        csvCell(c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toISOString().slice(0, 10) : ''),
        String(c.pedidos.length),
      ].join(',')
    ),
  ]
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `roi-crm-clientes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RoiCrmDashboardClient({
  userName,
  userRole,
  canManageSpend,
}: {
  userName: string
  userRole: string
  canManageSpend: boolean
}) {
  const canViewSpendLedger = canManageSpend || userRole === 'COMMERCIAL'
  const [days, setDays] = useState(30)
  const [dash, setDash] = useState<DashboardPayload | null>(null)
  const [dashLoading, setDashLoading] = useState(true)
  const [clientQ, setClientQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [crmFilter, setCrmFilter] = useState<'' | 'ATIVO' | 'INATIVO' | 'VIP'>('')
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [remarketingOpen, setRemarketingOpen] = useState(false)
  const [remarketing, setRemarketing] = useState<{ message: string; items: RemarketingItem[] } | null>(null)
  const [spendDate, setSpendDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [spendAmount, setSpendAmount] = useState('')
  const [spendBusy, setSpendBusy] = useState(false)
  const [syncGoogleBusy, setSyncGoogleBusy] = useState(false)
  const [closeDate, setCloseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [closeResult, setCloseResult] = useState<string | null>(null)
  const [spendRows, setSpendRows] = useState<
    { id: string; date: string; amountBrl: number; source: string; note: string | null }[]
  >([])
  const [spendRowsLoading, setSpendRowsLoading] = useState(false)
  const [deletingSpendId, setDeletingSpendId] = useState<string | null>(null)
  const [nowLabel, setNowLabel] = useState('')
  const [chartGranularity, setChartGranularity] = useState<'day' | 'week'>('day')

  const refreshNowLabel = useCallback(() => {
    setNowLabel(
      new Date().toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    )
  }, [])

  useEffect(() => {
    refreshNowLabel()
    const id = setInterval(refreshNowLabel, 30_000)
    return () => clearInterval(id)
  }, [refreshNowLabel])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(clientQ.trim()), 300)
    return () => clearTimeout(t)
  }, [clientQ])

  const loadDash = useCallback(() => {
    setDashLoading(true)
    fetch(`/api/roi-crm/dashboard?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setDash(d)
      })
      .finally(() => {
        setDashLoading(false)
        refreshNowLabel()
      })
  }, [days, refreshNowLabel])

  useEffect(() => {
    loadDash()
  }, [loadDash])

  const loadSpendRows = useCallback(() => {
    if (!canViewSpendLedger) return
    setSpendRowsLoading(true)
    fetch('/api/roi-crm/daily-spend')
      .then((r) => r.json())
      .then((d) => setSpendRows(d.items || []))
      .catch(() => setSpendRows([]))
      .finally(() => setSpendRowsLoading(false))
  }, [canViewSpendLedger])

  useEffect(() => {
    loadSpendRows()
  }, [loadSpendRows])

  const loadClients = useCallback(() => {
    setClientsLoading(true)
    const q = new URLSearchParams()
    q.set('limit', '180')
    if (debouncedQ) q.set('q', debouncedQ)
    if (crmFilter) q.set('crmStatus', crmFilter)
    fetch(`/api/roi-crm/clients?${q}`)
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []))
      .finally(() => setClientsLoading(false))
  }, [debouncedQ, crmFilter])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  async function loadRemarketing() {
    const r = await fetch('/api/roi-crm/remarketing')
    const d = await r.json()
    if (r.ok) {
      setRemarketing({ message: d.message, items: d.items || [] })
      setRemarketingOpen(true)
    } else alert(d.error || 'Erro')
  }

  async function deleteSpendRow(id: string) {
    if (!confirm('Excluir este lançamento de investimento? O gráfico e o ROI serão recalculados.')) return
    setDeletingSpendId(id)
    try {
      const r = await fetch(`/api/roi-crm/daily-spend?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const d = await r.json()
      if (r.ok) {
        loadDash()
        loadSpendRows()
      } else alert(d.error || 'Erro ao excluir')
    } finally {
      setDeletingSpendId(null)
    }
  }

  async function submitSpend(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(spendAmount.replace(',', '.'))
    if (isNaN(amount) || amount < 0) {
      alert('Valor inválido')
      return
    }
    setSpendBusy(true)
    try {
      const r = await fetch('/api/roi-crm/daily-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: spendDate, amountBrl: amount }),
      })
      const d = await r.json()
      if (r.ok) {
        setSpendAmount('')
        loadDash()
        loadSpendRows()
        alert('Investimento registrado.')
      } else alert(d.error || 'Erro')
    } finally {
      setSpendBusy(false)
    }
  }

  async function syncGoogleSpend() {
    setSyncGoogleBusy(true)
    try {
      const r = await fetch('/api/roi-crm/sync-google-spend', { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        alert(
          d.code === 'NO_LOGS'
            ? d.message || 'Sem logs de gasto no período.'
            : `Sincronizado: ${d.upserted} dia(s) em ads_spend_daily (fonte GOOGLE_ACCOUNT_LOGS).`
        )
        loadDash()
        loadSpendRows()
      } else alert(d.error || 'Erro na sincronização')
    } finally {
      setSyncGoogleBusy(false)
    }
  }

  async function runDailyClose() {
    setCloseResult(null)
    const r = await fetch('/api/roi-crm/daily-close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: closeDate }),
    })
    const d = await r.json()
    if (r.ok) {
      setCloseResult(
        `${closeDate}: faturamento ${brl(d.faturamento)} − investimento ${brl(d.investimento)} = líquido ${brl(d.net)} (${d.pedidos} pedidos). ${d.nota || ''}`
      )
    } else setCloseResult(d.error || 'Erro')
  }

  async function patchStatus(clientId: string, roiCrmStatus: string) {
    const r = await fetch('/api/roi-crm/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, roiCrmStatus }),
    })
    if (r.ok) loadClients()
    else {
      const d = await r.json()
      alert(d.error || 'Erro')
    }
  }

  const chartData = useMemo(() => {
    if (!dash?.daily) return []
    if (chartGranularity === 'day') {
      return dash.daily.map((x) => ({
        ...x,
        label: fmtDay(x.data),
      }))
    }
    const map = new Map<string, { investimento: number; faturamento: number }>()
    for (const x of dash.daily) {
      const wk = weekStartMondayYmd(x.data)
      const cur = map.get(wk) ?? { investimento: 0, faturamento: 0 }
      cur.investimento += x.investimento
      cur.faturamento += x.faturamento
      map.set(wk, cur)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, v]) => ({
        data,
        investimento: v.investimento,
        faturamento: v.faturamento,
        label: `Sem. ${fmtDay(data)}`,
      }))
  }, [dash, chartGranularity])

  const cardClass =
    'rounded-xl border border-cyan-500/35 bg-zinc-900/85 backdrop-blur-sm p-4 sm:p-5 shadow-[0_0_24px_rgba(34,211,238,0.06)]'

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#09090b] text-zinc-100 -mx-4 -mt-2 px-4 py-6 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:border-cyan-500/20">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mb-6" aria-label="Navegação do módulo">
        <Link href="/dashboard" className="hover:text-cyan-400 transition-colors">
          ← Dashboard executivo
        </Link>
        <span className="text-zinc-700 hidden sm:inline" aria-hidden>
          ·
        </span>
        <Link href="/dashboard/vendas" className="hover:text-cyan-400 transition-colors">
          Vendas
        </Link>
        {(userRole === 'ADMIN' || userRole === 'FINANCE') && (
          <>
            <span className="text-zinc-700 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/dashboard/financeiro" className="hover:text-cyan-400 transition-colors">
              Financeiro
            </Link>
          </>
        )}
        {(userRole === 'ADMIN' || userRole === 'COMMERCIAL' || userRole === 'FINANCE') && (
          <>
            <span className="text-zinc-700 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/dashboard/relatorios" className="hover:text-cyan-400 transition-colors">
              Relatórios
            </Link>
          </>
        )}
        {userRole === 'ADMIN' && (
          <>
            <span className="text-zinc-700 hidden sm:inline" aria-hidden>
              ·
            </span>
            <Link href="/dashboard/admin/integracoes" className="hover:text-cyan-400 transition-colors">
              Integrações
            </Link>
          </>
        )}
      </nav>
      {/* Cabeçalho contextual (complementa Shell: busca local de clientes) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Dashboard de ROI & CRM</h1>
          <p className="text-cyan-400/90 text-sm mt-1">Integração de dados do TinTim.app e ERP ADS ATIVOS</p>
          <p className="text-zinc-500 text-xs mt-2">
            Atualizado em tempo real — Data: {nowLabel} · {userName} ({userRole})
          </p>
        </div>
        <div className="w-full max-w-md">
          <label className="text-xs text-zinc-500 block mb-1">Buscar cliente</label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/60 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={clientQ}
              onChange={(e) => setClientQ(e.target.value)}
              placeholder="C288…, nome, e-mail ou WhatsApp"
              className="w-full rounded-lg bg-zinc-950 border border-cyan-500/30 pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              aria-label="Buscar cliente na tabela CRM"
            />
          </div>
        </div>
      </div>

      {/* Período + agregação do gráfico (mobile-first: KPIs primeiro) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                days === d
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-cyan-500/30'
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-500">Barras:</span>
          <button
            type="button"
            onClick={() => setChartGranularity('day')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              chartGranularity === 'day'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/45'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-cyan-500/30'
            }`}
          >
            Por dia
          </button>
          <button
            type="button"
            onClick={() => setChartGranularity('week')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              chartGranularity === 'week'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/45'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-cyan-500/30'
            }`}
          >
            Por semana
          </button>
        </div>
      </div>

      {!dashLoading && dash && (dash.ordersCount === 0 || dash.spend <= 0) && (
        <div
          className="mb-6 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2.5 text-xs text-amber-100/95"
          role="status"
        >
          {dash.ordersCount === 0 && (
            <p className="mb-1.5">
              <strong className="text-amber-200">Faturamento:</strong> nenhum pedido pago no recorte.{' '}
              <Link href="/dashboard/vendas" className="text-cyan-400 hover:underline">
                Abrir Vendas
              </Link>{' '}
              ou selecione mais dias (7 / 30 / 90).
            </p>
          )}
          {dash.spend <= 0 && (
            <p>
              <strong className="text-amber-200">Investimento:</strong> zerado no período.
              {canManageSpend
                ? ' Use a secção abaixo para lançar ou «Puxar gasto Google (logs)».'
                : ' Peça ao Admin/Financeiro para lançar em «Registrar» ou sync Google.'}
            </p>
          )}
        </div>
      )}

      {/* Métricas */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-cyan-300 mb-4">1. ROI, faturamento e campanhas</h2>
        {dashLoading || !dash ? (
          <p className="text-zinc-500">Carregando métricas…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <div className={cardClass}>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">ROI real</p>
                <p className="text-2xl sm:text-3xl font-bold text-cyan-400 mt-1">
                  {dash.roiPercent == null
                    ? dash.spend <= 0 && dash.revenue > 0
                      ? '∞'
                      : '—'
                    : `${dash.roiPercent.toFixed(1)}%`}
                </p>
                <p className="text-[11px] text-zinc-500 mt-2">
                  (Faturamento − Investimento) / Investimento × 100
                </p>
              </div>
              <div className={cardClass}>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">LTV (soma perfis)</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-400 mt-1">{brl(dash.ltvTotal)}</p>
                <p className="text-[11px] text-zinc-500 mt-2">Soma de totalSpent dos clientes no ERP</p>
              </div>
              <div className={cardClass}>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">CPA real</p>
                <p className="text-2xl sm:text-3xl font-bold text-violet-400 mt-1">
                  {dash.cpaReal != null ? brl(dash.cpaReal) : '—'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-2">
                  Investimento ÷ pedidos com pagamento confirmado ou em separação/entrega ({dash.ordersCount} no
                  período)
                </p>
              </div>
              <div className={cardClass}>
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Resumo período</p>
                <p className="text-sm text-zinc-300 mt-2">Faturamento: {brl(dash.revenue)}</p>
                <p className="text-sm text-zinc-300">Investimento: {brl(dash.spend)}</p>
                <p className="text-sm text-zinc-400">Clientes (pedidos): {dash.distinctClients}</p>
              </div>
            </div>

            <div className={cardClass} style={{ minHeight: 320 }}>
              <p className="text-sm font-medium text-cyan-200 mb-4">
                {chartGranularity === 'week'
                  ? 'Comparativo semanal — investimento vs faturamento'
                  : 'Comparativo diário — investimento vs faturamento'}
              </p>
              <div className="w-full h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.35} />
                      </linearGradient>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid rgba(34,211,238,0.3)' }}
                      labelStyle={{ color: '#e4e4e7' }}
                      formatter={(value: number) => brl(value)}
                    />
                    <Legend />
                    <Bar dataKey="investimento" name="Investimento (ads)" fill="url(#gradInv)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="url(#gradFat)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-zinc-500 mt-3">
                {dash.notaSerieGrafico ||
                  'Barras por dia conforme data do pagamento/criação do pedido e do investimento. Fechamento em dia civil BRT: use «Fechamento de caixa (um dia)» abaixo.'}
                {dash.fechamentoDiarioTimezone && (
                  <span className="block mt-1 text-zinc-600">
                    Fechamento diário: <span className="text-zinc-400">{dash.fechamentoDiarioTimezone}</span>
                  </span>
                )}
              </p>
            </div>

            {dash.campaignAttribution && dash.campaignAttribution.length > 0 && (
              <div className={`${cardClass} mt-6`}>
                <p className="text-sm font-medium text-cyan-200 mb-1">Faturamento por campanha (atribuição TinTim + ERP)</p>
                <p className="text-[11px] text-zinc-500 mb-4">
                  Pedidos no período agrupados pela campanha salva no perfil ou pelo último evento de lead casado
                  (telefone/e-mail). Total atribuído: {brl(dash.campaignAttributionTotalRevenue ?? dash.revenue)}.
                </p>
                <div className="overflow-x-auto rounded-lg border border-zinc-800 -mx-1">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead>
                      <tr className="text-left text-zinc-500 border-b border-zinc-800">
                        <th className="py-2 px-2">Campanha / UTM</th>
                        <th className="py-2 px-2">Faturamento</th>
                        <th className="py-2 px-2">Pedidos</th>
                        <th className="py-2 px-2">% fat.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.campaignAttribution.map((row) => (
                        <tr key={row.campanha} className="border-b border-zinc-800/70 text-zinc-300">
                          <td className="py-2 px-2 max-w-[240px] truncate" title={row.campanha}>
                            {row.campanha}
                          </td>
                          <td className="py-2 px-2 text-cyan-300/95 whitespace-nowrap">{brl(row.faturamento)}</td>
                          <td className="py-2 px-2">{row.pedidos}</td>
                          <td className="py-2 px-2">{row.pctFaturamento.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {canViewSpendLedger && (
        <section className={`${cardClass} mb-8`}>
          <h3 className="text-sm font-semibold text-cyan-200 mb-3">
            {canManageSpend ? 'Lançar investimento em mídia (diário)' : 'Investimento em mídia (consulta)'}
          </h3>
          {!canManageSpend && (
            <p className="text-[11px] text-zinc-500 mb-4">
              Apenas <strong className="text-zinc-400">Admin</strong> ou <strong className="text-zinc-400">Financeiro</strong>{' '}
              registram valores. Aqui você acompanha os lançamentos e pode usar o fechamento do dia.
            </p>
          )}
          {canManageSpend && (
          <form onSubmit={submitSpend} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-zinc-500 block">Data</label>
              <input
                type="date"
                value={spendDate}
                onChange={(e) => setSpendDate(e.target.value)}
                className="rounded-lg bg-zinc-950 border border-cyan-500/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block">Valor (R$)</label>
              <input
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                placeholder="0,00"
                className="rounded-lg bg-zinc-950 border border-cyan-500/30 px-2 py-1.5 text-sm w-32"
              />
            </div>
            <button
              type="submit"
              disabled={spendBusy}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {spendBusy ? 'Salvando…' : 'Registrar'}
            </button>
            <button
              type="button"
              disabled={syncGoogleBusy}
              onClick={syncGoogleSpend}
              className="rounded-lg border border-cyan-500/50 text-cyan-200 hover:bg-cyan-950/50 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {syncGoogleBusy ? 'Sincronizando…' : 'Puxar gasto Google (logs)'}
            </button>
          </form>
          )}
          {canManageSpend && (
          <p className="text-[11px] text-zinc-500 mt-2">
            O botão acima agrega <code className="text-zinc-400">AccountSpendLog</code> em{' '}
            <code className="text-zinc-400">ads_spend_daily</code> (fonte GOOGLE_ACCOUNT_LOGS). Não duplique o mesmo
            custo com lançamento manual no mesmo dia.
          </p>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-xs font-medium text-zinc-400">Últimos lançamentos de investimento</h4>
              <button
                type="button"
                onClick={loadSpendRows}
                className="text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                Atualizar
              </button>
            </div>
            {spendRowsLoading ? (
              <p className="text-xs text-zinc-600">Carregando…</p>
            ) : spendRows.length === 0 ? (
              <p className="text-xs text-zinc-600">
                {canManageSpend
                  ? 'Nenhum registro ainda. Use "Registrar" ou sync Google.'
                  : 'Nenhum registro ainda. O financeiro pode lançar em "Registrar" ou sync Google.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-800">
                      <th className="py-2 px-2">Data</th>
                      <th className="py-2 px-2">Valor</th>
                      <th className="py-2 px-2">Fonte</th>
                      <th className="py-2 px-2">Obs.</th>
                      {canManageSpend && <th className="py-2 px-2 w-20"> </th>}
                    </tr>
                  </thead>
                  <tbody>
                    {spendRows.slice(0, 15).map((row) => (
                      <tr key={row.id} className="border-b border-zinc-800/60 text-zinc-300">
                        <td className="py-1.5 px-2 whitespace-nowrap">{row.date}</td>
                        <td className="py-1.5 px-2">{brl(row.amountBrl)}</td>
                        <td className="py-1.5 px-2 font-mono text-[10px]">{row.source}</td>
                        <td className="py-1.5 px-2 max-w-[200px] truncate" title={row.note || ''}>
                          {row.note || '—'}
                        </td>
                        {canManageSpend && (
                          <td className="py-1.5 px-2">
                            <button
                              type="button"
                              disabled={deletingSpendId === row.id}
                              onClick={() => deleteSpendRow(row.id)}
                              className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {deletingSpendId === row.id ? '…' : 'Excluir'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-zinc-500 block">Fechamento de caixa (um dia)</label>
              <input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={runDailyClose}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Calcular dia
            </button>
            {closeResult && <p className="text-xs text-zinc-400 w-full sm:w-auto">{closeResult}</p>}
          </div>
        </section>
      )}

      {/* CRM */}
      <section className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-cyan-300">2. CRM & marketing</h2>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={clientsLoading || clients.length === 0}
              onClick={() => downloadCrmCsv(clients)}
              className="rounded-lg border border-cyan-500/40 text-cyan-200 hover:bg-cyan-950/40 px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none w-full sm:w-auto"
            >
              Exportar CSV (lista atual)
            </button>
            <button
              type="button"
              onClick={loadRemarketing}
              className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 text-sm font-medium w-full sm:w-auto"
            >
              Disparar re-marketing (inativos 30d+)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Filtrar por status CRM</label>
            <select
              value={crmFilter}
              onChange={(e) => setCrmFilter(e.target.value as '' | 'ATIVO' | 'INATIVO' | 'VIP')}
              className="rounded-lg bg-zinc-950 border border-cyan-500/30 px-2 py-1.5 text-sm text-zinc-200 min-w-[10rem]"
              aria-label="Filtrar clientes por status CRM"
            >
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="VIP">VIP</option>
            </select>
          </div>
          <p className="text-[11px] text-zinc-500 pb-1 max-w-md">
            A busca no topo da página continua valendo junto com este filtro. Limite de até 180 clientes por
            requisição.
          </p>
        </div>

        {clientsLoading ? (
          <p className="text-zinc-500 text-sm">Carregando clientes…</p>
        ) : clients.length === 0 ? (
          <p className="text-zinc-500 text-sm">Nenhum cliente encontrado.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-3">Nome</th>
                  <th className="pb-2 pr-3">Contato</th>
                  <th className="pb-2 pr-3">Origem (UTM)</th>
                  <th className="pb-2 pr-3">Última compra</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">LTV</th>
                  <th className="pb-2 pr-2">Re-marketing</th>
                  <th className="pb-2">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-zinc-800/80">
                      <td className="py-2 pr-2 font-mono text-[11px] text-cyan-500/90 whitespace-nowrap">
                        {c.clientCode || '—'}
                      </td>
                      <td className="py-2 pr-3 text-zinc-200">{c.nome}</td>
                      <td className="py-2 pr-3 text-zinc-400 text-xs">{c.contato}</td>
                      <td className="py-2 pr-3 text-zinc-400 text-xs max-w-[160px] truncate" title={c.origem}>
                        {c.origem}
                      </td>
                      <td className="py-2 pr-3 text-zinc-400 text-xs whitespace-nowrap">
                        {c.lastPurchaseAt
                          ? new Date(c.lastPurchaseAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-1.5 items-start">
                          <CrmStatusBadge status={c.status} />
                          <select
                            value={c.status}
                            onChange={(e) => patchStatus(c.id, e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs max-w-[9rem]"
                            aria-label={`Status CRM de ${c.nome}`}
                          >
                            <option value="ATIVO">Ativo</option>
                            <option value="INATIVO">Inativo</option>
                            <option value="VIP">VIP</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-cyan-400/90">{c.ltv != null ? brl(c.ltv) : '—'}</td>
                      <td className="py-2 pr-2">
                        {inactive30d(c.lastPurchaseAt) && buildWaUrl(c.whatsapp) ? (
                          <a
                            href={buildWaUrl(c.whatsapp) || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-[11px] px-2 py-1 rounded border border-violet-500/50 text-violet-300 hover:bg-violet-950/50 whitespace-nowrap"
                          >
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="text-cyan-400 text-xs hover:underline"
                          onClick={() => setExpanded((x) => (x === c.id ? null : c.id))}
                        >
                          {c.pedidos.length} fechamento(s) {expanded === c.id ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr className="bg-zinc-950/80">
                        <td colSpan={9} className="py-3 px-2 text-xs text-zinc-400">
                          <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">Timeline de compras</p>
                          <ul className="space-y-2 border-l border-cyan-500/25 pl-3 ml-1">
                            {c.pedidos.map((p) => (
                              <li key={p.id} className="relative flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
                                <span className="absolute -left-[7px] top-1.5 h-2 w-2 rounded-full bg-cyan-500/60" aria-hidden />
                                <span>
                                  {new Date(p.criadoEm).toLocaleDateString('pt-BR')} — {brl(p.valor)} — {p.status}
                                  {p.produto ? ` — ${p.produto}` : ''}
                                </span>
                                <Link
                                  href={`/dashboard/vendas?orderId=${encodeURIComponent(p.id)}`}
                                  className="text-cyan-400 hover:text-cyan-300 underline text-[11px] shrink-0"
                                >
                                  Abrir no módulo Vendas
                                </Link>
                              </li>
                            ))}
                            {c.pedidos.length === 0 && <li>Sem pedidos concluídos no recorte.</li>}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${cardClass} mb-8`}>
        <h2 className="text-lg font-semibold text-cyan-300 mb-3">3. Integração de dados</h2>
        <ul className="space-y-2 text-sm text-zinc-300">
          <li>
            <span className="text-cyan-400 font-medium">Fonte A (TinTim.app):</span> captura via{' '}
            <code className="text-xs bg-zinc-950 px-1 rounded">POST /api/webhooks/tintim</code> — UTM, campanha,
            lead. Opcional: env <code className="text-xs">TINTIM_WEBHOOK_SECRET</code> (Bearer).{' '}
            <code className="text-xs bg-zinc-950 px-1 rounded">GET</code> no mesmo path retorna status (útil para
            monitoramento; não envia dados sensíveis).
          </li>
          <li>
            <span className="text-cyan-400 font-medium">Fonte B (ERP ADS ATIVOS):</span> tabela de vendas /
            fechamentos (<code className="text-xs">Order</code>): pedidos{' '}
            <code className="text-xs">PAID</code> até <code className="text-xs">DELIVERED</code>, usando{' '}
            <code className="text-xs">paidAt</code> ou <code className="text-xs">createdAt</code> para o dia.
          </li>
          <li>
            <span className="text-cyan-400 font-medium">Investimento em ads:</span> manual via{' '}
            <code className="text-xs">POST /api/roi-crm/daily-spend</code> (exclusão:{' '}
            <code className="text-xs">DELETE ?id=</code>) ou agregação de{' '}
            <code className="text-xs">account_spend_logs</code> com{' '}
            <code className="text-xs">POST /api/roi-crm/sync-google-spend</code> (fonte{' '}
            <code className="text-xs">GOOGLE_ACCOUNT_LOGS</code>). Botão «Puxar gasto Google» na área ADMIN/FINANCE.
          </li>
          <li>
            <span className="text-cyan-400 font-medium">Chave de cruzamento:</span> telefone (WhatsApp) ou e-mail
            do cliente cadastrado no ERP — índices em <code className="text-xs">users.phone</code> e{' '}
            <code className="text-xs">client_profiles.whatsapp</code> para consultas rápidas.
          </li>
        </ul>
      </section>

      {remarketingOpen && remarketing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="bg-zinc-900 border border-cyan-500/40 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 shadow-xl">
            <h3 className="font-semibold text-cyan-300 mb-2">Re-marketing</h3>
            <p className="text-xs text-zinc-400 mb-4">{remarketing.message}</p>
            <ul className="space-y-3">
              {remarketing.items.map((it) => (
                <li key={it.clientId} className="border border-zinc-800 rounded-lg p-3 text-sm">
                  <p className="font-medium text-white">{it.nome}</p>
                  <p className="text-xs text-zinc-500">
                    Última compra:{' '}
                    {it.ultimaCompra
                      ? new Date(it.ultimaCompra).toLocaleDateString('pt-BR')
                      : '—'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {it.waUrl && (
                      <a
                        href={it.waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded bg-green-700 text-white hover:bg-green-600"
                      >
                        WhatsApp
                      </a>
                    )}
                    {it.mailtoUrl && (
                      <a href={it.mailtoUrl} className="text-xs px-2 py-1 rounded bg-zinc-700 text-white hover:bg-zinc-600">
                        E-mail
                      </a>
                    )}
                    {!it.waUrl && !it.mailtoUrl && (
                      <span className="text-xs text-zinc-500">Sem canal configurado</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {remarketing.items.length === 0 && (
              <p className="text-zinc-500 text-sm">Nenhum cliente inativo (30d+) elegível.</p>
            )}
            <button
              type="button"
              className="mt-4 w-full py-2 rounded-lg border border-zinc-600 text-sm"
              onClick={() => setRemarketingOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
