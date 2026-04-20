'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Download,
  Loader2,
  MessageCircle,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

type Tab = 'geral' | 'inativos' | 'recuperacao' | 'ativos' | 'resgate_imediato'

type LeadRow = {
  id: string
  name: string
  email: string
  whatsapp: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmFirstSource?: string | null
  utmFirstMedium?: string | null
  utmFirstCampaign?: string | null
  status: string
  lastPurchaseAt: string | null
  lastInteractionAt?: string | null
  totalSales: number
  purchaseCount?: number
  lastProductName: string | null
  engagementScore: number
  confidenceScore?: number
  customerHealth?: string
  digitalFingerprintAlert?: boolean
  upsellSuggestions?: string[]
  createdAt: string
  updatedAt: string
  churnRisk?: boolean
  daysSincePurchase?: number | null
  cpaBrl?: number | null
  profitAfterCpaBrl?: number | null
  hotStalledAlert?: boolean
  commercialAiBrief?: string | null
  cartRescueImmediate?: boolean
  conversionPathSummary?: string | null
  trustScore?: number | null
  averageTicketBrl?: number | null
}

type AnalyticsPayload = {
  bySource: Array<{
    utm_source: string
    leads: number
    cliente_ativo: number
    taxa_conversao_cliente_pct: number
    total_vendas: number
    ltv_medio_por_lead: number
  }>
  byCampaign: Array<{
    utm_source: string
    utm_campaign: string
    leads: number
    cliente_ativo: number
    taxa_conversao_cliente_pct: number
    total_vendas: number
    ltv_medio_por_lead: number
    sum_cpa_leads_brl?: number
    lucro_com_cpa_leads_brl?: number
    spend_ads_mes_brl?: number
    lucro_apos_spend_ads_brl?: number
    roas?: number | null
  }>
  rfmTopPct: Array<{
    leadId: string
    name: string
    email: string
    recencia_dias: number
    frequencia: number
    valor_ltv: number
  }>
}

type CohortRow = {
  cohort_month: string
  buyers_first_month: number
  retention_next_months_pct: Record<string, number>
}

type GatewayRow = {
  code: string
  label: string | null
  enabled: boolean
  lastWebhookAt: string | null
  lastApprovedAt: string | null
  alertStaleApproved: boolean
  alertStaleWebhook: boolean
}

type TimelineItem = {
  occurredAt: string
  eventType: string
  title: string
  detail: string | null
  source: 'event' | 'order'
}

const STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo',
  QUENTE: 'Quente',
  CLIENTE_ATIVO: 'Cliente Ativo',
  CHURN: 'Churn',
}

/** Mensagem padrão (zona de recuperação / sem último produto) — copy aprovada Ecossistema 9D */
const WA_FALLBACK = (nome: string) =>
  `Olá ${nome}, aqui é da Ads Ativos. Percebi que faz tempo que não nos falamos e preparei algo especial para você. Podemos conversar?`

const WA_REPOSICAO = (nome: string, produto: string) =>
  `Olá ${nome}, vi que você gostou do ${produto}, temos uma condição especial para sua reposição hoje!`

