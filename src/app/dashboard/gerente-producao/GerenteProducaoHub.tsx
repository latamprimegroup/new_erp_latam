'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Factory, BarChart3, Target, FolderOpen, LayoutList,
  Package, ClipboardCheck, FileBarChart2, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, Users, Loader2,
  ArrowRight, Layers, Zap, ShieldCheck, Upload,
  RefreshCw, Trophy, Ban, Image as ImageIcon,
  Database, Mail, Building2, CreditCard,
  Rocket, ShieldAlert, ClipboardList, Search, ShoppingCart,
} from 'lucide-react'
import { AdsCoreGerenteInventoryBar } from '../ads-core/AdsCoreGerenteInventoryBar'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PipelineStats = {
  pendingReview: number
  approvedToday: number
  approvedMonth: number
  rejectedMonth: number
  approvalRate: number | null
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

// ─── Módulos do gerente ───────────────────────────────────────────────────────

const MODULES_PRODUCAO = [
  { href: '/dashboard/producao',             icon: Factory,       label: 'Fila de Produção',      sublabel: 'Aprovação e acompanhamento',          color: 'from-yellow-500 to-amber-600',   priority: true  },
  { href: '/dashboard/producao/conferencia', icon: ClipboardCheck,label: 'Conferência Diária',    sublabel: 'Validação do time',                   color: 'from-lime-500 to-green-600',     priority: true  },
  { href: '/dashboard/producao/metrics',     icon: TrendingUp,    label: 'Métricas de Produção',  sublabel: 'Aprovações, metas e reprovações',     color: 'from-teal-500 to-cyan-600',      priority: true  },
]


const MODULES_CORE = [
  { href: '/dashboard/ads-core/bi',                  icon: BarChart3,    label: 'Dashboard BI',           sublabel: 'Pipeline, ranking e reprovações',     color: 'from-blue-500 to-indigo-600',    priority: true  },
  { href: '/dashboard/ads-core/demandas',            icon: LayoutList,   label: 'Painel de Demandas',     sublabel: 'Visão gerente — atribuições',          color: 'from-purple-500 to-violet-600',  priority: true  },
  { href: '/dashboard/ads-core/atribuicao',          icon: Target,       label: 'Estoque e Atribuição',   sublabel: 'Documentos por colaborador',           color: 'from-emerald-500 to-green-600',  priority: true  },
  { href: '/dashboard/ads-core/nichos',              icon: FolderOpen,   label: 'Gestão por Nicho',       sublabel: 'Colaboradores × célula',              color: 'from-orange-500 to-amber-600',   priority: false },
  { href: '/dashboard/ads-core/gestao-contas',       icon: Layers,       label: 'MCC — Painel de Guerra', sublabel: 'Google Ads — visão gerente',           color: 'from-sky-500 to-cyan-600',       priority: false },
  { href: '/dashboard/ads-core/relatorios-producao', icon: FileBarChart2,label: 'Relatórios e Auditoria', sublabel: 'Conversão, SLA e auditoria',           color: 'from-rose-500 to-pink-600',      priority: false },
]

// ─── Componente principal ─────────────────────────────────────────────────────

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
          pendingReview:  m.pendingReviewCount ?? 0,
          approvedToday:  m.approvedToday ?? 0,
          approvedMonth:  approved,
          rejectedMonth:  rejected,
          approvalRate:   total > 0 ? Math.round((approved / total) * 100) : null,
        })
      }
      if (rgRes.ok)  setRg(await rgRes.json())
      if (effRes.ok) {
        const e = await effRes.json()
        setEfficiency({ producerRanking: e.producerRanking ?? [], nicheStats: e.nicheStats ?? [] })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const criticalNiche = efficiency?.nicheStats?.find((n) => n.emAberto > 10)

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-6">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold">Central do Gerente de Produção</h1>
          </div>
          <p className="text-sm text-zinc-500">
            Olá, <span className="font-medium text-zinc-700 dark:text-zinc-300">{session?.user?.name ?? session?.user?.email}</span> —
            visão completa da operação
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

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando dados...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Aguardando Aprovação"  value={pipeline?.pendingReview ?? '—'}  icon={<Clock       className="w-4 h-4 text-amber-500"  />} variant={pipeline?.pendingReview && pipeline.pendingReview > 20 ? 'warn' : 'default'} href="/dashboard/producao" />
          <KpiCard label="Aprovadas Hoje"        value={pipeline?.approvedToday ?? '—'}  icon={<CheckCircle2 className="w-4 h-4 text-green-500"  />} variant="success" />
          <KpiCard label="Aprovadas (mês)"       value={pipeline?.approvedMonth ?? '—'}  icon={<TrendingUp  className="w-4 h-4 text-blue-500"   />} />
          <KpiCard label="Taxa de Aprovação"     value={pipeline?.approvalRate != null ? `${pipeline.approvalRate}%` : '—'} icon={<BarChart3 className="w-4 h-4 text-purple-500" />} variant={pipeline?.approvalRate != null && pipeline.approvalRate < 70 ? 'warn' : 'success'} />
          <KpiCard label="RG Disponível"         value={rg?.disponivel ?? '—'}           icon={<ImageIcon   className="w-4 h-4 text-teal-500"    />} variant={rg?.disponivel != null && rg.disponivel < 20 ? 'warn' : 'default'} href="/dashboard/ads-core/rg-abastecimento" />
          <KpiCard label="RG Em Uso"             value={rg?.emUso ?? '—'}                icon={<Zap         className="w-4 h-4 text-orange-500"  />} />
        </div>
      )}

      {/* ── Alertas ────────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="space-y-2">
          {pipeline?.pendingReview != null && pipeline.pendingReview > 20 && (
            <AlertBanner kind="warn"  icon={<AlertTriangle className="w-4 h-4" />} message={`${pipeline.pendingReview} contas aguardando aprovação — fila acima do ideal.`} href="/dashboard/producao" cta="Ver fila" />
          )}
          {rg?.disponivel != null && rg.disponivel < 20 && (
            <AlertBanner kind="warn"  icon={<Package       className="w-4 h-4" />} message={`Estoque de RG crítico: apenas ${rg.disponivel} pares disponíveis.`} href="/dashboard/ads-core/rg-abastecimento" cta="Abastecer agora" />
          )}
          {pipeline?.approvalRate != null && pipeline.approvalRate < 70 && (
            <AlertBanner kind="error" icon={<Ban           className="w-4 h-4" />} message={`Taxa de aprovação em ${pipeline.approvalRate}% — abaixo do mínimo (70%).`} href="/dashboard/ads-core/relatorios-producao" cta="Ver relatório" />
          )}
          {criticalNiche && (
            <AlertBanner kind="info"  icon={<FolderOpen    className="w-4 h-4" />} message={`Nicho "${criticalNiche.nicheName}" tem ${criticalNiche.emAberto} ativos em aberto.`} href="/dashboard/ads-core/demandas" cta="Ver demandas" />
          )}
        </div>
      )}

      {/* ── Inventário ADS CORE ────────────────────────────────────────────── */}
      <AdsCoreGerenteInventoryBar />

      {/* ── Ações rápidas ──────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Ações Rápidas</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickActionCard
            href="/dashboard/ads-core/rg-abastecimento"
            icon={<Upload className="w-5 h-5 text-teal-600" />}
            iconBg="bg-teal-100 dark:bg-teal-900/40"
            title="Abastecer RG"
            desc={rg ? `${rg.disponivel} disponíveis · ${rg.emUso} em uso` : 'Upload de documentos em lote'}
            color="teal"
          />
          <QuickActionCard
            href="/dashboard/ads-core/atribuicao"
            icon={<Users className="w-5 h-5 text-primary-600" />}
            iconBg="bg-primary-100 dark:bg-primary-900/40"
            title="Delegar para Colaborador"
            desc="Atribua ativos a produtores"
            color="primary"
          />
          <QuickActionCard
            href="/dashboard/ads-core"
            icon={<Zap className="w-5 h-5 text-amber-600" />}
            iconBg="bg-amber-100 dark:bg-amber-900/40"
            title="Cadastrar Ativo (CNPJ)"
            desc="Registrar novo ativo no ADS CORE"
            color="amber"
          />
          <QuickActionCard
            href="/dashboard/base"
            icon={<Database className="w-5 h-5 text-zinc-600" />}
            iconBg="bg-zinc-100 dark:bg-zinc-800"
            title="Base de E-mails / CNPJs"
            desc="Gerenciar e-mails, CNPJs e perfis"
            color="zinc"
          />
        </div>
      </section>

      {/* ── Controle de Estoque ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Controle de Estoque de Contas</SectionTitle>

        {/* Fluxo visual */}
        <div className="mb-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">Entenda o fluxo</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex flex-col gap-1 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold shrink-0">A</span>
                Time produziu contas
              </span>
              <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">B</span>
                Compra de fornecedor
              </span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <div className="flex flex-col gap-1 shrink-0">
              <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                Inventário Express
              </span>
              <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                Entrada de Mercadoria
              </span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
              <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold shrink-0">3</span>
              Entra no estoque
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
              <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold shrink-0">4</span>
              Auditoria <span className="font-normal text-zinc-500">(confere divergências)</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Inventário Express — PRODUÇÃO INTERNA */}
          <StockCard
            href="/dashboard/admin/inventario-express"
            icon={<Rocket className="w-6 h-6 text-white" />}
            gradient="from-blue-500 to-blue-700"
            badge="PRODUÇÃO INTERNA"
            badgeColor="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            title="Inventário Express"
            subtitle="Contas criadas pelo time"
            description="O produtor terminou de criar contas Google/Meta? Use aqui para registrar em massa no sistema com ID, tipo, configuração e nome do produtor responsável."
            tipIcon={<Rocket className="w-3.5 h-3.5" />}
            tip="Para: contas que o time criou internamente"
          />

          {/* Entrada de Mercadoria — COMPRAS EXTERNAS */}
          <StockCard
            href="/dashboard/compras"
            icon={<ShoppingCart className="w-6 h-6 text-white" />}
            gradient="from-emerald-500 to-teal-600"
            badge="SETOR DE COMPRAS"
            badgeColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
            title="Entrada de Mercadoria"
            subtitle="BMs, Perfis, Páginas e mais"
            description="Comprou BMs, perfis, páginas, proxies ou outros ativos de um fornecedor? O lançamento é feito pelo setor de compras — acesse o painel de Supply Chain."
            tipIcon={<ShoppingCart className="w-3.5 h-3.5" />}
            tip="Gerenciado pelo: Setor de Compras"
          />

          {/* Auditoria de Estoque — CONFERÊNCIA */}
          <StockCard
            href="/dashboard/ads-core/inventario"
            icon={<Search className="w-6 h-6 text-white" />}
            gradient="from-purple-500 to-purple-700"
            badge="AUDITORIA"
            badgeColor="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
            title="Auditoria de Estoque"
            subtitle="Conferir e corrigir divergências"
            description="Compare o que o sistema registra com o que realmente existe. Detecta perdas, extravios e erros de lançamento. Gera alertas ao CEO quando há divergência crítica."
            tipIcon={<ClipboardList className="w-3.5 h-3.5" />}
            tip="Para: verificar se o estoque físico bate com o sistema"
          />
        </div>
      </section>

      {/* ── Trocas & Reposição ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Trocas &amp; Reposição de Contas</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Card principal — acesso direto */}
          <Link
            href="/dashboard/admin/rma"
            className="group relative overflow-hidden rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-white dark:bg-ads-dark-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-5 flex flex-col gap-4"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                OPERACIONAL
              </span>
            </div>
            <div>
              <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-0.5">Trocas &amp; Reposição de Contas</p>
              <p className="text-xs text-zinc-500 font-medium mb-3">Fluxo completo de troca quando conta falha após entrega</p>
              <div className="space-y-1.5">
                {[
                  { step: '1', label: 'Abrir ticket com o cliente e a conta com problema' },
                  { step: '2', label: 'Selecionar conta substituta do estoque disponível' },
                  { step: '3', label: 'Confirmar — saída automática do estoque' },
                  { step: '4', label: 'Ver resumo do mês: quantas trocas, quais motivos' },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-[10px] shrink-0">{s.step}</span>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                Estoque sai automaticamente ao resolver
              </span>
              <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-violet-500 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>

          {/* Painel lateral — o que o gerente vê */}
          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-5 space-y-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">O que você vê neste módulo</p>
            <div className="space-y-3">
              {[
                {
                  icon: <ClipboardList className="w-4 h-4 text-violet-500" />,
                  title: 'Fila de Tickets',
                  desc: 'Todos os tickets abertos, filtrados por status. Clique em um para agir.',
                },
                {
                  icon: <RefreshCw className="w-4 h-4 text-emerald-500" />,
                  title: 'Selecionar Conta Substituta',
                  desc: 'Escolhe do estoque disponível. Ao resolver, o sistema dá a saída sozinho.',
                },
                {
                  icon: <BarChart3 className="w-4 h-4 text-blue-500" />,
                  title: 'Resumo do Mês',
                  desc: 'Quantas trocas, resolvidas, pendentes e motivos mais comuns.',
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.title}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              ⚡ Analytics de perdas e detecção de abusos são visíveis apenas pelo Admin/CEO.
            </div>
          </div>

        </div>
      </section>

      {/* ── Módulos de Produção ────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Produção de Contas</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MODULES_PRODUCAO.map((mod) => <ModuleCard key={mod.href} mod={mod} />)}
        </div>
      </section>

      {/* ── Módulos ADS CORE ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle>ADS CORE — Gestão e Atribuição</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MODULES_CORE.filter((m) => m.priority).map((mod) => <ModuleCard key={mod.href} mod={mod} />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          {MODULES_CORE.filter((m) => !m.priority).map((mod) => <ModuleCardCompact key={mod.href} mod={mod} />)}
        </div>
      </section>

      {/* ── Ranking + Pipeline por nicho ──────────────────────────────────── */}
      {!loading && efficiency && (
        <section>
          <SectionTitle>Inteligência Operacional</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

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
                {efficiency.producerRanking.length === 0
                  ? <p className="text-sm text-zinc-400 text-center py-6">Sem dados de colaboradores</p>
                  : efficiency.producerRanking.slice(0, 5).map((p, i) => (
                    <div key={p.producerId} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-zinc-200 text-zinc-600' :
                        i === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-zinc-100 text-zinc-500'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name ?? p.email}</p>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                          <span className="text-green-600 font-medium">✓ {p.approved}</span>
                          <span className="text-red-600">✗ {p.rejected}</span>
                        </div>
                      </div>
                      {p.rejectionRatePct != null && (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          p.rejectionRatePct > 30 ? 'bg-red-100 text-red-700' :
                          p.rejectionRatePct > 15 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'}`}>
                          {p.rejectionRatePct.toFixed(0)}% repr.
                        </span>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>

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
                {efficiency.nicheStats.length === 0
                  ? <p className="text-sm text-zinc-400 text-center py-6">Nenhum nicho ativo</p>
                  : efficiency.nicheStats.slice(0, 6).map((n) => {
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
                  })
                }
              </div>
            </div>

          </div>
        </section>
      )}

      {/* ── Acesso à Base ──────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Base de Dados de Produção</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ResourceCard href="/dashboard/base#emails" icon={<Mail className="w-5 h-5 text-sky-600" />} iconBg="bg-sky-100 dark:bg-sky-900/40" title="E-mails Gmail" desc="Cadastro, upload em lote e gestão de contas Gmail usadas na produção" />
          <ResourceCard href="/dashboard/base#cnpjs"  icon={<Building2 className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40" title="CNPJs Nutra" desc="Cadastro com consulta à Receita Federal e vinculação a contas" />
          <ResourceCard href="/dashboard/base#perfis" icon={<CreditCard className="w-5 h-5 text-violet-600" />} iconBg="bg-violet-100 dark:bg-violet-900/40" title="Perfis de Pagamento" desc="Tipos de gateway e vínculos com CNPJs cadastrados" />
        </div>
      </section>

    </div>
  )
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3 px-0.5">
      {children}
    </h2>
  )
}

type ModItem = { href: string; icon: React.ElementType; label: string; sublabel: string; color: string; priority: boolean }

function ModuleCard({ mod }: { mod: ModItem }) {
  const Icon = mod.icon
  return (
    <Link href={mod.href} className="group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-5">
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 bg-gradient-to-br ${mod.color} transition-opacity`} />
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${mod.color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="font-semibold text-sm mb-0.5">{mod.label}</p>
      <p className="text-xs text-zinc-500">{mod.sublabel}</p>
      <ArrowRight className="w-4 h-4 text-zinc-300 mt-3 ml-auto group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
    </Link>
  )
}

function ModuleCardCompact({ mod }: { mod: ModItem }) {
  const Icon = mod.icon
  return (
    <Link href={mod.href} className="group flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:border-primary-300 hover:shadow-sm transition-all">
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

function QuickActionCard({
  href, icon, iconBg, title, desc, color,
}: { href: string; icon: React.ReactNode; iconBg: string; title: string; desc: string; color: string }) {
  const border = {
    teal:    'border-teal-200 dark:border-teal-800 hover:border-teal-400',
    primary: 'border-primary-200 dark:border-primary-800 hover:border-primary-400',
    amber:   'border-amber-200 dark:border-amber-800 hover:border-amber-400',
    violet:  'border-violet-200 dark:border-violet-800 hover:border-violet-400',
    blue:    'border-blue-200 dark:border-blue-800 hover:border-blue-400',
    zinc:    'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400',
  }[color] ?? 'border-zinc-200 hover:border-zinc-400'

  return (
    <Link href={href} className={`group flex items-center gap-3 p-4 rounded-xl border-2 border-dashed ${border} bg-white dark:bg-ads-dark-card hover:shadow-sm transition-all`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-300 shrink-0 ml-auto group-hover:translate-x-1 transition-transform" />
    </Link>
  )
}

function ResourceCard({
  href, icon, iconBg, title, desc,
}: { href: string; icon: React.ReactNode; iconBg: string; title: string; desc: string }) {
  return (
    <Link href={href} className="group flex gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="font-semibold text-sm mb-0.5">{title}</p>
        <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-zinc-300 shrink-0 self-center ml-auto group-hover:text-primary-400 group-hover:translate-x-1 transition-all" />
    </Link>
  )
}

function StockCard({
  href, icon, gradient, badge, badgeColor, title, subtitle, description, tipIcon, tip,
}: {
  href: string; icon: React.ReactNode; gradient: string; badge: string; badgeColor: string
  title: string; subtitle: string; description: string; tipIcon: React.ReactNode; tip: string
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card hover:shadow-lg hover:-translate-y-0.5 transition-all p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <div>
        <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-0.5">{title}</p>
        <p className="text-xs text-zinc-500 font-medium mb-2">{subtitle}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
          {tipIcon}
          <span>{tip}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  )
}

function KpiCard({
  label, value, icon, variant = 'default', href,
}: { label: string; value: number | string; icon: React.ReactNode; variant?: 'default' | 'success' | 'warn' | 'error'; href?: string }) {
  const bg = {
    default: 'bg-white dark:bg-ads-dark-card border-zinc-200 dark:border-zinc-700',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warn:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    error:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }[variant]
  const Wrapper = href ? Link : 'div'
  return (
    <Wrapper href={href ?? ''} className={`rounded-xl border p-3 ${bg} ${href ? 'hover:shadow-sm cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs text-zinc-500 font-medium leading-tight">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </Wrapper>
  )
}

function AlertBanner({
  kind, icon, message, href, cta,
}: { kind: 'warn' | 'error' | 'info'; icon: React.ReactNode; message: string; href: string; cta: string }) {
  const styles = {
    warn:  'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
    info:  'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  }[kind]
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${styles}`}>
      <div className="flex items-center gap-2 text-sm">{icon}{message}</div>
      <Link href={href} className="shrink-0 text-xs font-semibold underline hover:no-underline whitespace-nowrap">{cta}</Link>
    </div>
  )
}
