'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Radio,
  ShieldAlert,
  Skull,
  Wallet,
  Warehouse,
} from 'lucide-react'

type WarRoomPayload = {
  generatedAt: string
  filters: { days: number; platform: string; niche: string | null; collaboratorId: string | null }
  switches: { marketingEmergency: boolean; globalKillSwitch: boolean }
  survival: {
    blackLive: number
    blackBanned24h: number
    blackBanned7d: number
    survivalPulse7dPct: number
    blackWentLive30d: number
    survivalBlack30dRate: number
    g2Rejected7d: number
    stockInUse: number
    stockAvailable: number
    definitions: string
  }
  syntheticHydra: {
    intentsPeriod: number
    intentsPending: number
    linkedRoiSumBrl: number
    avgRoiPerLinkedIntent: number | null
  }
  stockCritical: { minSetting: number; available: number; criticalStatusCount: number; belowMin: boolean }
  interPendingOrders: number
  financialFlow: { month: string; receitaBruta: number; custoContingencia: number; lucroLiquidoReal: number }[]
  bansHeatmap: { niche: string; count: number; intensity: number }[]
  productivityRank: { userId: string; name: string; delivered: number; metaDiaria: number; pct: number }[]
  anomalies: { type: string; severity: 'alta' | 'media'; message: string }[]
}

const PLATFORMS = [
  { value: 'ALL', label: 'Todas' },
  { value: 'GOOGLE_ADS', label: 'Google' },
  { value: 'META_ADS', label: 'Meta' },
  { value: 'TIKTOK_ADS', label: 'TikTok' },
  { value: 'KWAI_ADS', label: 'Kwai' },
]

function buildQuery(days: number, platform: string, niche: string, collaboratorId: string) {
  const p = new URLSearchParams()
  p.set('days', String(days))
  if (platform && platform !== 'ALL') p.set('platform', platform)
  if (niche.trim()) p.set('niche', niche.trim())
  if (collaboratorId.trim()) p.set('collaboratorId', collaboratorId.trim())
  return p.toString()
}

