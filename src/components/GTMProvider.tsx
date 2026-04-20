'use client'

import Script from 'next/script'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { buildGtmHeadInlineScript, normalizeGtmId } from '@/lib/gtm'

const ENV_GTM = normalizeGtmId(process.env.NEXT_PUBLIC_GTM_ID ?? null)

/**
 * GTM + rastreamento WhatsApp → dataLayer (Conversion Engine).
 * ID efetivo: ClientProfile.gtmId (cliente) com fallback NEXT_PUBLIC_GTM_ID (ERP).
 */
export function GTMProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [resolvedGtmId, setResolvedGtmId] = useState<string | null>(ENV_GTM)

  useEffect(() => {
    if (status !== 'authenticated') {
      setResolvedGtmId(ENV_GTM)
      return
    }
    const role = session?.user?.role
    if (role !== 'CLIENT') {
      setResolvedGtmId(ENV_GTM)
      return
    }
    let cancelled = false
    fetch('/api/cliente/perfil')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const fromDb = normalizeGtmId(d?.gtmId)
        setResolvedGtmId(fromDb || ENV_GTM)
      })
      .catch(() => {
        if (!cancelled) setResolvedGtmId(ENV_GTM)
      })
    return () => {
      cancelled = true
    }
  }, [status, session?.user?.role])

  const gtmScript = useMemo(() => {
    const id = resolvedGtmId
    if (!id) return ''
    return buildGtmHeadInlineScript(id)
  }, [resolvedGtmId])

  useEffect(() => {
    function trackWhatsAppClick(e: MouseEvent) {
      const w = window as Window & { dataLayer?: unknown[] }
      w.dataLayer = w.dataLayer || []
      let el = e.target as HTMLElement | null
      while (el && el !== document.body) {
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || ''
          if (href.includes('wa.me') || href.includes('api.whatsapp.com')) {
            w.dataLayer!.push({
              event: 'whatsapp_click',
              contact_method: 'whatsapp',
              timestamp: new Date().toISOString(),
            })
            break
          }
        }
        el = el.parentElement
      }
    }

    document.addEventListener('click', trackWhatsAppClick, true)
    return () => document.removeEventListener('click', trackWhatsAppClick, true)
  }, [])

  if (!resolvedGtmId) {
    return <>{children}</>
  }

  return (
    <>
      <Script
        id="gtm-datalayer-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: 'window.dataLayer=window.dataLayer||[];',
        }}
      />
      <Script
        id={`gtm-script-${resolvedGtmId}`}
        key={resolvedGtmId}
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: gtmScript,
        }}
      />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${resolvedGtmId}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>
      {children}
    </>
  )
}

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}
