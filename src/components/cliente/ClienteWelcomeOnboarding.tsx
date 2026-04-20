'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Package,
  Radio,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  UserCircle2,
  X,
} from 'lucide-react'
import { useDashboardI18n } from '@/contexts/DashboardI18nContext'

function fireConfetti() {
  void import('canvas-confetti').then((mod) => {
    const c = mod.default
    const t = Date.now() + 800
    const tick = () => {
      void c({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#00FF00', '#22c55e', '#ffffff'] })
      void c({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#00FF00', '#22c55e', '#ffffff'] })
      if (Date.now() < t) requestAnimationFrame(tick)
    }
    void c({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.62 },
      colors: ['#00FF00', '#16a34a', '#bbf7d0', '#ffffff'],
    })
    tick()
  })
}

export function ClienteWelcomeOnboarding({ onDimChange }: { onDimChange: (dim: boolean) => void }) {
  const { t } = useDashboardI18n()
  const [loading, setLoading] = useState(true)
  /** Mantém o componente montado até a animação de saída do modal terminar */
  const [flowActive, setFlowActive] = useState(false)
  const [userName, setUserName] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [slide, setSlide] = useState(0)
  const [dir, setDir] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [slideInteracted, setSlideInteracted] = useState(false)

  useEffect(() => {
    fetch('/api/cliente/welcome-onboarding/state')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return
        setUserName(typeof j.userName === 'string' ? j.userName : '')
        setVideoUrl(typeof j.videoUrl === 'string' && j.videoUrl ? j.videoUrl : null)
        if (j.pending) {
          setFlowActive(true)
          setOpen(true)
          onDimChange(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [onDimChange])

  const go = useCallback((next: number, direction: number) => {
    setSlideInteracted(true)
    setDir(direction)
    setSlide(next)
  }, [])

  const finish = useCallback(async () => {
    setFinishing(true)
    try {
      const r = await fetch('/api/cliente/welcome-onboarding/complete', { method: 'POST' })
      if (!r.ok) throw new Error('complete')
      fireConfetti()
      setOpen(false)
    } catch {
      setFinishing(false)
      alert(t('welcomeOnboarding.completeError'))
    }
  }, [onDimChange, t])

  const skip = useCallback(() => {
    void finish()
  }, [finish])

  const onExitComplete = useCallback(() => {
    setFlowActive(false)
    onDimChange(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('welcome-onboarding-complete'))
    }
  }, [onDimChange])

  if (loading || !flowActive) return null

  const pathSteps = [
    { icon: UserCircle2, key: 'identity' as const },
    { icon: Package, key: 'asset' as const },
    { icon: Target, key: 'offer' as const },
    { icon: Shield, key: 'shield' as const },
    { icon: TrendingUp, key: 'scale' as const },
  ]

  const team = [
    { id: 'gustavo', roleKey: 'ops' as const, initial: 'G', color: 'from-sky-500 to-blue-600' },
    { id: 'francielle', roleKey: 'sales' as const, initial: 'F', color: 'from-violet-500 to-fuchsia-600' },
    { id: 'tiago', roleKey: 'strategy' as const, initial: 'T', color: 'from-emerald-500 to-[#00aa00]' },
  ]

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="welcome-onboarding-title"
            className="relative w-full max-w-lg sm:max-w-xl rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-2xl shadow-black/80 overflow-hidden max-h-[min(92vh,720px)] flex flex-col"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <button
              type="button"
              onClick={skip}
              className="absolute top-3 right-3 z-10 p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
              aria-label={t('welcomeOnboarding.skip')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex gap-1 px-6 pt-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${slide >= i ? 'bg-[#00FF00]/80' : 'bg-white/10'}`}
                />
              ))}
            </div>

            <div className="relative flex-1 min-h-0 overflow-hidden px-6 pb-6 pt-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={slide}
                  initial={
                    slide === 0 && !slideInteracted
                      ? false
                      : { x: dir > 0 ? 44 : -44, opacity: 0 }
                  }
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: dir > 0 ? -44 : 44, opacity: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="h-full flex flex-col"
                >
                  {slide === 0 && (
                    <div className="flex flex-col flex-1 min-h-0">
                      <div className="flex items-center gap-2 text-[#00FF00] mb-2">
                        <Sparkles className="w-5 h-5" />
                        <span className="text-xs font-semibold tracking-wider uppercase">
                          {t('welcomeOnboarding.badge')}
                        </span>
                      </div>
                      <h2 id="welcome-onboarding-title" className="text-xl sm:text-2xl font-bold text-white leading-tight">
                        {t('welcomeOnboarding.slide1Title', { name: userName })}
                      </h2>
                      <p className="text-sm text-white/55 mt-2">{t('welcomeOnboarding.slide1Body')}</p>
                      <div className="mt-4 rounded-xl border border-white/10 bg-black/40 overflow-hidden shrink min-h-[160px]">
                        {videoUrl ? (
                          <video
                            className="w-full aspect-video object-cover bg-black"
                            controls
                            playsInline
                            preload="metadata"
                            muted
                            autoPlay
                            src={videoUrl}
                          >
                            {t('welcomeOnboarding.videoFallback')}
                          </video>
                        ) : (
                          <div className="aspect-video flex flex-col items-center justify-center gap-2 p-6 text-center">
                            <Radio className="w-10 h-10 text-white/25" />
                            <p className="text-sm text-white/45">{t('welcomeOnboarding.videoPlaceholder')}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-white/35 mt-2">{t('welcomeOnboarding.videoHint')}</p>
                    </div>
                  )}

                  {slide === 1 && (
                    <div>
                      <h2 className="text-xl font-bold text-white">{t('welcomeOnboarding.slide2Title')}</h2>
                      <p className="text-sm text-white/55 mt-1 mb-4">{t('welcomeOnboarding.slide2Body')}</p>
                      <ul className="space-y-3">
                        {pathSteps.map((s, idx) => {
                          const Icon = s.icon
                          return (
                            <li
                              key={s.key}
                              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00FF00]/15 text-[#00FF00]">
                                <Icon className="w-5 h-5" />
                              </span>
                              <div>
                                <p className="text-sm font-medium text-white">
                                  {idx + 1}. {t(`welcomeOnboarding.pathStep.${s.key}`)}
                                </p>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {slide === 2 && (
                    <div className="flex flex-col flex-1">
                      <h2 className="text-xl font-bold text-white">{t('welcomeOnboarding.slide3Title')}</h2>
                      <p className="text-sm text-white/55 mt-1 mb-4">{t('welcomeOnboarding.slide3Body')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {team.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center"
                          >
                            <div
                              className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white shadow-lg ${m.color}`}
                            >
                              {m.initial}
                            </div>
                            <p className="text-sm font-semibold text-white">
                              {t(`welcomeOnboarding.teamName.${m.id}`)}
                            </p>
                            <p className="text-[11px] text-[#00FF00]/90 mt-0.5">
                              {t(`welcomeOnboarding.teamRole.${m.roleKey}`)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-white/45 mt-4 text-center leading-relaxed">
                        {t('welcomeOnboarding.teamFooter')}
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-white/10 bg-black/30">
              <button
                type="button"
                disabled={slide === 0 || finishing}
                onClick={() => go(slide - 1, -1)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('welcomeOnboarding.back')}
              </button>
              {slide < 2 ? (
                <button
                  type="button"
                  onClick={() => go(slide + 1, 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#00FF00] text-black px-4 py-2 text-sm font-semibold hover:bg-[#33ff33]"
                >
                  {t('welcomeOnboarding.next')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={finishing}
                  onClick={() => void finish()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#00FF00] text-black px-5 py-2.5 text-sm font-bold hover:bg-[#33ff33] disabled:opacity-60"
                >
                  {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('welcomeOnboarding.finish')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
