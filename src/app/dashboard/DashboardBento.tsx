'use client'

import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  Package,
  TrendingUp,
  DollarSign,
  Warehouse,
  Target,
  Gift,
  Truck,
  Activity,
  Ban,
  Clock,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton'

type KpiItem = {
  key: string
  label: string
  value: number
  meta: number
  unit: string
}

const ICONS: Record<string, React.ElementType> = {
  productionDaily: Activity,
  productionMonthly: Package,
  stockCount: Warehouse,
  productionRejectedMonth: Ban,
  stockRunwayDays: Clock,
  ordersSold: TrendingUp,
  ordersDelivered: Truck,
  revenueMonth: DollarSign,
  saldo: DollarSign,
  bonusAccumulated: Gift,
}

function formatVal(val: number, unit: string, key?: string) {
  if (key === 'stockRunwayDays' && unit === '—') return '—'
  if (unit === 'R$') return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  if (unit === 'dias') return `${val.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
  return val.toLocaleString('pt-BR')
}

type ProducerInsights = {
  previsaoTotalMes: number
  metaPadraoContas: number
  metaEliteContas: number
  approvalRankWeek: number | null
  nextTierHint: string | null
  bonusHistory: { key: string; label: string; variablePay: number; totalPay: number }[]
  daysUntilMonthEnd: number
  closingHint: string | null
}

type DashboardBentoProps = {
  platform: string
  isAdmin?: boolean
  userRole?: string
}

export function DashboardBento({ platform, isAdmin, userRole }: DashboardBentoProps) {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0)
  const [producerInsights, setProducerInsights] = useState<ProducerInsights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const q = platform && platform !== 'ALL' ? `?platform=${encodeURIComponent(platform)}` : ''
    fetch(`/api/dashboard/executivo${q}`)
      .then((r) => r.json())
      .then((d) => {
        setKpis(d.kpis || [])
        setProducerInsights(d.producerInsights ?? null)
        if (typeof d.pendingWithdrawals === 'number') setPendingWithdrawals(d.pendingWithdrawals)
      })
      .catch(() => setKpis([]))
      .finally(() => setLoading(false))
  }, [platform])

  const chartKeys = ['productionMonthly', 'ordersSold'] as const
  const chartData = kpis
    .filter((k) => k.meta > 0 && chartKeys.includes(k.key as (typeof chartKeys)[number]))
    .map((k) => ({
      name: k.label.replace(' (mês)', '').replace(' (suas contas)', ''),
      value: k.value,
      meta: k.meta,
      pct: Math.min(100, Math.round((k.value / k.meta) * 100)),
    }))

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isAdmin && pendingWithdrawals > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>{pendingWithdrawals}</strong> saque(s) pendente(s) ou retido(s) aguardando ação.
          </span>
          <Link
            href="/dashboard/saques?pendentes=1"
            className="font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            Abrir fila de saques
          </Link>
        </div>
      )}
      {/* Bento Grid - KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => {
          const Icon = ICONS[k.key] || Target
          const hasMeta = k.meta > 0
          const pct = hasMeta ? Math.min(100, (k.value / k.meta) * 100) : 0
          const color =
            pct >= 100 ? 'emerald' : pct >= 80 ? 'primary' : pct >= 50 ? 'amber' : 'red'

          return (
            <motion.div
              key={k.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4 hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-primary-900/20 transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                  {k.label}
                </span>
                <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
              </div>
              <p className="text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                {formatVal(k.value, k.unit, k.key)}
              </p>
              {hasMeta && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>{pct.toFixed(0)}%</span>
                    <span>Meta: {formatVal(k.meta, k.unit)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className={`h-full rounded-full ${
                        color === 'emerald'
                          ? 'bg-emerald-500'
                          : color === 'primary'
                            ? 'bg-primary-500'
                            : color === 'amber'
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                      }`}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Bento - Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
            {userRole === 'PRODUCER'
              ? 'Produção x Suas vendas (vs metas)'
              : 'Produção x Vendas (vs Meta)'}
          </h3>
          <div className="h-48">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString('pt-BR')}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgb(228 228 231)',
                    }}
                  />
                  <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name="Atual" />
                  <Bar dataKey="meta" fill="#71717a" fillOpacity={0.4} radius={[0, 4, 4, 0]} name="Meta" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
                Sem dados para gráfico
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
            Percentual da Meta
          </h3>
          <div className="h-48">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradPct" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, 'Meta']}
                    contentStyle={{ borderRadius: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pct"
                    stroke="#2563EB"
                    fill="url(#gradPct)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm">
                Sem dados
              </div>
            )}
          </div>
          {userRole === 'PRODUCER' && producerInsights && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
              Referência de bônus: meta padrão {producerInsights.metaPadraoContas} contas · elite{' '}
              {producerInsights.metaEliteContas} contas (configuração de pagamento).
            </p>
          )}
        </motion.div>
      </div>

      {userRole === 'PRODUCER' && producerInsights && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-5 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
          {producerInsights.approvalRankWeek === 1 && (
            <p className="font-semibold text-primary-600 dark:text-primary-400">
              Você é a #1 em taxa de aprovação (Produção clássica) nos últimos 7 dias.
            </p>
          )}
          {producerInsights.approvalRankWeek != null && producerInsights.approvalRankWeek > 1 && (
            <p className="text-zinc-600 dark:text-zinc-400">
              Ranking aprovação (7d): #{producerInsights.approvalRankWeek} entre produtores com amostra mínima.
            </p>
          )}
          {producerInsights.nextTierHint && <p>{producerInsights.nextTierHint}</p>}
          {producerInsights.closingHint && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{producerInsights.closingHint}</p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Previsão total do mês (base + variável):{' '}
            {producerInsights.previsaoTotalMes.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          {producerInsights.bonusHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Variável (sem salário base) — últimos meses
              </p>
              <ul className="text-xs space-y-1">
                {producerInsights.bonusHistory.map((h) => (
                  <li key={h.key}>
                    {h.label}:{' '}
                    {h.variablePay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
