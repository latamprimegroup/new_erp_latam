'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type CaseDetail = {
  slug: string
  title: string
  productLabel: string
  nicheLabel: string
  status: string
  gastoTotalBrl: number | null
  spend7dBrl: number | null
  roiLiquidoPercent: number | null
  roiNet7dPercent: number | null
  analysisText: string | null
  summary: string | null
  screenshots: Array<{ imageUrl: string; caption: string | null; capturedAt: string | null }>
}

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function LiveProofLabCaseModal({
  slug,
  onClose,
}: {
  slug: string | null
  onClose: () => void
}) {
  const { t, formatDateTime } = useDashboardI18n()
  const [c, setC] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setC(null)
      setErr(null)
      return
    }
    setLoading(true)
    setErr(null)
    fetch(`/api/cliente/live-proof-labs/${encodeURIComponent(slug)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erro')
        setC(j.case as CaseDetail)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [slug])

  const showTiagoBadge = c?.status === 'VALIDADA' || c?.status === 'EM_ESCALA'
  const invest = c?.gastoTotalBrl ?? c?.spend7dBrl ?? null
  const roi = c?.roiLiquidoPercent ?? c?.roiNet7dPercent ?? null

  return (
    <AnimatePresence>
      {slug ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="lpl-modal-title"
            className="w-full max-h-[92vh] sm:max-h-[90vh] sm:max-w-lg md:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden flex flex-col"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                {loading ? (
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('liveProofLabs.modalLoading')}
                  </div>
                ) : c ? (
                  <>
                    <p className="text-[10px] uppercase tracking-wider text-primary-400 font-medium">{c.nicheLabel}</p>
                    <h2 id="lpl-modal-title" className="text-lg font-semibold text-white truncate pr-2">
                      {c.title}
                    </h2>
                    <p className="text-sm text-white/55 mt-0.5">{c.productLabel}</p>
                  </>
                ) : (
                  <p className="text-red-300 text-sm">{err || '—'}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white shrink-0"
                aria-label={t('liveProofLabs.modalClose')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {c && !loading ? (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    {showTiagoBadge ? (
                      <span className="inline-flex items-center rounded-full border border-[#00FF00]/40 bg-[#00FF00]/10 px-3 py-1 text-[11px] font-bold tracking-wide text-[#00FF00]">
                        {t('liveProofLabs.badgeValidatedByTiago')}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <p className="text-[10px] uppercase text-white/40">{t('liveProofLabs.investimentoInterno')}</p>
                      <p className="text-lg font-semibold text-white mt-1">{invest != null ? money(invest) : '—'}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <p className="text-[10px] uppercase text-white/40">{t('liveProofLabs.roiReal')}</p>
                      <p className="text-lg font-semibold text-[#00FF00] mt-1">
                        {roi != null ? `${roi.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-white mb-2">{t('liveProofLabs.strategistNote')}</p>
                    <p className="text-sm text-white/70 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 min-h-[80px]">
                      {c.analysisText || c.summary || t('liveProofLabs.strategistNoteEmpty')}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-white mb-2">{t('liveProofLabs.proofGallery')}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {c.screenshots.length === 0 ? (
                        <div className="col-span-full aspect-video rounded-lg border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-xs text-white/40">
                          {t('liveProofLabs.placeholderPrints')}
                        </div>
                      ) : (
                        c.screenshots.map((s, i) => (
                          <figure key={i} className="rounded-lg border border-white/10 overflow-hidden bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s.imageUrl}
                              alt={s.caption || `Print ${i + 1}`}
                              className="w-full h-40 object-contain"
                            />
                            <figcaption className="text-[10px] text-white/50 px-2 py-1.5 border-t border-white/10">
                              {s.caption ||
                                (s.capturedAt ? formatDateTime(s.capturedAt) : `${t('liveProofLabs.print')} ${i + 1}`)}
                            </figcaption>
                          </figure>
                        ))
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/cliente/live-proof-labs/${encodeURIComponent(c.slug)}`}
                    onClick={onClose}
                    className="block w-full text-center rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium py-3 transition-colors"
                  >
                    {t('liveProofLabs.openFullDossier')}
                  </Link>
                </>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
