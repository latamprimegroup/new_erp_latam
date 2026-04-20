'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'
import { ClientKnowledgeFaq } from '@/components/client/ClientKnowledgeFaq'
import { WarRoomOsChecklist } from '@/components/cliente/WarRoomOsChecklist'
import { GamificationLeaderboardTeaser } from '@/components/cliente/GamificationLeaderboardTeaser'

type Kpis = {
  comprasTotal: number
  comprasAprovadas: number
  comprasPendentes: number
  contasDisponiveis: number
}

type BatchRow = {
  monthKey: string
  label: string
  entreguesNoMes: number
  comPeloMenos30Dias: number
  estaveisApos30Dias: number
  pctEstaveis: number | null
}

type PipelineLine = {
  orderId: string
  product: string
  quantity: number
  status: string
  message: string
}

export function ClienteDashboard({
  kpis,
  batchPerformance = [],
  pipelineLines = [],
  landingPackLine = null,
}: {
  kpis: Kpis
  batchPerformance?: BatchRow[]
  pipelineLines?: PipelineLine[]
  landingPackLine?: string | null
}) {
  const { t } = useDashboardI18n()
  const [mainRevealKey, setMainRevealKey] = useState(0)

  useEffect(() => {
    const h = () => setMainRevealKey((k) => k + 1)
    window.addEventListener('welcome-onboarding-complete', h)
    return () => window.removeEventListener('welcome-onboarding-complete', h)
  }, [])

  return (
    <div>
      <WarRoomOsChecklist />

      <GamificationLeaderboardTeaser />

      <motion.div
        key={mainRevealKey}
        initial={mainRevealKey > 0 ? { opacity: 0.4, y: 14 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: 'easeOut' }}
      >
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <h1 className="heading-1 mb-6">{t('dashboard.title')}</h1>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-sm text-gray-500">{t('dashboard.kpi.accountsPurchased')}</p>
          <p className="text-2xl font-bold text-primary-600">{kpis.comprasTotal}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{t('dashboard.kpi.purchasesApproved')}</p>
          <p className="text-2xl font-bold text-green-600">{kpis.comprasAprovadas}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{t('dashboard.kpi.purchasesPending')}</p>
          <p className="text-2xl font-bold text-amber-600">{kpis.comprasPendentes}</p>
          {kpis.comprasPendentes > 0 ? (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
              {pipelineLines.length > 0 ? (
                pipelineLines.map((line) => (
                  <p key={line.orderId} className="text-xs text-gray-400 leading-snug">
                    <span className="text-gray-500">
                      {line.quantity}× {line.product}
                    </span>
                    <br />
                    <span className="text-amber-200/90">{line.message}</span>
                  </p>
                ))
              ) : (
                <p className="text-xs text-gray-500">
                  {t('dashboard.pending.followIn')}{' '}
                  <Link href="/dashboard/cliente/compras" className="text-primary-400 hover:underline">
                    {t('dashboard.pending.myPurchases')}
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : null}
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{t('dashboard.kpi.accountsAvailable')}</p>
          <p className="text-2xl font-bold text-primary-600">{kpis.contasDisponiveis}</p>
        </div>
      </div>

      {batchPerformance.length > 0 ? (
        <div className="card mb-8">
          <h2 className="font-semibold text-lg mb-2">{t('dashboard.batch.title')}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('dashboard.batch.description')}
          </p>
          <ul className="text-sm space-y-2">
            {batchPerformance.map((r) => (
              <li key={r.monthKey}>
                <span className="font-medium capitalize">{r.label}</span>
                {' · '}
                {r.entreguesNoMes}{' '}
                {r.entreguesNoMes !== 1 ? t('dashboard.batch.deliveredPlural') : t('dashboard.batch.delivered')}
                {r.comPeloMenos30Dias > 0 ? (
                  <>
                    {' · '}
                    {r.estaveisApos30Dias}/{r.comPeloMenos30Dias} {t('dashboard.batch.stableAfter30')}
                    {r.pctEstaveis != null ? ` (${r.pctEstaveis}%)` : ''}
                  </>
                ) : (
                  <> · {t('dashboard.batch.waitingWindow')}</>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/cliente/solicitar"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all border-primary-600/10"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.requestTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.requestDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/pesquisar"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.searchTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.searchDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/compras"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.purchasesTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.purchasesDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/contas"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.accountsTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.accountsDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/contestacoes"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.disputesTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.disputesDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/perfil"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.profileTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.profileDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/suporte"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.supportTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.supportDesc')}
          </p>
        </Link>
        <Link
          href="/dashboard/cliente/landing"
          className="card hover:border-primary-600/30 hover:shadow-ads-md transition-all border-primary-600/10"
        >
          <h3 className="font-semibold text-lg mb-2">{t('dashboard.cards.landingTitle')}</h3>
          <p className="text-gray-500 text-sm">
            {t('dashboard.cards.landingDesc')}
          </p>
          {landingPackLine ? (
            <p className="mt-3 text-xs text-emerald-400/90 border-t border-white/10 pt-3 leading-relaxed">
              {t('dashboard.cards.landingStatus')} {landingPackLine}
            </p>
          ) : null}
        </Link>
      </div>

        <ClientKnowledgeFaq />
      </motion.div>
    </div>
  )
}
