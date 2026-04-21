'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Factory, BarChart3, Target, FolderOpen, LayoutList,
  Package, ClipboardCheck, FileBarChart2, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, Users, Loader2,
  ArrowRight, Layers, Zap, ShieldCheck, Upload,
  RefreshCw, Trophy, Ban, Image as ImageIcon
} from 'lucide-react'

// ─── Tipos de dados ───────────────────────────────────────────────────────────

type PipelineStats = {
  pendingReview: number       // PENDING + UNDER_REVIEW aguardando aprovação
  approvedToday: number
  approvedMonth: number
  rejectedMonth: number
  approvalRate: number | null // %
}

type RgStats = {
  disponivel: number
  emUso: number
  utilizado: number
}

type EfficiencyStats = {
  producerRanking: Array<{
    producerId: string
    name: string | null
    email: string
    approved: number
    rejected: number
    rejectionRatePct: number | null
  }>
  nicheStats: Array<{
    nicheId: string
    nicheName: string
    emAberto: number
    approved: number
    rejected: number
  }>
}

// ─── Módulos disponíveis para o gerente ──────────────────────────────────────

const MODULES = [
  {
    href: '/dashboard/ads-core/bi',
    icon: BarChart3,
    label: 'Dashboard de Gestão',
    sublabel: 'Pipeline, ranking e reprovações',
    color: 'from-blue-500 to-indigo-600',
    badge: null as string | null,
    priority: true,
  },
  {
    href: '/dashboard/ads-core/demandas',
    icon: LayoutList,
    label: 'Painel de Demandas',
    sublabel: 'Visão gerente — todas as atribuições',
    color: 'from-purple-500 to-violet-600',
    badge: null as string | null,
    priority: true,
  },
  {
    href: '/dashboard/ads-core/atribuicao',
    icon: Target,
    label: 'Estoque de Ativos',
    sublabel: 'Atribuição e documentos por colaborador',
    color: 'from-emerald-500 to-green-600',
    badge: null as string | null,
    priority: true,
  },
  {
    href: '/dashboard/ads-core/nichos',
    icon: FolderOpen,
    label: 'Gestão por Nicho',
    sublabel: 'Colaboradores × célula de produção',
    color: 'from-orange-500 to-amber-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/ads-core/gestao-contas',
    icon: Layers,
    label: 'Gestão de Contas (MCC)',
    sublabel: 'Painel de guerra — Google Ads',
    color: 'from-sky-500 to-cyan-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/ads-core/relatorios-producao',
    icon: FileBarChart2,
    label: 'Relatórios e Auditoria',
    sublabel: 'Conversão, SLA e auditoria somente leitura',
    color: 'from-rose-500 to-pink-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/producao/metrics',
    icon: TrendingUp,
    label: 'Métricas de Produção',
    sublabel: 'Aprovações, reprovações, motivos, metas',
    color: 'from-teal-500 to-cyan-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/ads-core/rg-abastecimento',
    icon: Package,
    label: 'Abastecimento de RG',
    sublabel: 'Upload em lote + saldo do estoque',
    color: 'from-zinc-500 to-slate-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/producao/conferencia',
    icon: ClipboardCheck,
    label: 'Conferência Diária',
    sublabel: 'Validação e conferência do time',
    color: 'from-lime-500 to-green-600',
    badge: null as string | null,
    priority: false,
  },
  {
    href: '/dashboard/producao',
    icon: Factory,
    label: 'Fila de Produção',
    sublabel: 'Aprovação e acompanhamento de contas',
    color: 'from-yellow-500 to-amber-600',
    badge: null as string | null,
    priority: false,
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export function GerenteProducaoHub() {
  const { data: session } = useSession()
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null)
  const [rg, setRg] = useState<RgStats | null>(null)
  const [efficiency, setEfficiency] = useState<EfficiencyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [metricsRes, rgRes, effRes] = await Promise.all([
        fetch('/api/producao/metrics?period=month'),
        fetch('/api/ads-core/rg-stock/stats'),
        fetch('/api/ads-core/metrics/efficiency'),
      ])

      if (metricsRes.ok) {
        const m = await metricsRes.json()
        const approved = m.approvedCount ?? 0
        const rejected = m.rejectedCount ?? 0
        const total = approved + rejected
        setPipeline({
          pendingReview: m.pendingReviewCount ?? 0,
          approvedToday: m.approvedToday ?? 0,
          approvedMonth: approved,
          rejectedMonth: rejected,
          approvalRate: total > 0 ? Math.round((approved / total) * 100) : null,
        })
      }

      if (rgRes.ok) setRg(await rgRes.json())
      if (effRes.ok) {
        const e = await effRes.json()
        setEfficiency({
          producerRanking: e.producerRanking ?? [],
          nicheStats: e.nicheStats ?? [],
        })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const topProducer = efficiency?.producerRanking?.[0]
  const criticalNiche = efficiency?.nicheStats?.find((n) => n.emAberto > 10)

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto space-y-6">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold">Central do Gerente de Produção</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Olá, <span className="font-medium text-zinc-700 dark:text-zinc-300">{session?.user?.name ?? session?.user?.email}</span> —
            visão completa da operação de produção
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* ── KPIs em tempo real ─────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando dados...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Aguardando Aprovação"
            value={pipeline?.pendingReview ?? '—'}
            icon={<Clock className="w-4 h-4 text-amber-500" />}
            variant={pipeline?.pendingReview && pipeline.pendingReview > 20 ? 'warn' : 'default'}
            href="/dashboard/producao"
          />
          <KpiCard
            label="Aprovadas Hoje"
            value={pipeline?.approvedToday ?? '—'}
            icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
            variant="success"
          />
          <KpiCard
            label="Aprovadas (mês)"
            value={pipeline?.approvedMonth ?? '—'}
            icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
          />
          <KpiCard
            label="Taxa de Aprovação"
            value={pipeline?.approvalRate != null ? `${pipeline.approvalRate}%` : '—'}
            icon={<BarChart3 className="w-4 h-4 text-purple-500" />}
            variant={pipeline?.approvalRate != null && pipeline.approvalRate < 70 ? 'warn' : 'success'}
          />
          <KpiCard
            label="RG Disponível"
            value={rg?.disponivel ?? '—'}
            icon={<ImageIcon className="w-4 h-4 text-teal-500" />}
            variant={rg?.disponivel != null && rg.disponivel < 20 ? 'warn' : 'default'}
            href="/dashboard/ads-core/rg-abastecimento"
          />
          <KpiCard
            label="RG Em Uso"
            value={rg?.emUso ?? '—'}
            icon={<Zap className="w-4 h-4 text-orange-500" />}
          />
        </div>
      )}

      {/* ── Alertas contextuais ─────────────────────────────────── */}
      {!loading && (
        <div className="space-y-2">
          {pipeline?.pendingReview != null && pipeline.pendingReview > 20 && (
            <AlertBanner
              kind="warn"
              icon={<AlertTriangle className="w-4 h-4" />}
              message={`${pipeline.pendingReview} contas aguardando aprovação — fila acima do ideal.`}
              href="/dashboard/producao"
              cta="Ver fila"
            />
          )}
          {rg?.disponivel != null && rg.disponivel < 20 && (
            <AlertBanner
              kind="warn"
              icon={<Package className="w-4 h-4" />}
              message={`Estoque de RG crítico: apenas ${rg.disponivel} pares disponíveis.`}
              href="/dashboard/ads-core/rg-abastecimento"
              cta="Abastecer agora"
            />
          )}
          {pipeline?.approvalRate != null && pipeline.approvalRate < 70 && (
            <AlertBanner
              kind="error"
              icon={<Ban className="w-4 h-4" />}
              message={`Taxa de aprovação em ${pipeline.approvalRate}% — abaixo do mínimo operacional (70%).`}
              href="/dashboard/ads-core/relatorios-producao"
              cta="Ver relatório"
            />
          )}
          {criticalNiche && (
            <AlertBanner
              kind="info"
              icon={<FolderOpen className="w-4 h-4" />}
              message={`Nicho "${criticalNiche.nicheName}" tem ${criticalNiche.emAberto} ativos em aberto.`}
              href="/dashboard/ads-core/demandas"
              cta="Ver demandas"
            />
          )}
        </div>
      )}

      {/* ── Módulos prioritários (ações imediatas) ─────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Ações Imediatas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MODULES.filter((m) => m.priority).map((mod) => (
            <ModuleCard key={mod.href} mod={mod} />
          ))}
        </div>
      </div>

      {/* ── Todos os módulos ───────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Todos os Módulos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {MODULES.filter((m) => !m.priority).map((mod) => (
            <ModuleCardCompact key={mod.href} mod={mod} />
          ))}
        </div>
      </div>

      {/* ── Ranking + Nichos ───────────────────────────────────── */}
      {!loading && efficiency && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Ranking de produtores */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm">Ranking de Colaboradores</span>
              </div>
              <Link href="/dashboard/ads-core/bi" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                Ver completo <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {efficiency.producerRanking.slice(0, 5).map((p, i) => (
                <div key={p.producerId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-zinc-200 text-zinc-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name ?? p.email}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                      <span className="text-green-600 font-medium">✓ {p.approved}</span>
                      <span className="text-red-600">✗ {p.rejected}</span>
                    </div>
                  </div>
                  {p.rejectionRatePct != null && (
                    <div className="shrink-0 text-right">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        p.rejectionRatePct > 30 ? 'bg-red-100 text-red-700' :
                        p.rejectionRatePct > 15 ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {p.rejectionRatePct.toFixed(0)}% repr.
                      </span>
                    </div>
                  )}
                </div>
              ))}
              {efficiency.producerRanking.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-6">Sem dados</p>
              )}
            </div>
          </div>

          {/* Pipeline por nicho */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-purple-500" />
                <span className="font-semibold text-sm">Pipeline por Nicho</span>
              </div>
              <Link href="/dashboard/ads-core/demandas" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                Ver demandas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {efficiency.nicheStats.slice(0, 6).map((n) => {
                const total = n.approved + n.rejected + n.emAberto
                const pct = total > 0 ? Math.round((n.approved / total) * 100) : 0
                return (
                  <div key={n.nicheId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">{n.nicheName}</p>
                        <span className="text-xs text-zinc-500 shrink-0">{n.emAberto} abertos</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary-700 dark:text-primary-400 shrink-0 w-8 text-right">{pct}%</span>
                  </div>
                )
              })}
              {efficiency.nicheStats.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-6">Sem dados</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Ação rápida: subir material / delegar ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/ads-core/atribuicao" className="group flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all">
          <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Users className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="font-semibold text-primary-700 dark:text-primary-300">Delegar para Colaborador</p>
            <p className="text-xs text-zinc-500 mt-0.5">Atribua ativos do estoque a produtores específicos</p>
          </div>
          <ArrowRight className="w-4 h-4 text-primary-400 ml-auto shrink-0 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link href="/dashboard/ads-core/rg-abastecimento" className="group flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-teal-300 dark:border-teal-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all">
          <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Upload className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <p className="font-semibold text-teal-700 dark:text-teal-300">Subir Material (RG)</p>
            <p className="text-xs text-zinc-500 mt-0.5">Upload em lote de frente/verso para o estoque</p>
          </div>
          <ArrowRight className="w-4 h-4 text-teal-400 ml-auto shrink-0 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

type ModuleItem = (typeof MODULES)[number]

function ModuleCard({ mod }: { mod: ModuleItem }) {
  const Icon = mod.icon
  return (
    <Link
      href={mod.href}
      className="group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-5"
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 bg-gradient-to-br ${mod.color} transition-opacity`} />
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${mod.color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="font-semibold text-sm mb-0.5">{mod.label}</p>
      <p className="text-xs text-zinc-500">{mod.sublabel}</p>
      <div className="flex items-center justify-between mt-3">
        {mod.badge && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">{mod.badge}</span>
        )}
        <ArrowRight className="w-4 h-4 text-zinc-400 ml-auto group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  )
}

function ModuleCardCompact({ mod }: { mod: ModuleItem }) {
  const Icon = mod.icon
  return (
    <Link
      href={mod.href}
      className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:border-primary-300 hover:shadow-sm transition-all"
    >
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${mod.color} flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{mod.label}</p>
        <p className="text-[10px] text-zinc-500 truncate">{mod.sublabel}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-zinc-300 shrink-0 ml-auto group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}

function KpiCard({
  label, value, icon, variant = 'default', href,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  variant?: 'default' | 'success' | 'warn' | 'error'
  href?: string
}) {
  const bg = {
    default: 'bg-white dark:bg-ads-dark-card border-zinc-200 dark:border-zinc-700',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }[variant]

  const Wrapper = href ? Link : 'div'
  return (
    <Wrapper href={href ?? ''} className={`rounded-xl border p-3 ${bg} ${href ? 'hover:shadow-sm transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs text-zinc-500 font-medium">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </Wrapper>
  )
}

function AlertBanner({
  kind, icon, message, href, cta,
}: {
  kind: 'warn' | 'error' | 'info'
  icon: React.ReactNode
  message: string
  href: string
  cta: string
}) {
  const styles = {
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  }[kind]

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${styles}`}>
      <div className="flex items-center gap-2 text-sm">
        {icon}
        {message}
      </div>
      <Link href={href} className="shrink-0 text-xs font-semibold underline hover:no-underline whitespace-nowrap">
        {cta}
      </Link>
    </div>
  )
}
