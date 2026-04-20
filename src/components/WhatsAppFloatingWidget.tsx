'use client'

import { useCallback } from 'react'

type Props = {
  telephone: string
  niche: string
}

const WA_GREEN = '#25D366'

/**
 * Botão flutuante WhatsApp (equivalente ao fluxo Join.Chat + dataLayer).
 * Carregamento adiado pelo componente pai (idle) para não competir com LCP.
 */
export function WhatsAppFloatingWidget({ telephone, niche }: Props) {
  const waUrl = (() => {
    const msg = `Olá! Gostaria de mais informações sobre ${niche}.`
    const enc = encodeURIComponent(msg)
    const n = telephone.replace(/\D/g, '')
    return `https://wa.me/${n}?text=${enc}`
  })()

  const pushDataLayer = useCallback(() => {
    const w = window as Window & { dataLayer?: unknown[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({
      event: 'whatsapp_click',
      source: 'joinchat',
      contact_method: 'whatsapp',
      timestamp: new Date().toISOString(),
    })
  }, [])

  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Como podemos ajudar?"
      className="fixed bottom-5 right-5 z-[50] flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#25D366]"
      style={{ backgroundColor: WA_GREEN }}
      aria-label="Abrir conversa no WhatsApp"
      onClick={pushDataLayer}
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8 text-white" aria-hidden>
        <path
          fill="currentColor"
          d="M16 3C9.383 3 4 8.383 4 15c0 2.386.672 4.61 1.825 6.5L4 29l7.61-1.975A11.94 11.94 0 0016 27c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 2c5.523 0 10 4.477 10 10 0 2.05-.62 3.96-1.68 5.55l-.11.17-.15.37-1.02 2.65-2.86-.74-.35-.09a8.91 8.91 0 01-4.83 1.41c-4.97 0-9-4.03-9-9s4.03-9 9-9z"
        />
      </svg>
    </a>
  )
}
