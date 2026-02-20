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
} from 'lucide-react'
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
  ordersSold: TrendingUp,
  ordersDelivered: Truck,
  revenueMonth: DollarSign,
  saldo: DollarSign,
  bonusAccumulated: Gift,
}

function formatVal(val: number, unit: string) {
  if (unit === 'R$') return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return val.toLocaleString('pt-BR')
}

export function DashboardBento() {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/executivo')
      .then((r) => r.json())
      .then((d) => setKpis(d.kpis || []))
      .catch(() => setKpis([]))
      .finally(() => setLoading(false))
  }, [])

  const chartData = kpis
    .filter((k) => k.meta > 0 && ['productionMonthly', 'ordersSold'].includes(k.key))
    .map((k) => ({
      name: k.label.replace(' (mês)', ''),
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
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50 transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">
                  {k.label}
                </span>
                <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
              </div>
              <p className="text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                {formatVal(k.value, k.unit)}
              </p>
              {hasMeta && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>{pct.toFixed(0)}%</span>
                    <span>Meta: {formatVal(k.meta, k.unit)}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
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
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
            Produção x Vendas (vs Meta)
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
                  <Bar dataKey="value" fill="#15A2EB" radius={[0, 4, 4, 0]} name="Atual" />
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
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
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
                      <stop offset="0%" stopColor="#15A2EB" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#15A2EB" stopOpacity={0} />
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
                    stroke="#15A2EB"
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
        </motion.div>
      </div>
    </div>
  )
}
