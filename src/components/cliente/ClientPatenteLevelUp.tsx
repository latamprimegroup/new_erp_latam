'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

type SummaryRank = {
  rankUp?: boolean
  newRankId?: string | null
  previousRankId?: string | null
}

/**
 * Overlay ~3s na primeira deteção de subida de patente (API devolve rankUp).
 */
export function ClientPatenteLevelUp() {
  const { t } = useDashboardI18n()
  const [open, setOpen] = useState(false)
  const [rankId, setRankId] = useState<string | null>(null)
  const shownRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/cliente/gamification/summary')
        const j = (await r.json()) as SummaryRank
        if (cancelled || !r.ok || !j?.rankUp || !j.newRankId) return
        if (shownRef.current) return
        shownRef.current = true
        setRankId(j.newRankId)
        setOpen(true)
        window.setTimeout(() => {
          setOpen(false)
          void fetch('/api/cliente/gamification/ack-rank', { method: 'POST' }).catch(() => {})
        }, 3000)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && rankId ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          role="dialog"
          aria-modal
          aria-labelledby="patente-levelup-title"
        >
          <motion.div
            className="relative mx-4 max-w-lg w-full rounded-2xl border-2 border-[#00FF00]/50 bg-gradient-to-b from-[#0d1a12] to-black p-8 text-center shadow-[0_0_60px_rgba(0,255,0,0.25)]"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 220 }}
          >
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.2, 0.45, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{
                background: 'radial-gradient(circle at 50% 30%, rgba(0,255,0,0.15), transparent 55%)',
              }}
            />
            <Sparkles className="w-12 h-12 mx-auto text-[#00FF00] mb-4 relative z-10" />
            <p id="patente-levelup-title" className="text-xs uppercase tracking-[0.35em] text-[#00FF00]/80 relative z-10">
              {t('gamification.rankUpKicker')}
            </p>
            <motion.p
              className="mt-3 text-3xl sm:text-4xl font-black text-white relative z-10"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            >
              {t(`gamification.patent.${rankId}`)}
            </motion.p>
            <p className="mt-4 text-sm text-white/60 relative z-10">{t('gamification.rankUpSub')}</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
