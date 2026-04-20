'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { WhatsAppFloatingWidget } from '@/components/WhatsAppFloatingWidget'

type JoinchatConfig = {
  telephone: string
  niche: string
  legacyJoinchatId: string | null
  mode: 'dynamic' | 'legacy' | 'off'
}

/**
 * Join.Chat / WhatsApp widget: prioriza telefone + nicho (cliente ou admin);
 * bundle legado join.chat só se não houver widget dinâmico (evita ícones duplicados).
 */
export function JoinChatWidget() {
  const [cfg, setCfg] = useState<JoinchatConfig | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()

    const load = () => {
      fetch('/api/widget/joinchat-config', { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: JoinchatConfig) => setCfg(d))
        .catch(() => setCfg(null))
    }

    if (typeof window === 'undefined') return

    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => load(), { timeout: 4000 })
      return () => {
        ctrl.abort()
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(load, 1)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [])

  if (!cfg || cfg.mode === 'off') return null

  if (cfg.mode === 'dynamic' && cfg.telephone) {
    return <WhatsAppFloatingWidget telephone={cfg.telephone} niche={cfg.niche} />
  }

  if (cfg.mode === 'legacy' && cfg.legacyJoinchatId) {
    return (
      <Script
        src={`https://cdn.join.chat/bundle/${cfg.legacyJoinchatId}.js`}
        strategy="lazyOnload"
      />
    )
  }

  return null
}