function buildWaUrl(
  whatsapp: string | null | undefined,
  nome: string,
  lastProductName: string | null | undefined,
): string | null {
  const digits = (whatsapp || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const n = digits.startsWith('55') ? digits : `55${digits}`
  const safeName = nome.trim().slice(0, 80) || 'Cliente'
  const prod = (lastProductName || '').trim().slice(0, 120)
  const text = prod ? WA_REPOSICAO(safeName, prod) : WA_FALLBACK(safeName)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDt(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function daysSinceLabel(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const day = Math.floor((Date.now() - t) / 86400000)
  return `${day} d`
}

function playTrafficAlertBeep() {
  try {
    const Ctx = typeof window !== 'undefined' && window.AudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    o.type = 'sine'
    g.gain.setValueAtTime(0.12, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
    o.start(ctx.currentTime)
    o.stop(ctx.currentTime + 0.35)
    setTimeout(() => void ctx.close(), 500)
  } catch {
    /* browser sem áudio */
  }
}

const HEALTH_STYLE: Record<string, { label: string; className: string }> = {
  verde: { label: 'Verde', className: 'bg-emerald-600/30 text-emerald-200 border-emerald-500/50' },
  amarelo: { label: 'Amarelo', className: 'bg-amber-600/25 text-amber-200 border-amber-500/50' },
  vermelho: { label: 'Vermelho', className: 'bg-red-600/30 text-red-200 border-red-500/50' },
  neutro: { label: 'Neutro', className: 'bg-zinc-700/50 text-zinc-400 border-zinc-600' },
}

export function IntelligenceLeadsClient({ userRole }: { userRole: string }) {
  const [tab, setTab] = useState<Tab>('geral')
  const [absenceDays, setAbsenceDays] = useState<30 | 60 | 90>(30)
  const [utmFilter, setUtmFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState<LeadRow[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [spendMonth, setSpendMonth] = useState('')
  const [cohortRows, setCohortRows] = useState<CohortRow[]>([])
  const [gateways, setGateways] = useState<GatewayRow[]>([])
  const [scriptText, setScriptText] = useState<string | null>(null)
  const [scriptBusy, setScriptBusy] = useState(false)
  const [briefBusy, setBriefBusy] = useState(false)
  const [trafficHealth, setTrafficHealth] = useState<{
    alerts?: { webhookSilence?: boolean; volumeDrop?: boolean; messages?: string[] }
    checkoutRescueFlagged?: number
    lastIngestAt?: string | null
  } | null>(null)
  const [lookalikeMinLtv, setLookalikeMinLtv] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditRows, setAuditRows] = useState<
    Array<{ id: string; userEmail: string; action: string; entityId: string | null; createdAt: string }>
  >([])
  const [auditLoading, setAuditLoading] = useState(false)
  const prevTrafficAlertRef = useRef(false)

  const canExport = userRole === 'ADMIN' || userRole === 'FINANCE'
  const canSyncOrders = userRole === 'ADMIN' || userRole === 'FINANCE'
  const isAdmin = userRole === 'ADMIN'

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const q = new URLSearchParams()
      q.set('view', tab)
      if (tab === 'inativos') q.set('absence_days', String(absenceDays))
      if (utmFilter.trim()) q.set('utm_source', utmFilter.trim())
      if (statusFilter.trim()) q.set('status', statusFilter.trim().toUpperCase())

      const anQ = new URLSearchParams()
      if (spendMonth.trim()) anQ.set('spend_month', spendMonth.trim())

      const [rList, rAn, rCo, rGw] = await Promise.all([
        fetch(`/api/admin/intelligence-leads?${q.toString()}`),
        fetch(`/api/admin/intelligence-leads/analytics?${anQ.toString()}`),
        fetch('/api/admin/intelligence-leads/cohort?months=9'),
        fetch('/api/admin/checkout-pulse'),
      ])
      if (!rList.ok) throw new Error((await rList.json().catch(() => ({}))).error || 'Erro ao listar')
      if (!rAn.ok) throw new Error((await rAn.json().catch(() => ({}))).error || 'Erro analytics')
      const j = await rList.json()
      const a = await rAn.json()
      const co = rCo.ok ? await rCo.json() : null
      const gw = rGw.ok ? await rGw.json() : null
      setRows(Array.isArray(j.rows) ? j.rows : [])
      setAnalytics({
        bySource: Array.isArray(a.bySource) ? a.bySource : [],
        byCampaign: Array.isArray(a.byCampaign) ? a.byCampaign : [],
        rfmTopPct: Array.isArray(a.rfmTopPct) ? a.rfmTopPct : [],
      })
      setCohortRows(Array.isArray(co?.cohorts) ? co.cohorts : [])
      setGateways(Array.isArray(gw?.gateways) ? gw.gateways : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, utmFilter, statusFilter, absenceDays, spendMonth])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/intelligence-leads/traffic-health')
        if (!r.ok || cancelled) return
        const j = await r.json()
        const active = !!(j?.alerts?.webhookSilence || j?.alerts?.volumeDrop)
        if (active && !prevTrafficAlertRef.current) playTrafficAlertBeep()
        prevTrafficAlertRef.current = active
        if (!cancelled) setTrafficHealth(j)
      } catch {
        /* rede */
      }
    }
    void tick()
    const id = setInterval(tick, 45000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetailLoading(true)
    setTimeline([])
    setDetailLead(null)
    setScriptText(null)
    try {
      const r = await fetch(`/api/admin/intelligence-leads/${id}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro')
      setDetailLead(j.lead)
      setTimeline(Array.isArray(j.timeline) ? j.timeline : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Detalhe indisponível')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const exportCsv = async () => {
    const q = new URLSearchParams()
    q.set('format', 'csv')
    q.set('view', tab)
    if (tab === 'inativos') q.set('absence_days', String(absenceDays))
    if (utmFilter.trim()) q.set('utm_source', utmFilter.trim())
    if (statusFilter.trim()) q.set('status', statusFilter.trim().toUpperCase())
    const r = await fetch(`/api/admin/intelligence-leads?${q.toString()}`)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setErr(j.error || 'Export falhou')
      return
    }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${tab}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportLookalikeCsv = async () => {
    const q = new URLSearchParams()
    q.set('format', 'csv')
    q.set('view', 'lookalike')
    const min = parseFloat(lookalikeMinLtv.replace(',', '.'))
    if (Number.isFinite(min) && min > 0) q.set('min_ltv', String(min))
    const r = await fetch(`/api/admin/intelligence-leads?${q.toString()}`)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setErr(j.error || 'Export lookalike falhou')
      return
    }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lookalike-top-ltv-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generateSalesScript = async () => {
    if (!detailId) return
    setScriptBusy(true)
    setScriptText(null)
    try {
      const r = await fetch(`/api/admin/intelligence-leads/${detailId}/sales-script`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao gerar')
      setScriptText(typeof j.message === 'string' ? j.message : '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Roteiro indisponível')
    } finally {
      setScriptBusy(false)
    }
  }

  const regenerateAiBrief = async () => {
    if (!detailId) return
    setBriefBusy(true)
    try {
      const r = await fetch(`/api/admin/intelligence-leads/${detailId}/ai-brief`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao regerar')
      setDetailLead((prev) =>
        prev ? { ...prev, commercialAiBrief: typeof j.commercialAiBrief === 'string' ? j.commercialAiBrief : null } : prev,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Brief indisponível')
    } finally {
      setBriefBusy(false)
    }
  }

  const loadAudit = async () => {
    setAuditLoading(true)
    try {
      const r = await fetch('/api/admin/commercial-audit-logs?take=40')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Auditoria indisponível')
      setAuditRows(Array.isArray(j.rows) ? j.rows : [])
      setAuditOpen(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Auditoria')
    } finally {
      setAuditLoading(false)
    }
  }

  const runSyncOrders = async () => {
    setSyncBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/intelligence-leads/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 120 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Sync falhou')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSyncBusy(false)
    }
  }

  const alertRowStyle = tab === 'recuperacao' || tab === 'inativos' || tab === 'resgate_imediato'

  const statusOptions = useMemo(() => ['', 'NOVO', 'QUENTE', 'CLIENTE_ATIVO', 'CHURN'], [])

  const COLS = 19

  return (
    <div className="max-w-[1680px] mx-auto space-y-8 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-[#00FF00]" />
            Inteligência de Leads — cérebro comercial
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
            CPA por lead + gasto de ads por mês (lucro real), heatmap de eventos, pulses multi-checkout, cohort de
            retenção, bloqueio pós-chargeback e roteiro WhatsApp (Claude opcional).
            {userRole === 'COMMERCIAL'
              ? ' A sua vista mostra apenas leads atribuídos a si (peça ao admin atribuição via API PATCH).'
              : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSyncOrders ? (
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void runSyncOrders()}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-200 hover:bg-amber-950/60 disabled:opacity-50"
            >
              {syncBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar LTV (ERP)
            </button>
          ) : null}
          {canExport ? (
            <>
              <button
                type="button"
                onClick={() => void exportCsv()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-[#00FF00]/50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[10px] text-zinc-500 flex items-center gap-1">
                  LTV min (R$)
                  <input
                    value={lookalikeMinLtv}
                    onChange={(e) => setLookalikeMinLtv(e.target.value)}
                    className="w-20 rounded bg-black/50 border border-zinc-700 px-2 py-1 text-xs text-white font-mono"
                    placeholder="ex. 1000"
                    inputMode="decimal"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void exportLookalikeCsv()}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-600/50 bg-blue-950/40 px-3 py-2 text-sm text-blue-200 hover:border-blue-400/60"
                  title="Top 500 por LTV — opcional: só LTV ≥ mínimo (lookalike VIP)"
                >
                  <Download className="w-4 h-4" />
                  Lookalike (Meta)
                </button>
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:border-[#00FF00]/50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {(
          [
            ['geral', 'Visão geral'],
            ['inativos', 'Inativos (régua)'],
            ['recuperacao', 'Recuperação 45d'],
            ['ativos', 'Ativos 30d'],
            ['resgate_imediato', 'Resgate imediato'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === k
                ? 'bg-[#00FF00] text-black'
                : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-zinc-500'
            }`}
          >
            {label}
          </button>
        ))}
        {tab === 'inativos' ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500 ml-2">
            <span>Ausência:</span>
            {([30, 60, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setAbsenceDays(d)}
                className={`px-2 py-1 rounded ${
                  absenceDays === d ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'geral' ? (
        <div className="flex flex-wrap gap-3 items-end rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
          <label className="text-xs text-zinc-500 block">
            utm_source (contém)
            <input
              value={utmFilter}
              onChange={(e) => setUtmFilter(e.target.value)}
              className="mt-1 block w-48 rounded-lg bg-black/50 border border-zinc-700 px-3 py-2 text-sm text-white"
              placeholder="meta, google..."
            />
          </label>
          <label className="text-xs text-zinc-500 block">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-48 rounded-lg bg-black/50 border border-zinc-700 px-3 py-2 text-sm text-white"
            >
              {statusOptions.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? STATUS_LABEL[s] || s : 'Todos'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500 block">
            Mês spend ads (YYYY-MM)
            <input
              value={spendMonth}
              onChange={(e) => setSpendMonth(e.target.value)}
              className="mt-1 block w-36 rounded-lg bg-black/50 border border-zinc-700 px-3 py-2 text-sm text-white font-mono"
              placeholder="2026-04"
              maxLength={7}
            />
          </label>
        </div>
      ) : null}

      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 text-red-200 px-4 py-3 text-sm">{err}</div>
      ) : null}

      {trafficHealth?.alerts?.messages && trafficHealth.alerts.messages.length > 0 ? (
        <div
          className="rounded-lg border border-amber-500/50 bg-amber-950/40 text-amber-100 px-4 py-3 text-sm flex flex-wrap items-start gap-3"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-200">Saúde do tráfego — atenção</p>
            <ul className="mt-1 list-disc list-inside text-xs text-amber-100/90">
              {trafficHealth.alerts.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            {trafficHealth.lastIngestAt ? (
              <p className="text-[10px] text-zinc-500 mt-2 font-mono">
                Último webhook de lead: {fmtDt(trafficHealth.lastIngestAt)}
              </p>
            ) : null}
            {typeof trafficHealth.checkoutRescueFlagged === 'number' && trafficHealth.checkoutRescueFlagged > 0 ? (
              <p className="text-[10px] text-sky-300/90 mt-1">
                Carrinhos marcados para resgate neste poll: {trafficHealth.checkoutRescueFlagged}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
        <p className="sm:hidden text-[11px] text-zinc-500 px-3 py-2 border-b border-zinc-800/80 bg-black/20">
          Deslize horizontalmente para ver todas as colunas (tabela larga).
        </p>
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-sm text-left min-w-[1880px]">
            <thead className="text-xs uppercase text-zinc-500 bg-black/40 border-b border-zinc-800">
              <tr>
                <th className="p-3">Score</th>
                <th className="p-3">Conf.</th>
                <th className="p-3">Saúde</th>
                <th className="p-3">Nome</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">1º toque</th>
                <th className="p-3">Último toque</th>
                <th className="p-3">Fraude</th>
                <th className="p-3">Status</th>
                <th className="p-3">Risco</th>
                <th className="p-3">Δ compra</th>
                <th className="p-3">Δ inter.</th>
                <th className="p-3">Última compra</th>
                <th className="p-3 text-right">LTV</th>
                <th className="p-3 text-right">LTV−CPA</th>
                <th className="p-3">Quente</th>
                <th className="p-3 max-w-[100px]">Upsell</th>
                <th className="p-3 max-w-[200px]">Triagem / jornada</th>
                <th className="p-3 w-32">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {loading ? (
                <tr>
                  <td colSpan={COLS} className="p-12 text-center text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    A carregar…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="p-8 text-center text-zinc-500">
                    {userRole === 'COMMERCIAL'
                      ? 'Sem leads atribuídos a si. Peça atribuição ao administrador.'
                      : 'Nenhum registo para este filtro.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const wa = buildWaUrl(row.whatsapp, row.name, row.lastProductName)
                  const rowClass = alertRowStyle
                    ? 'bg-red-950/35 hover:bg-red-950/45 border-l-2 border-red-500/70'
                    : 'hover:bg-zinc-900/80'
                  const hot = row.engagementScore >= 70
                  const health = row.customerHealth || 'neutro'
                  const hStyle = HEALTH_STYLE[health] ?? HEALTH_STYLE.neutro
                  const upsellTxt = (row.upsellSuggestions || []).slice(0, 2).join(', ') || '—'
                  const pathTxt = row.conversionPathSummary || '—'
                  const briefTxt = (row.commercialAiBrief || '').trim()
                  return (
                    <tr key={row.id} className={rowClass}>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[#00FF00] font-bold">{row.engagementScore}</span>
                          {hot ? (
                            <span title="Hot lead — score alto">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-cyan-300/90">
                        {row.confidenceScore != null ? Math.round(row.confidenceScore) : '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 border ${hStyle.className}`}
                          title="Verde ≤15d compra · Amarelo arrefecido · Vermelho ≥60d sem compra"
                        >
                          {hStyle.label}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-white max-w-[130px] truncate">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="text-left hover:underline text-primary-400"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="p-3 text-zinc-300 font-mono text-[10px] max-w-[160px] truncate">{row.email}</td>
                      <td className="p-3 text-xs max-w-[120px]">
                        <div className="font-mono text-violet-300/90 truncate">{row.utmFirstSource || '—'}</div>
                        <div className="text-zinc-500 text-[10px] truncate">{row.utmFirstCampaign || '—'}</div>
                      </td>
                      <td className="p-3 text-xs max-w-[120px]">
                        <div className="font-mono text-[#00FF00]/80 truncate">{row.utmSource || '—'}</div>
                        <div className="text-zinc-500 text-[10px] truncate">{row.utmCampaign || '—'}</div>
                      </td>
                      <td className="p-3">
                        {row.digitalFingerprintAlert ? (
                          <span
                            className="text-[10px] font-bold uppercase text-orange-300 border border-orange-500/50 rounded px-1.5 py-0.5"
                            title="Mesmo rasto digital noutro e-mail"
                          >
                            Alerta
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300">
                          {STATUS_LABEL[row.status] || row.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {row.churnRisk ? (
                          <span className="text-[10px] font-bold uppercase text-red-400 border border-red-500/50 rounded px-1.5 py-0.5">
                            Churn
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-400 font-mono text-xs">{daysSinceLabel(row.lastPurchaseAt)}</td>
                      <td className="p-3 text-amber-200/80 font-mono text-xs">
                        {daysSinceLabel(row.lastInteractionAt ?? row.updatedAt)}
                      </td>
                      <td className="p-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDt(row.lastPurchaseAt)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">{brl(row.totalSales)}</td>
                      <td
                        className={`p-3 text-right font-mono text-xs ${
                          row.profitAfterCpaBrl != null && row.profitAfterCpaBrl < 0
                            ? 'text-red-400'
                            : 'text-sky-300/90'
                        }`}
                      >
                        {row.profitAfterCpaBrl != null ? brl(row.profitAfterCpaBrl) : '—'}
                      </td>
                      <td className="p-3">
                        {row.hotStalledAlert ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-amber-300 border border-amber-500/50 rounded px-1 py-0.5"
                            title="Muita intenção em 24h sem compra — ligar já"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Parado
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td
                        className="p-3 text-zinc-400 text-[10px] max-w-[100px] truncate"
                        title={(row.upsellSuggestions || []).join(', ')}
                      >
                        {upsellTxt}
                      </td>
                      <td className="p-3 text-[10px] text-zinc-400 max-w-[200px]">
                        <div className="space-y-1">
                          {row.cartRescueImmediate ? (
                            <span className="inline-block font-bold uppercase text-orange-200 border border-orange-500/50 rounded px-1 py-0.5">
                              Resgate
                            </span>
                          ) : null}
                          <p className="truncate text-violet-300/80" title={pathTxt}>
                            {pathTxt}
                          </p>
                          {briefTxt ? (
                            <p className="truncate text-cyan-200/70" title={briefTxt}>
                              {briefTxt}
                            </p>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex flex-col gap-1 min-w-[5.5rem]">
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/40 px-2 py-1.5 text-[10px] font-semibold hover:bg-[#25D366]/25 whitespace-nowrap shrink-0"
                            >
                              <MessageCircle className="w-3 h-3 shrink-0" />
                              WhatsApp
                            </a>
                          ) : (
                            <span className="text-[10px] text-zinc-600">Sem WA</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {analytics ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              ROI por campanha (utm_campaign)
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              LTV vs soma de CPA por lead (webhook) e vs spend de ads do mês (admin). ROAS = LTV ÷ spend.
            </p>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-xs text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                  <tr>
                    <th className="text-left py-2">Campanha</th>
                    <th className="text-right py-2">Leads</th>
                    <th className="text-right py-2">Conv.%</th>
                    <th className="text-right py-2">LTV Σ</th>
                    <th className="text-right py-2">Spend mês</th>
                    <th className="text-right py-2">Lucro</th>
                    <th className="text-right py-2">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {analytics.byCampaign.slice(0, 25).map((r) => (
                    <tr key={`${r.utm_source}-${r.utm_campaign}`} className="text-zinc-300">
                      <td className="py-1.5 text-xs">
                        <div className="font-mono text-[#00FF00]/80">{r.utm_campaign}</div>
                        <div className="text-[10px] text-zinc-600">{r.utm_source}</div>
                      </td>
                      <td className="py-1.5 text-right">{r.leads}</td>
                      <td className="py-1.5 text-right text-amber-200/90">{r.taxa_conversao_cliente_pct.toFixed(1)}%</td>
                      <td className="py-1.5 text-right font-mono text-emerald-400">{brl(r.total_vendas)}</td>
                      <td className="py-1.5 text-right font-mono text-zinc-400">
                        {brl(r.spend_ads_mes_brl ?? 0)}
                      </td>
                      <td
                        className={`py-1.5 text-right font-mono ${
                          (r.lucro_apos_spend_ads_brl ?? 0) < 0 ? 'text-red-400' : 'text-sky-300/90'
                        }`}
                      >
                        {brl(r.lucro_apos_spend_ads_brl ?? r.lucro_com_cpa_leads_brl ?? 0)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-zinc-300">
                        {r.roas != null ? `${r.roas.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-5">
            <h2 className="text-lg font-semibold text-amber-200 flex items-center gap-2 mb-3">
              <Radio className="w-5 h-5" />
              Top 1% — VIP (RFM)
            </h2>
            <p className="text-xs text-zinc-500 mb-3">Recência, frequência e valor — prioridade absoluta do comercial.</p>
            <ul className="space-y-2 text-sm max-h-72 overflow-y-auto">
              {analytics.rfmTopPct.map((r) => (
                <li
                  key={r.leadId}
                  className="flex justify-between gap-2 border-b border-zinc-800/60 pb-2 text-zinc-300"
                >
                  <span className="truncate font-medium text-white">{r.name}</span>
                  <span className="shrink-0 font-mono text-emerald-400">{brl(r.valor_ltv)}</span>
                </li>
              ))}
              {analytics.rfmTopPct.length === 0 ? (
                <li className="text-zinc-600 text-sm">Sincronize LTV ou importe pedidos.</li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {analytics ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-zinc-400" />
            Fonte (utm_source) — ordenado por LTV
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left py-2">Fonte</th>
                  <th className="text-right py-2">Leads</th>
                  <th className="text-right py-2">Ativos</th>
                  <th className="text-right py-2">Conv.%</th>
                  <th className="text-right py-2">LTV Σ</th>
                  <th className="text-right py-2">LTV / lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {analytics.bySource.map((r) => (
                  <tr key={r.utm_source} className="text-zinc-300">
                    <td className="py-2 font-mono text-xs">{r.utm_source}</td>
                    <td className="py-2 text-right">{r.leads}</td>
                    <td className="py-2 text-right text-emerald-400/80">{r.cliente_ativo}</td>
                    <td className="py-2 text-right">{r.taxa_conversao_cliente_pct.toFixed(1)}%</td>
                    <td className="py-2 text-right font-mono text-emerald-400">{brl(r.total_vendas)}</td>
                    <td className="py-2 text-right font-mono text-zinc-400">{brl(r.ltv_medio_por_lead)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {cohortRows.length > 0 ? (
        <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-5">
          <h2 className="text-lg font-semibold text-emerald-200 flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5" />
            Cohort — retenção mensal (LTV previsível)
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            % de compradores cuja primeira compra foi nesse mês que voltaram a comprar em M+1 … M+6.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="text-left py-2">Cohort</th>
                  <th className="text-right py-2">N</th>
                  <th className="text-right py-2">M+1</th>
                  <th className="text-right py-2">M+2</th>
                  <th className="text-right py-2">M+3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {cohortRows.slice(-9).map((c) => (
                  <tr key={c.cohort_month} className="text-zinc-300">
                    <td className="py-1.5 font-mono text-xs">{c.cohort_month}</td>
                    <td className="py-1.5 text-right">{c.buyers_first_month}</td>
                    <td className="py-1.5 text-right text-emerald-300/90">
                      {c.retention_next_months_pct.m_plus_1_pct?.toFixed(1) ?? '—'}%
                    </td>
                    <td className="py-1.5 text-right">
                      {c.retention_next_months_pct.m_plus_2_pct?.toFixed(1) ?? '—'}%
                    </td>
                    <td className="py-1.5 text-right">
                      {c.retention_next_months_pct.m_plus_3_pct?.toFixed(1) ?? '—'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {gateways.length > 0 ? (
        <section className="rounded-xl border border-orange-900/40 bg-orange-950/10 p-5">
          <h2 className="text-lg font-semibold text-orange-200 flex items-center gap-2 mb-3">
            <Radio className="w-5 h-5" />
            Contingência — pulses de checkout
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Webhook POST /api/v1/checkout/pulse com event APPROVED alimenta lastApprovedAt. Alerta se ficar velho.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {gateways.map((g) => (
              <li
                key={g.code}
                className={`rounded-lg border px-3 py-2 ${
                  g.alertStaleApproved || g.alertStaleWebhook
                    ? 'border-red-500/50 bg-red-950/30 text-red-200'
                    : 'border-zinc-700 bg-zinc-900/60 text-zinc-300'
                }`}
              >
                <div className="font-semibold text-white">{g.label || g.code}</div>
                <div className="text-[10px] font-mono mt-1">
                  Approved: {g.lastApprovedAt ? fmtDt(g.lastApprovedAt) : 'nunca'}
                </div>
                <div className="text-[10px] font-mono">
                  Webhook: {g.lastWebhookAt ? fmtDt(g.lastWebhookAt) : 'nunca'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canExport ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-300">Auditoria comercial</h2>
            <button
              type="button"
              disabled={auditLoading}
              onClick={() => void loadAudit()}
              className="text-xs rounded-lg border border-zinc-600 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
            >
              {auditLoading ? 'A carregar…' : auditOpen ? 'Atualizar log' : 'Ver exportações e acessos'}
            </button>
          </div>
          {auditOpen && auditRows.length > 0 ? (
            <ul className="mt-3 max-h-48 overflow-y-auto text-xs text-zinc-400 space-y-1 font-mono">
              {auditRows.map((a) => (
                <li key={a.id} className="border-b border-zinc-800/80 pb-1">
                  <span className="text-zinc-500">{fmtDt(a.createdAt)}</span>{' '}
                  <span className="text-zinc-300">{a.userEmail}</span> · {a.action}
                  {a.entityId ? <span className="text-violet-400/80"> · {a.entityId.slice(0, 8)}…</span> : null}
                </li>
              ))}
            </ul>
          ) : auditOpen ? (
            <p className="mt-2 text-xs text-zinc-600">Sem registos.</p>
          ) : null}
        </section>
      ) : null}

      {detailId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setDetailId(null)}
          onKeyDown={(e) => e.key === 'Escape' && setDetailId(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 max-h-[85vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <button
              type="button"
              className="absolute top-3 right-3 p-2 rounded-lg text-zinc-400 hover:bg-zinc-800"
              onClick={() => setDetailId(null)}
            >
              <X className="w-4 h-4" />
            </button>
            {detailLoading || !detailLead ? (
              <div className="flex justify-center py-12 text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white pr-8">{detailLead.name}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-1">{detailLead.email}</p>
                <p className="text-xs text-zinc-400 mt-2">
                  Score {detailLead.engagementScore}
                  {detailLead.confidenceScore != null ? ` · Conf. ${Math.round(detailLead.confidenceScore)}` : ''} · LTV{' '}
                  {brl(detailLead.totalSales)} · {detailLead.purchaseCount ?? 0} pedidos
                </p>
                {detailLead.customerHealth ? (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Saúde:{' '}
                    <span className="text-zinc-300">
                      {(HEALTH_STYLE[detailLead.customerHealth] ?? HEALTH_STYLE.neutro).label}
                    </span>
                    {detailLead.digitalFingerprintAlert ? (
                      <span className="ml-2 text-orange-300">· Alerta fingerprint</span>
                    ) : null}
                  </p>
                ) : null}
                {(detailLead.utmFirstSource || detailLead.utmFirstCampaign) && (
                  <p className="text-[11px] text-violet-300/90 mt-2">
                    1º toque: {detailLead.utmFirstSource || '—'} / {detailLead.utmFirstCampaign || '—'}
                  </p>
                )}
                <p className="text-[11px] text-[#00FF00]/80 mt-1">
                  Último toque: {detailLead.utmSource || '—'} / {detailLead.utmCampaign || '—'}
                </p>
                {detailLead.conversionPathSummary ? (
                  <p className="text-[11px] text-sky-300/90 mt-2 border-l-2 border-sky-500/40 pl-2">
                    Jornada (ROI real): {detailLead.conversionPathSummary}
                  </p>
                ) : null}
                {detailLead.trustScore != null || detailLead.averageTicketBrl != null ? (
                  <p className="text-[11px] text-zinc-400 mt-2">
                    Trust: {detailLead.trustScore != null ? `${detailLead.trustScore}/100` : '—'} · Ticket médio:{' '}
                    {detailLead.averageTicketBrl != null ? brl(detailLead.averageTicketBrl) : '—'}
                  </p>
                ) : null}
                {detailLead.cartRescueImmediate ? (
                  <p className="text-[11px] text-orange-200 mt-2 font-semibold">
                    Resgate imediato — checkout pendente; contactar para PIX/boleto.
                  </p>
                ) : null}
                <div className="mt-3 rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase text-cyan-300/90">Dica de venda (IA)</span>
                    <button
                      type="button"
                      disabled={briefBusy}
                      onClick={() => void regenerateAiBrief()}
                      className="text-[10px] rounded border border-cyan-600/40 px-2 py-1 text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-50"
                    >
                      {briefBusy ? '…' : 'Regerar'}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-300 whitespace-pre-wrap">
                    {(detailLead.commercialAiBrief || '').trim() || 'Sem resumo ainda — use Regerar ou aguarde o próximo webhook.'}
                  </p>
                </div>
                {detailLead.upsellSuggestions && detailLead.upsellSuggestions.length > 0 ? (
                  <p className="text-[11px] text-amber-200/90 mt-2">
                    Upsell sugerido: {detailLead.upsellSuggestions.join(', ')}
                  </p>
                ) : null}
                {detailLead.cpaBrl != null ? (
                  <p className="text-[11px] text-sky-300/90 mt-2">
                    CPA lead: {brl(detailLead.cpaBrl)}
                    {detailLead.profitAfterCpaBrl != null
                      ? ` · Lucro LTV−CPA: ${brl(detailLead.profitAfterCpaBrl)}`
                      : ''}
                  </p>
                ) : null}
                {detailLead.hotStalledAlert ? (
                  <p className="text-[11px] text-amber-300 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Lead quente parado — prioridade de ligação.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={scriptBusy}
                    onClick={() => void generateSalesScript()}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-600/50 bg-violet-950/40 px-3 py-2 text-xs text-violet-200 hover:bg-violet-950/60 disabled:opacity-50"
                  >
                    {scriptBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Roteiro WhatsApp (IA)
                  </button>
                </div>
                {scriptText ? (
                  <div className="mt-3 rounded-lg border border-zinc-700 bg-black/40 p-3 text-sm text-zinc-200 whitespace-pre-wrap">
                    {scriptText}
                  </div>
                ) : null}
                {isAdmin ? (
                  <p className="text-[10px] text-zinc-600 mt-2">
                    Atribuir comercial:{' '}
                    <code className="text-zinc-400">PATCH /api/admin/intelligence-leads/{'{id}'}</code> com{' '}
                    <code>assignedCommercialId</code>
                  </p>
                ) : null}
                <h4 className="text-sm font-medium text-amber-200/90 mt-5 mb-2">Linha do tempo</h4>
                <ul className="space-y-3 border-l border-zinc-700 pl-4 ml-1">
                  {timeline.map((ev, i) => (
                    <li key={`${ev.occurredAt}-${i}`} className="text-sm relative">
                      <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#00FF00]" />
                      <p className="text-[10px] text-zinc-500">{fmtDt(ev.occurredAt)}</p>
                      <p className="text-zinc-200 font-medium">{ev.title}</p>
                      {ev.detail ? (
                        <p className="text-xs text-zinc-500 mt-0.5 whitespace-pre-wrap">{ev.detail}</p>
                      ) : null}
                      <p className="text-[10px] text-zinc-600 mt-0.5">{ev.source}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