export function WarRoomClient() {
  const [days, setDays] = useState(30)
  const [platform, setPlatform] = useState('ALL')
  const [niche, setNiche] = useState('')
  const [collaboratorId, setCollaboratorId] = useState('')
  const [data, setData] = useState<WarRoomPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [marketingOn, setMarketingOn] = useState(false)
  const [showEmergencyStep1, setShowEmergencyStep1] = useState(false)
  const [showEmergencyStep2, setShowEmergencyStep2] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [savingEmergency, setSavingEmergency] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    const q = buildQuery(days, platform, niche, collaboratorId)
    fetch(`/api/admin/war-room?${q}`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar War Room')
        return r.json()
      })
      .then((d: WarRoomPayload) => {
        setData(d)
        setMarketingOn(!!d.switches.marketingEmergency)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [days, platform, niche, collaboratorId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => load(), 45000)
    return () => clearInterval(t)
  }, [load])

  async function applyMarketingEmergency(active: boolean) {
    setSavingEmergency(true)
    try {
      const res = await fetch('/api/admin/marketing-emergency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active,
          confirmPhrase: active ? phrase.trim() : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(j.error || 'Não foi possível atualizar')
        return
      }
      setMarketingOn(!!j.active)
      setShowEmergencyStep1(false)
      setShowEmergencyStep2(false)
      setPhrase('')
      load()
    } finally {
      setSavingEmergency(false)
    }
  }

  const chartTooltipStyle = {
    contentStyle: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(148,163,184,0.3)',
      borderRadius: 8,
    },
    labelStyle: { color: '#e2e8f0' },
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D1B2A] pb-12">
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <Link href="/dashboard/admin" className="hover:underline">
                Admin
              </Link>{' '}
              / War Room
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="h-7 w-7 text-amber-500" />
              War Room — Torre de Controle
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-3xl">
              Indicadores agregados no servidor; atualização automática a cada 45s. Filtros aplicam-se a Black, estoque G2
              vinculado e intents sintéticos com conta.
            </p>
            <p className="text-sm mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link
                href="/dashboard/admin/gatekeeper-almoxarifado"
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                Almoxarifado Gatekeeper (Cofre Módulo 01)
              </Link>
              <Link
                href="/dashboard/admin/gatekeeper-almoxarifado#module02"
                className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
              >
                Ponte Módulo 02 (pipeline + kit operador)
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
              Período (dias)
              <select
                className="card border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:bg-[#151d2e] dark:text-slate-100"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d}d
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
              Plataforma
              <select
                className="card border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm dark:bg-[#151d2e] dark:text-slate-100"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
              Nicho (Black / estoque)
              <input
                className="card border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm w-36 dark:bg-[#151d2e] dark:text-slate-100"
                placeholder="ex. NUTRA"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </label>
            <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
              Colaborador (id)
              <input
                className="card border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm w-40 dark:bg-[#151d2e] dark:text-slate-100 font-mono text-xs"
                placeholder="cuid…"
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
              />
            </label>
            <button type="button" className="btn-primary text-sm py-1.5 px-3" onClick={() => load()}>
              Aplicar
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-4 py-3 text-red-800 dark:text-red-200 text-sm">
            {err}
          </div>
        )}

        {loading && !data ? (
          <div className="text-slate-500 dark:text-slate-400">Carregando agregações…</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Activity className="h-4 w-4" />
                  Pulso Black (7d)
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{data.survival.survivalPulse7dPct}%</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Live {data.survival.blackLive} · Ban 7d {data.survival.blackBanned7d} · Ban 24h{' '}
                  {data.survival.blackBanned24h}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Sobrevivência 30d (pós-live): {data.survival.survivalBlack30dRate}%
                </p>
              </div>
              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Skull className="h-4 w-4" />
                  Pixel Hydra (sintético)
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {data.syntheticHydra.avgRoiPerLinkedIntent != null
                    ? `R$ ${data.syntheticHydra.avgRoiPerLinkedIntent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Intents {data.syntheticHydra.intentsPeriod} (pend. {data.syntheticHydra.intentsPending}) · ROI ligado R${' '}
                  {data.syntheticHydra.linkedRoiSumBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div
                className={`card border-2 dark:bg-[#151d2e] ${
                  data.stockCritical.belowMin || data.stockCritical.criticalStatusCount > 0
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Warehouse className="h-4 w-4" />
                  Estoque crítico
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{data.stockCritical.available}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Mínimo {data.stockCritical.minSetting} · status CRITICAL {data.stockCritical.criticalStatusCount}
                </p>
              </div>
              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Wallet className="h-4 w-4" />
                  Inter — aguardando
                </div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{data.interPendingOrders}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Pedidos com PIX Inter e status AWAITING_PAYMENT ou PENDING
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Fluxo financeiro (6 meses)</h2>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.financialFlow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip {...chartTooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="receitaBruta"
                        name="Receita bruta"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.15}
                      />
                      <Area
                        type="monotone"
                        dataKey="custoContingencia"
                        name="Contingência (proxy/servidor…)"
                        stroke="#f97316"
                        fill="#f97316"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="lucroLiquidoReal"
                        name="Lucro líquido (rec. − despesas)"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.12}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" />
                  Kill Switch — LP / Cloaking
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                  Flag em <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">marketing_emergency_pause</code>.
                  Consuma no edge das LPs/scripts para pausar redirecionamentos. O kill switch global do CEO continua separado
                  ({data.switches.globalKillSwitch ? 'ativo' : 'inativo'}).
                </p>
                {marketingOn ? (
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                    disabled={savingEmergency}
                    onClick={() => {
                      if (confirm('Desativar pausa de marketing (LP/cloaking)?')) void applyMarketingEmergency(false)
                    }}
                  >
                    Desativar pausa LP/cloaking
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
                    onClick={() => setShowEmergencyStep1(true)}
                  >
                    Ativar pausa de emergência
                  </button>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">
                  Heatmap de bans Black (por nicho, período)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {data.bansHeatmap.length === 0 ? (
                    <p className="text-sm text-slate-500 col-span-full">Sem bans no período filtrado.</p>
                  ) : (
                    data.bansHeatmap.map((cell) => (
                      <div
                        key={cell.niche}
                        className="rounded-lg p-3 text-center border border-slate-200 dark:border-slate-600"
                        style={{
                          backgroundColor: `rgba(239, 68, 68, ${0.12 + cell.intensity * 0.55})`,
                        }}
                      >
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">{cell.niche}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{cell.count}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">
                  Produtividade hoje vs meta diária (bônus)
                </h2>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.productivityRank.slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                      />
                      <Tooltip {...chartTooltipStyle} />
                      <Legend />
                      <Bar dataKey="delivered" name="Entregues hoje" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="metaDiaria" name="Meta diária" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card dark:bg-[#151d2e] dark:border-slate-700 border border-slate-200">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Anomalias detectadas
              </h2>
              {data.anomalies.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum alerta estatístico no recorte atual.</p>
              ) : (
                <ul className="space-y-2">
                  {data.anomalies.map((a, i) => (
                    <li
                      key={i}
                      className={`text-sm rounded-lg px-3 py-2 border ${
                        a.severity === 'alta'
                          ? 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-red-900 dark:text-red-100'
                          : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                      }`}
                    >
                      <span className="font-medium uppercase text-[10px]">{a.type}</span> — {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">{data.survival.definitions}</p>
            <p className="text-xs text-slate-400">Snapshot: {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>
          </>
        ) : null}
      </div>

      {showEmergencyStep1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full dark:bg-[#151d2e] border border-slate-200 dark:border-slate-600 shadow-xl">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Confirmar emergência (1/2)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Isto ativa a flag de pausa de LPs e cloaking para o seu edge ler. Não substitui o kill switch operacional do CEO.
              Confirme se houve atualização crítica de algoritmo ou incidente de compliance.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowEmergencyStep1(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm"
                onClick={() => {
                  setShowEmergencyStep1(false)
                  setShowEmergencyStep2(true)
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmergencyStep2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-md w-full dark:bg-[#151d2e] border border-red-300 dark:border-red-800 shadow-xl">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Confirmação final (2/2)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              Digite <strong>PAUSAR_LP</strong> para ativar a pausa.
            </p>
            <input
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-900 dark:text-white mb-4"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="PAUSAR_LP"
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setShowEmergencyStep2(false)
                  setPhrase('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm disabled:opacity-50"
                disabled={savingEmergency || phrase.trim() !== 'PAUSAR_LP'}
                onClick={() => void applyMarketingEmergency(true)}
              >
                Ativar pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
