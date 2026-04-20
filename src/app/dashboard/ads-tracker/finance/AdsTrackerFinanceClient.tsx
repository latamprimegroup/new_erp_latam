'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RefreshCw, TrendingUp, Wallet, PiggyBank, Percent, Target, MousePointerClick, AlertCircle } from 'lucide-react'

type RangeKey = 'today' | 'yesterday' | '7d' | '30d'

type OverviewJson = {
  range: { preset: string; label: string; start: string; end: string }
  kpis: {
    spendBrlGoogle: number
    revenueConfirmedGclidBrl: number
    revenuePendingBrl: number
    revenueAllConfirmedBrl: number
    profitNetGclidBrl: number
    roiGclid: number
    cpaGclidBrl: number
    conversionRateGoogle: number
    conversionRateAttributedGclid: number
    googleClicks: number
    googleConversions: number
    gclidAttributedSales: number
  }
  charts: {
    hourlySales: { hour: string; sales: number; revenueBrl: number }[]
    deviceBreakdown: { name: string; value: number }[]
  }
  topUnisByRoi: {
    uniId: string
    label: string
    revenueGclidBrl: number
    allocatedSpendBrl: number
    roi: number | null
    note: string
  }[]
  alerts: {
    scaleProfitHighlight: boolean
    roiBaseline7d: number
    desktopShare: number
  }
  shield: {
    blockedClicks: number
    estimatedSavedBrl: number
    avgCpcBrl: number
    note: string
  }
  attributionNote: string
}

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#64748b']

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`
}

export function AdsTrackerFinanceClient() {
  const [range, setRange] = useState<RangeKey>('7d')
  const [data, setData] = useState<OverviewJson | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    fetch(`/api/admin/ads-tracker/finance-overview?range=${range}`)
      .then((r) => {
        if (!r.ok) throw new Error('overview')
        return r.json() as Promise<OverviewJson>
      })
      .then(setData)
      .catch(() => setErr('Não foi possível carregar o overview.'))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  async function forceSync() {
    setSyncing(true)
    setErr(null)
    try {
      const days = range === 'today' ? 2 : range === 'yesterday' ? 3 : range === '7d' ? 10 : 35
      const r = await fetch('/api/admin/ads-tracker/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || 'sync')
      }
      load()
    } catch {
      setErr('Sincronização Google falhou ou API não configurada.')
    } finally {
      setSyncing(false)
    }
  }

  const deviceData = useMemo(() => {
    const rows = data?.charts.deviceBreakdown.filter((d) => d.value > 0) ?? []
    return rows.length > 0 ? rows : [{ name: 'UNKNOWN', value: 1 }]
  }, [data])

  const profitHighlight = data?.alerts.scaleProfitHighlight

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['today', 'yesterday', '7d', '30d'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                range === k
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {k === 'today' ? 'Hoje' : k === 'yesterday' ? 'Ontem' : k === '7d' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar dados
          </button>
          <button
            type="button"
            onClick={() => void forceSync()}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-800/80 border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-700/80 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Forçar sincronização Google
          </button>
        </div>
      </div>

      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed">{data?.attributionNote}</p>

      {data && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <KpiCard
              icon={<Wallet className="w-5 h-5 text-sky-400" />}
              label="Gasto total (Google)"
              value={brl(data.kpis.spendBrlGoogle)}
              sub={`${data.kpis.googleClicks.toLocaleString('pt-BR')} cliques · API → logs diários`}
            />
            <KpiCard
              icon={<PiggyBank className="w-5 h-5 text-emerald-400" />}
              label="Receita confirmada (S2S + GCLID)"
              value={brl(data.kpis.revenueConfirmedGclidBrl)}
              sub={`${data.kpis.gclidAttributedSales} vendas atribuídas`}
            />
            <KpiCard
              icon={<TrendingUp className="w-5 h-5 text-violet-400" />}
              label="Lucro líquido (GCLID)"
              value={brl(data.kpis.profitNetGclidBrl)}
              sub={profitHighlight ? 'Escala: ROI acima da média 7d' : 'Base GCLID vs gasto agregado'}
              highlight={profitHighlight}
            />
            <KpiCard
              icon={<Percent className="w-5 h-5 text-amber-400" />}
              label="ROI (GCLID)"
              value={pct(data.kpis.roiGclid)}
              sub={`Baseline 7d: ${pct(data.alerts.roiBaseline7d)}`}
            />
            <KpiCard
              icon={<Target className="w-5 h-5 text-rose-400" />}
              label="CPA médio (GCLID)"
              value={data.kpis.gclidAttributedSales > 0 ? brl(data.kpis.cpaGclidBrl) : '—'}
              sub="Gasto ÷ vendas com GCLID"
            />
            <KpiCard
              icon={<MousePointerClick className="w-5 h-5 text-cyan-400" />}
              label="Taxa de conversão"
              value={pct(data.kpis.conversionRateAttributedGclid)}
              sub={`Google (conv/cliques): ${pct(data.kpis.conversionRateGoogle)}`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Boletos / Pix pendentes</h3>
              <p className="text-2xl font-mono text-amber-300">{brl(data.kpis.revenuePendingBrl)}</p>
              <p className="text-[11px] text-zinc-500 mt-2">
                Soma de postbacks com status PENDING (heurística no webhook). Não entra no ROI GCLID até confirmar.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Traffic Shield (estimativa)</h3>
              <p className="text-lg font-mono text-zinc-200">
                {data.shield.blockedClicks.toLocaleString('pt-BR')} cliques bloqueados
              </p>
              <p className="text-sm text-emerald-400 mt-1">~{brl(data.shield.estimatedSavedBrl)} poupados (est.)</p>
              <p className="text-[11px] text-zinc-500 mt-2">{data.shield.note}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 h-[320px]">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3">Vendas por horário (confirmadas)</h3>
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data.charts.hourlySales}>
                  <defs>
                    <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="hour" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }}
                    labelStyle={{ color: '#e4e4e7' }}
                    formatter={(v: number, name: string) =>
                      name === 'revenueBrl' ? brl(v) : [v, name === 'sales' ? 'Vendas' : name]
                    }
                  />
                  <Area type="monotone" dataKey="sales" stroke="#10b981" fill="url(#fillSales)" name="sales" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 h-[320px]">
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Dispositivos (postbacks)</h3>
              <p className="text-[11px] text-zinc-500 mb-2">
                Picos de desktop fora do padrão merecem checagem no Google Ads (não é diagnóstico automático de revisão).
              </p>
              {data.alerts.desktopShare >= 0.35 && (
                <p className="text-[11px] text-amber-500 mb-2">
                  Desktop ≈ {pct(data.alerts.desktopShare)} dos eventos com dispositivo conhecido.
                </p>
              )}
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={deviceData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {deviceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }}
                    formatter={(v: number) => [v, 'Eventos']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-200">Top 5 UNIs por ROI (GCLID)</h3>
              <p className="text-[11px] text-zinc-500 mt-1">
                Gasto alocado por proporção da receita GCLID da UNI no período (quando há várias UNIs).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">UNI</th>
                    <th className="text-right p-3">Receita GCLID</th>
                    <th className="text-right p-3">Gasto alocado</th>
                    <th className="text-right p-3">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {data.topUnisByRoi.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-zinc-500">
                        Sem vendas com GCLID e UNI no período. Envie `uni_id` no postback e GCLID válido.
                      </td>
                    </tr>
                  ) : (
                    data.topUnisByRoi.map((u, i) => (
                      <tr key={u.uniId} className="hover:bg-zinc-900/50">
                        <td className="p-3 text-zinc-500">{i + 1}</td>
                        <td className="p-3 text-zinc-200 max-w-[280px]">
                          <div className="truncate" title={u.label}>
                            {u.label}
                          </div>
                          <div className="text-[10px] text-zinc-600 font-mono truncate">{u.uniId}</div>
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-300">{brl(u.revenueGclidBrl)}</td>
                        <td className="p-3 text-right font-mono text-zinc-400">{brl(u.allocatedSpendBrl)}</td>
                        <td className="p-3 text-right font-mono text-sky-300">
                          {u.roi == null ? '—' : pct(u.roi)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-emerald-600/60 bg-emerald-950/25 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
          : 'border-zinc-800 bg-zinc-950/90'
      }`}
    >
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wide mb-2">
        {icon}
        {label}
      </div>
      <p className="text-xl font-semibold text-white font-mono">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">{sub}</p>
    </div>
  )
}
