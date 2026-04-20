'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FlaskConical, Loader2, Skull, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'
import { LiveProofLabCaseModal } from '@/components/cliente/LiveProofLabCaseModal'

type Item = {
  slug: string
  title: string
  productLabel: string
  nicheLabel: string
  headline: string | null
  status: string
  spend24hBrl: number | null
  spend7dBrl: number | null
  revenue24hBrl: number
  revenue7dBrl: number
  roiNet24hPercent: number | null
  roiNet7dPercent: number | null
  validatedAt: string | null
  graveyardReason: string | null
  graveyardLossBrl: number | null
  gastoTotalBrl: number | null
  cpaMedioBrl: number | null
  roiLiquidoPercent: number | null
  volumeVendas: number | null
  metricsSyncedAt: string | null
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function roiCell(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function CaseCard({
  c,
  t,
  onOpen,
  index,
}: {
  c: Item
  t: (k: string, vars?: Record<string, string | number>) => string
  onOpen: (slug: string) => void
  index: number
}) {
  const invest = c.gastoTotalBrl ?? c.spend7dBrl
  const roiShow = c.roiLiquidoPercent ?? c.roiNet7dPercent
  const showTiago = c.status === 'VALIDADA' || c.status === 'EM_ESCALA'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.25 }}
    >
      <button
        type="button"
        onClick={() => onOpen(c.slug)}
        className="card hover:border-[#00FF00]/35 transition-colors block w-full text-left border border-gray-200 dark:border-white/10 bg-[#0a0a0a]/40 dark:bg-[#0a0a0a]/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-primary-500 font-medium">{c.nicheLabel}</p>
          {showTiago ? (
            <span className="text-[9px] font-bold tracking-wider text-[#00ee00] border border-[#00FF00]/30 rounded px-2 py-0.5 bg-[#00FF00]/10">
              {t('liveProofLabs.badgeValidatedByTiago')}
            </span>
          ) : null}
        </div>
        <h3 className="font-semibold text-lg mt-1 text-gray-900 dark:text-white">{c.title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{c.productLabel}</p>
        {c.headline ? <p className="text-xs text-gray-500 mt-2 italic">{c.headline}</p> : null}

        <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <dt className="text-gray-500 text-[10px] uppercase">{t('liveProofLabs.investimentoInterno')}</dt>
            <dd className="font-semibold text-white mt-0.5">{invest != null ? money(invest) : '—'}</dd>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <dt className="text-gray-500 text-[10px] uppercase">{t('liveProofLabs.roiReal')}</dt>
            <dd className="font-semibold text-[#00FF00] mt-0.5">{roiCell(roiShow)}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-primary-400 mt-3">{t('liveProofLabs.tapForDossier')}</p>
      </button>
    </motion.div>
  )
}

export function LiveProofLabsClient() {
  const { t } = useDashboardI18n()
  const [emTeste, setEmTeste] = useState<Item[]>([])
  const [lighthouse, setLighthouse] = useState<Item[]>([])
  const [graveyard, setGraveyard] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modalSlug, setModalSlug] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cliente/live-proof-labs')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erro')
        setEmTeste(j.emTeste || [])
        setLighthouse(j.lighthouse || j.validated || [])
        setGraveyard(j.graveyard || [])
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  const empty = !loading && !err && emTeste.length === 0 && lighthouse.length === 0 && graveyard.length === 0

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <LiveProofLabCaseModal slug={modalSlug} onClose={() => setModalSlug(null)} />

      <div>
        <h1 className="heading-1 flex items-center gap-2">
          <FlaskConical className="w-8 h-8 text-primary-500" />
          {t('liveProofLabs.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-3xl">{t('liveProofLabs.subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
        </div>
      ) : null}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      {empty ? <p className="text-gray-500 text-sm">{t('liveProofLabs.empty')}</p> : null}

      {emTeste.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            {t('liveProofLabs.sectionEmTeste')}
          </h2>
          <p className="text-sm text-gray-500">{t('liveProofLabs.emTesteIntro')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {emTeste.map((c, i) => (
              <CaseCard key={c.slug} c={c} t={t} onOpen={setModalSlug} index={i} />
            ))}
          </div>
        </section>
      )}

      {lighthouse.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('liveProofLabs.sectionLighthouse')}</h2>
          <p className="text-sm text-gray-500">{t('liveProofLabs.lighthouseIntro')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {lighthouse.map((c, i) => (
              <CaseCard key={c.slug} c={c} t={t} onOpen={setModalSlug} index={i} />
            ))}
          </div>
        </section>
      )}

      {graveyard.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
            <Skull className="w-5 h-5 text-gray-500" />
            {t('liveProofLabs.sectionGraveyard')}
          </h2>
          <p className="text-sm text-gray-500">{t('liveProofLabs.graveyardIntro')}</p>
          <ul className="space-y-3">
            {graveyard.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/dashboard/cliente/live-proof-labs/${encodeURIComponent(c.slug)}`}
                  className="card block hover:border-gray-400/40"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{c.title}</span>
                    {c.graveyardLossBrl != null ? (
                      <span className="text-sm text-red-600 dark:text-red-400">{money(c.graveyardLossBrl)}</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{c.graveyardReason || '—'}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
