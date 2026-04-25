'use client'

type DecoyClickTrackingPayload = {
  source: string
  reason: string
  code: string
  token: string
  checkoutId: string
  listingId: string
}

type DecoyWhatsAppCtaProps = {
  href: string
  tracking: DecoyClickTrackingPayload
}

export function DecoyWhatsAppCta({ href, tracking }: DecoyWhatsAppCtaProps) {
  const handleClick = () => {
    const payload = {
      ...tracking,
      href,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      page: typeof window !== 'undefined' ? window.location.href : '',
      clickedAt: new Date().toISOString(),
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
        navigator.sendBeacon('/api/public/decoy-whatsapp-click', blob)
      } else {
        void fetch('/api/public/decoy-whatsapp-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null)
      }
    } catch {
      // rastreio best-effort; não bloqueia CTA comercial
    }

    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition"
    >
      Chamar no WhatsApp
    </button>
  )
}
