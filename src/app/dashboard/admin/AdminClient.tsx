'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Activity,
  DollarSign,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  BarChart3,
  Cpu,
  Target,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Pause,
  Play,
  Radio,
  Globe,
  Coins,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type LtvProfile = { profile: string; avgLtv: number; totalRevenue: number; clientCount: number }
type InfraHealth = { active: number; dead: number; total: number; healthPct: number; openRmas: number }
type GatewayKpi = {
  configured: boolean
  health: boolean
  fxRate: number
  balanceUsd?: number
  balanceBrl?: number
  stableUsd?: number
  stableBrl?: number
}
type MercuryKpi = GatewayKpi & { balanceUsd: number; balanceBrl: number }
type KastKpi    = GatewayKpi & { stableUsd: number; stableBrl: number }

type Kpis = {
  profitBrl: number
  profitUsd: number
  roi365: number
  adSpendBrl: number
  mrrBrl: number
  infraHealth: InfraHealth
  activeSubscriptions: number
  ltvByProfile: LtvProfile[]
  mercury?: MercuryKpi
  kast?: KastKpi
  globalRevenueBrl?: number
}
type CashFlowMonth = { label: string; sales: number; recurring: number }
type VendorData = {
  id: string
  name: string
  category: string
  totalAssets: number
  rmaCount: number
  rmaRate: number
  suspended: boolean
  suspendedReason: string | null
  rating: number
  alert: boolean
}
type Alert = { type: string; message: string }
type WarRoomData = {
  kpis: Kpis
  cashFlow: CashFlowMonth[]
  vendors: VendorData[]
  alerts: Alert[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBrl(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`
  return `R$ ${n.toLocaleString('pt-BR')}`
}

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$ ${(n / 1_000).toFixed(1)}k`
  return `$ ${n.toLocaleString('en-US')}`
}

const PROFILE_LABELS: Record<string, string> = {
  TRADER_WHATSAPP: 'Trader',
  LOCAL_BUSINESS: 'Negócio Local',
  MENTORADO: 'Mentorado',
  INFRA_PARTNER: 'Infra / Aluguel',
  SCALE_PARTNER: 'Scale Partner',
  PLUG_PLAY: 'Plug & Play',
  OTHERS: 'Outros',
  UNKNOWN: 'Sem perfil',
}

// ─── Tooltip customizado para o gráfico ───────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="mb-1">
          {p.name}: <span className="font-bold">{fmtBrl(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, trend, neon = false, danger = false,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | null
  neon?: boolean
  danger?: boolean
}) {
  return (
    <div className={`relative rounded-xl p-5 border transition-all ${
      danger
        ? 'bg-red-950/40 border-red-700/40'
        : neon
          ? 'bg-zinc-900 border-green-500/30'
          : 'bg-zinc-900 border-zinc-800'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${
          danger ? 'bg-red-900/50' : neon ? 'bg-green-500/10' : 'bg-zinc-800'
        }`}>
          <Icon className={`w-5 h-5 ${
            danger ? 'text-red-400' : neon ? 'text-green-400' : 'text-zinc-400'
          }`} />
        </div>
        {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-green-400" />}
        {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-400" />}
      </div>
      <p className="text-zinc-400 text-xs mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${
        danger ? 'text-red-400' : neon ? 'text-green-400' : 'text-white'
      }`}>{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
      {neon && (
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function AdminClient() {
  const [data, setData] = useState<WarRoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState<Date | null>(null)
  const [stopLossLoading, setStopLossLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'vendors' | 'profiles'>('overview')
  const [pulse, setPulse] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/war-room')
      .then((r) => r.json())
      .then((d: WarRoomData) => {
        setData(d)
        setRefreshed(new Date())
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    // Pulso a cada 30s para indicar ao CEO que os dados são live
    const pulseInterval = setInterval(() => setPulse((p) => !p), 1500)
    return () => clearInterval(pulseInterval)
  }, [fetchData])

  async function toggleStopLoss(vendor: VendorData) {
    setStopLossLoading(vendor.id)
    try {
      const res = await fetch('/api/admin/war-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor.id,
          suspend: !vendor.suspended,
          reason: !vendor.suspended ? `RMA Rate ${vendor.rmaRate}% — Stop Loss CEO` : undefined,
        }),
      })
      if (res.ok) fetchData()
    } finally {
      setStopLossLoading(null)
    }
  }

  const kpis = data?.kpis
  const infra = kpis?.infraHealth

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio className="w-6 h-6 text-green-400" />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 transition-opacity duration-700 ${pulse ? 'opacity-100' : 'opacity-20'}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">War Room OS</h1>
            <p className="text-zinc-500 text-xs">
              {refreshed
                ? `Atualizado às ${refreshed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Carregando dados...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          {/* Links rápidos para módulos */}
          <Link href="/dashboard/admin/revenue-8d" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
            <BarChart3 className="w-4 h-4 text-green-400" />
            8 Dígitos
          </Link>
          <Link href="/dashboard/admin/ad-monitoring" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
            <Activity className="w-4 h-4 text-blue-400" />
            Ads Monitor
          </Link>
          <Link href="/dashboard/admin/inter-health" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
            <Cpu className="w-4 h-4 text-purple-400" />
            Inter PIX
          </Link>
          <Link href="/dashboard/admin/mercury-health" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors">
            <Globe className="w-4 h-4 text-blue-400" />
            Mercury USD
          </Link>
        </div>
      </div>

      {/* ── Alertas ── */}
      {(data?.alerts ?? []).length > 0 && (
        <div className="space-y-2 mb-6">
          {data!.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm border ${
                a.type === 'critical'
                  ? 'bg-red-950/50 border-red-700/40 text-red-300'
                  : a.type === 'warning'
                    ? 'bg-amber-950/50 border-amber-700/40 text-amber-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {/* ── KPI Cards ── */}
      {loading && !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Profit Real (30d)"
            value={fmtBrl(kpis?.profitBrl ?? 0)}
            sub={`≈ ${fmtUsd(kpis?.profitUsd ?? 0)}`}
            icon={DollarSign}
            trend={((kpis?.profitBrl ?? 0) > 0) ? 'up' : 'down'}
            neon
          />
          <KpiCard
            label="ROI 365 dias"
            value={`${kpis?.roi365 ?? 0}%`}
            sub={`Gasto ads: ${fmtBrl(kpis?.adSpendBrl ?? 0)}`}
            icon={Target}
            trend={((kpis?.roi365 ?? 0) > 100) ? 'up' : ((kpis?.roi365 ?? 0) > 0 ? null : 'down')}
            neon={(kpis?.roi365 ?? 0) > 100}
          />
          <KpiCard
            label="MRR Recorrência"
            value={fmtBrl(kpis?.mrrBrl ?? 0)}
            sub={`${kpis?.activeSubscriptions ?? 0} assinatura(s) ativa(s)`}
            icon={TrendingUp}
            trend={(kpis?.mrrBrl ?? 0) > 0 ? 'up' : null}
          />
          <KpiCard
            label="Saúde da Infra"
            value={`${infra?.healthPct ?? 100}%`}
            sub={`${infra?.active ?? 0} ativos | ${infra?.dead ?? 0} DEAD | ${infra?.openRmas ?? 0} RMAs`}
            icon={Layers}
            danger={(infra?.healthPct ?? 100) < 70 || (infra?.openRmas ?? 0) > 5}
            trend={(infra?.healthPct ?? 100) >= 80 ? 'up' : 'down'}
          />
        </div>
      )}

      {/* ── Faixa Multi-Moeda (Mercury + Kast + Global) ── */}
      {!loading && (kpis?.mercury || kpis?.kast) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Mercury USD */}
          <div className={`relative rounded-xl p-4 border flex items-center gap-4 ${
            kpis.mercury.health
              ? 'bg-blue-950/30 border-blue-500/30'
              : kpis.mercury.configured
                ? 'bg-amber-950/20 border-amber-700/30'
                : 'bg-zinc-900 border-zinc-800'
          }`}>
            <div className={`p-2.5 rounded-xl ${kpis.mercury.health ? 'bg-blue-500/10' : 'bg-zinc-800'}`}>
              <Globe className={`w-5 h-5 ${kpis.mercury.health ? 'text-blue-400' : 'text-zinc-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-400 text-xs uppercase tracking-wide">Mercury LLC (USD)</p>
              <p className={`text-xl font-bold ${kpis.mercury.health ? 'text-blue-400' : 'text-zinc-500'}`}>
                {kpis.mercury.configured
                  ? `$ ${kpis.mercury.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Não configurado'}
              </p>
              {kpis.mercury.configured && (
                <p className="text-zinc-500 text-xs">
                  ≈ R$ {kpis.mercury.balanceBrl.toLocaleString('pt-BR')} · 1 USD = R$ {kpis.mercury.fxRate.toFixed(2)}
                </p>
              )}
            </div>
            <Link href="/dashboard/admin/mercury-health" className="shrink-0 text-xs text-zinc-400 hover:text-white transition-colors underline underline-offset-2">
              Detalhes
            </Link>
          </div>

          {/* Kast Cripto */}
          {kpis?.kast && (
            <div className={`relative rounded-xl p-4 border flex items-center gap-4 ${
              kpis.kast.health
                ? 'bg-purple-950/30 border-purple-500/30'
                : kpis.kast.configured
                  ? 'bg-amber-950/20 border-amber-700/30'
                  : 'bg-zinc-900 border-zinc-800'
            }`}>
              <div className={`p-2.5 rounded-xl ${kpis.kast.health ? 'bg-purple-500/10' : 'bg-zinc-800'}`}>
                <Coins className={`w-5 h-5 ${kpis.kast.health ? 'text-purple-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-400 text-xs uppercase tracking-wide">Kast / Cripto (USDT)</p>
                <p className={`text-xl font-bold ${kpis.kast.health ? 'text-purple-400' : 'text-zinc-500'}`}>
                  {kpis.kast.configured
                    ? `$ ${(kpis.kast.stableUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'Não configurado'}
                </p>
                {kpis.kast.configured && (
                  <p className="text-zinc-500 text-xs">≈ {fmtBrl(kpis.kast.stableBrl ?? 0)} · 1 USD = R$ {kpis.kast.fxRate.toFixed(2)}</p>
                )}
              </div>
              <Link href="/dashboard/admin/kast-health" className="shrink-0 text-xs text-zinc-400 hover:text-white transition-colors underline underline-offset-2">
                Detalhes
              </Link>
            </div>
          )}

          {/* Receita Global Consolidada */}
          <div className="rounded-xl p-4 border bg-zinc-900 border-zinc-800 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-green-500/10">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-zinc-400 text-xs uppercase tracking-wide">Receita Global (BRL equiv.)</p>
              <p className="text-xl font-bold text-green-400">
                {fmtBrl(kpis.globalRevenueBrl ?? kpis.profitBrl)}
              </p>
              <p className="text-zinc-500 text-xs">Inter + Mercury + Kast consolidados</p>
            </div>
          </div>

          {/* MRR → ARR projetado */}
          <div className="rounded-xl p-4 border bg-zinc-900 border-zinc-800 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-purple-500/10">
              <Layers className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-zinc-400 text-xs uppercase tracking-wide">ARR Projetado</p>
              <p className="text-xl font-bold text-purple-400">
                {fmtBrl((kpis.mrrBrl ?? 0) * 12)}
              </p>
              <p className="text-zinc-500 text-xs">MRR {fmtBrl(kpis.mrrBrl ?? 0)} × 12</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-xl w-fit">
        {(['overview', 'vendors', 'profiles'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? 'Visão Geral' : tab === 'vendors' ? '🛡️ Stop Loss' : '👤 Perfis LTV'}
          </button>
        ))}
      </div>

      {/* ── Tab: Visão Geral — Gráfico Híbrido ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Gráfico de Fluxo de Caixa Híbrido */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-white">Fluxo de Caixa Híbrido</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Vendas únicas + Recorrência — últimos 12 meses</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-green-500 inline-block" />
                  <span className="text-zinc-400">Vendas Únicas</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-blue-400 inline-block" />
                  <span className="text-zinc-400">Recorrência</span>
                </span>
              </div>
            </div>
            <div className="h-72">
              {data?.cashFlow && data.cashFlow.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.cashFlow} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => fmtBrl(v).replace('R$ ', '')}
                      width={48}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="sales"
                      name="Vendas Únicas"
                      fill="#22c55e"
                      fillOpacity={0.85}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="recurring"
                      name="Recorrência"
                      stroke="#60a5fa"
                      strokeWidth={2.5}
                      dot={{ fill: '#60a5fa', strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  Sem dados de fluxo de caixa ainda
                </div>
              )}
            </div>
          </div>

          {/* CEO God View — Switch de perfil */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-purple-400" />
              <h2 className="font-semibold text-white">God View — Entrar como Cliente</h2>
            </div>
            <p className="text-zinc-500 text-sm mb-4">
              Acesse qualquer área de cliente para ver exatamente o que ele está vendo.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Trader', href: '/dashboard/cliente', icon: '⚡', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:border-yellow-500/50' },
                { label: 'Negócio Local', href: '/dashboard/cliente', icon: '🏢', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:border-blue-500/50' },
                { label: 'Mentorado', href: '/dashboard/cliente', icon: '🎓', color: 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:border-purple-500/50' },
                { label: 'Infra Partner', href: '/dashboard/cliente', icon: '🛰️', color: 'bg-green-500/10 border-green-500/20 text-green-400 hover:border-green-500/50' },
                { label: 'Plug & Play', href: '/dashboard/cliente', icon: '🔌', color: 'bg-pink-500/10 border-pink-500/20 text-pink-400 hover:border-pink-500/50' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center text-sm font-medium transition-all ${item.color}`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Quick links para módulos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Financeiro', href: '/dashboard/finance', icon: DollarSign, color: 'text-green-400' },
              { label: 'Operações / RMA', href: '/dashboard/admin/rma', icon: ShieldAlert, color: 'text-red-400' },
              { label: 'Planos SaaS', href: '/dashboard/admin/plans', icon: Layers, color: 'text-blue-400' },
              { label: 'Analytics', href: '/dashboard/admin/revenue-8d', icon: BarChart3, color: 'text-purple-400' },
              { label: 'Fornecedores', href: '/dashboard/purchasing/vendors', icon: Users, color: 'text-amber-400' },
              { label: 'Estoque', href: '/dashboard/purchasing', icon: Zap, color: 'text-cyan-400' },
              { label: 'Ad Monitor', href: '/dashboard/admin/ad-monitoring', icon: Activity, color: 'text-indigo-400' },
              { label: 'Inter PIX', href: '/dashboard/admin/inter-health', icon: Cpu, color: 'text-emerald-400' },
              { label: 'Mercury USD', href: '/dashboard/admin/mercury-health', icon: Globe, color: 'text-blue-400' },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-all group"
              >
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Stop Loss de Fornecedores ── */}
      {activeTab === 'vendors' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h2 className="font-semibold">Stop Loss — Controle de Fornecedores</h2>
            </div>
            <p className="text-zinc-500 text-sm">
              Suspenda automaticamente lotes com alta taxa de queda (RMA ≥ 30%). Um clique pausa todas as vendas.
            </p>
          </div>

          {(data?.vendors ?? []).length === 0 ? (
            <div className="p-12 text-center text-zinc-600">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum fornecedor cadastrado ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-800 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4">Fornecedor</th>
                    <th className="px-4 py-4 text-center">Categoria</th>
                    <th className="px-4 py-4 text-center">Ativos</th>
                    <th className="px-4 py-4 text-center">RMAs</th>
                    <th className="px-4 py-4 text-center">Taxa RMA</th>
                    <th className="px-4 py-4 text-center">Rating</th>
                    <th className="px-4 py-4 text-center">Status</th>
                    <th className="px-4 py-4 text-center">Stop Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.vendors ?? []).map((v) => (
                    <tr
                      key={v.id}
                      className={`border-b border-zinc-800/60 last:border-0 transition-colors ${
                        v.suspended ? 'bg-red-950/10' : v.alert ? 'bg-amber-950/10' : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{v.name}</div>
                        {v.suspended && v.suspendedReason && (
                          <div className="text-red-400 text-xs mt-0.5 truncate max-w-xs">{v.suspendedReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs">
                          {v.category}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-zinc-300">{v.totalAssets}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={v.rmaCount > 0 ? 'text-amber-400' : 'text-zinc-500'}>
                          {v.rmaCount}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-bold ${
                            v.rmaRate >= 30 ? 'text-red-400' : v.rmaRate >= 15 ? 'text-amber-400' : 'text-green-400'
                          }`}>
                            {v.rmaRate}%
                          </span>
                          <div className="w-16 h-1 bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                v.rmaRate >= 30 ? 'bg-red-500' : v.rmaRate >= 15 ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(v.rmaRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-3 rounded-sm ${
                                i < v.rating ? 'bg-green-500' : 'bg-zinc-700'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {v.suspended ? (
                          <span className="flex items-center justify-center gap-1.5 text-red-400 text-xs">
                            <XCircle className="w-3.5 h-3.5" />
                            SUSPENSO
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1.5 text-green-400 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ATIVO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleStopLoss(v)}
                          disabled={stopLossLoading === v.id}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mx-auto ${
                            v.suspended
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                          } disabled:opacity-50`}
                        >
                          {stopLossLoading === v.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : v.suspended ? (
                            <Play className="w-3 h-3" />
                          ) : (
                            <Pause className="w-3 h-3" />
                          )}
                          {v.suspended ? 'Reativar' : 'Suspender'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: LTV por Perfil ── */}
      {activeTab === 'profiles' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(kpis?.ltvByProfile ?? []).length === 0 ? (
              <div className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center text-zinc-600">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Sem dados de LTV ainda — realize as primeiras vendas</p>
              </div>
            ) : (
              (kpis?.ltvByProfile ?? []).map((p, i) => (
                <div key={p.profile} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-zinc-400 text-xs uppercase tracking-wide">
                        {PROFILE_LABELS[p.profile] ?? p.profile}
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">{fmtBrl(p.avgLtv)}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">LTV médio por cliente</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      i === 0
                        ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        : i === 1
                          ? 'bg-zinc-700 text-zinc-300'
                          : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      #{i + 1}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Receita total</span>
                      <span className="text-white font-medium">{fmtBrl(p.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Clientes únicos</span>
                      <span className="text-white font-medium">{p.clientCount}</span>
                    </div>
                  </div>

                  <div className="mt-3 w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400"
                      style={{
                        width: `${Math.min(
                          100,
                          (p.totalRevenue /
                            Math.max(...(kpis?.ltvByProfile ?? []).map((x) => x.totalRevenue), 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Insight CEO */}
          {(kpis?.ltvByProfile ?? []).length > 0 && (
            <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-400 text-sm mb-1">🎯 Insight de Escala</p>
                  <p className="text-zinc-400 text-sm">
                    O perfil{' '}
                    <strong className="text-white">
                      {PROFILE_LABELS[kpis?.ltvByProfile?.[0]?.profile ?? ''] ?? kpis?.ltvByProfile?.[0]?.profile ?? '—'}
                    </strong>{' '}
                    tem o maior LTV médio ({fmtBrl(kpis?.ltvByProfile?.[0]?.avgLtv ?? 0)}).
                    Direcionar mais verba de ads para esse perfil aumenta o ROI diretamente.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="mt-12 pt-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-600 text-xs">
        <span>War Room OS · Ads Ativos Global</span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${pulse ? 'bg-green-500' : 'bg-zinc-600'} transition-colors duration-700`} />
          <span>Sistema operacional</span>
        </div>
      </div>
    </div>
  )
}
