'use client'

import Script from 'next/script'
import { useEffect } from 'react'

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

/**
 * GTM + Rastreamento WhatsApp (melhoria 007)
 * Script GTM no head + evento whatsapp_click no DataLayer
 */
export function GTMProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!GTM_ID) return

    function trackWhatsAppClick(e: MouseEvent) {
      let el = e.target as HTMLElement
      while (el && el !== document.body) {
        if (
          el.tagName === 'A' &&
          el.getAttribute('href') &&
          (el.getAttribute('href')?.includes('wa.me') || el.getAttribute('href')?.includes('api.whatsapp.com'))
        ) {
          window.dataLayer = window.dataLayer || []
          window.dataLayer.push({
            event: 'whatsapp_click',
            contact_method: 'whatsapp',
            source: 'erp',
          })
          break
        }
        el = el.parentElement as HTMLElement
      }
    }

    document.addEventListener('click', trackWhatsAppClick)
    return () => document.removeEventListener('click', trackWhatsAppClick)
  }, [])

  if (!GTM_ID) return <>{children}</>

  return (
    <>
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
          `.trim(),
        }}
      />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="GTM"
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
